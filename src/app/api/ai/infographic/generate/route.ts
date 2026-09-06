import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import {
  acquireGenerationSlot,
  releaseGenerationSlot,
  GEN_BUSY_MESSAGE,
} from "@/lib/concurrency-gate";
import { reserveSparks, refundReservation, jobChargeRef } from "@/core/billing/api";
import { createJob, jobsEnabled } from "@/core/jobs/jobs";
import { ensureWatcherBoot, watchJob } from "@/core/jobs/watcher";
import { persistGeneration } from "@/core/jobs/persist";
import { uid } from "@/lib/utils";
import { infographicGenerateSchema } from "@/core/infographics/schemas";
import {
  submitInfographicBase,
  generateInfographicFallback,
  adaptiveScenesEnabled,
  type InfographicBaseArgs,
} from "@/core/infographics/infographic-service";
import { sessionFromRequest } from "@/core/auth/session";
import type { InfographicBrief } from "@/core/infographics/types";
import { validateDataUrl } from "@/lib/image-validation";
import { persistSourcePhoto } from "@/core/storage/source-photo";
import { readFalBalance, settleFalCostInBackground, falJobsInFlight } from "@/core/ai/fal-cost";

export const runtime = "nodejs";
// This route no longer waits for the (multi-minute) gpt-image generation: it only
// SUBMITS the job and returns a handle the client polls via /generate/status. The
// only synchronous work here is the fast Flux path (mock/Flux base, or the forced
// fallback), which stays well under any serverless function timeout.
export const maxDuration = 120;

export async function POST(req: Request) {
  // клапан нагрузки (см. generate/image): подождать слот, а не свалить сервер
  if (!(await acquireGenerationSlot())) return fail(new AppError(GEN_BUSY_MESSAGE, 503));
  try {
    const body = await parseBody(req, infographicGenerateSchema);
    if (body.productImage?.startsWith("data:")) validateDataUrl(body.productImage);
    if (body.styleReferenceImage?.startsWith("data:")) validateDataUrl(body.styleReferenceImage);

    const tracked = jobsEnabled();
    const jobId = uid("job");
    // РЕЗЕРВ до вызова fal (ключ по jobId для возврата watcher'ом при неудаче):
    // параллельные запросы одного аккаунта не сожгут баланс fal.
    const bill = await reserveSparks(req, "infographic", jobChargeRef(jobId));
    let handedOff = false;
    try {
    const brief = body.brief as unknown as InfographicBrief;
    /**
     * Что кладём в задачу для разбора жалоб («Генерации» в админке): что
     * человек заполнил и выбрал, какой промпт реально ушёл в модель и
     * исходное фото товара (sources/<jobId>, решение 2026-09-06). Референс
     * стиля не храним — это чужая карточка.
     */
    const sourceUrl = await persistSourcePhoto(body.productImage, jobId);
    // превью адаптивных сцен: только админ (или env-раскатка INFOGRAPHIC_ADAPTIVE=all)
    const session = await sessionFromRequest(req);
    const previewAdaptive = adaptiveScenesEnabled(session?.role);
    const debug = {
      userInput: body.userInput,
      hasProductPhoto: Boolean(body.productImage),
      hasStyleReference: Boolean(body.styleReferenceImage),
      imagePrompt: brief.imagePrompt?.slice(0, 2000),
      styleProfileName: brief.styleProfile?.name,
      styleProfileSource: brief.styleProfile?.source,
      adaptivePreview: previewAdaptive || undefined,
      keepBackground: body.keepBackground,
      sourceUrl,
    };
    const args: InfographicBaseArgs = {
      brief,
      productImage: body.productImage,
      styleReferenceImage: body.styleReferenceImage,
      productName: body.productName,
      aspectRatio: body.aspectRatio,
      variantSeed: body.variantSeed,
      keepBackground: body.keepBackground,
      previewAdaptive,
    };

    // остаток fal до работы — по разнице после посчитаем реальную себестоимость
    const concurrentAtStart = falJobsInFlight();
    const falBalanceBefore = await readFalBalance();

    // Client asks for the Flux fallback after a queued gpt-image job failed.
    if (body.forceFallback) {
      const { baseImageUrl, textBaked } = await generateInfographicFallback(args);
      const cardId = uid("card");
      const finalUrl = await persistGeneration({
        id: cardId,
        email: bill.ctx.email,
        kind: "infographic",
        sourceUrl: baseImageUrl,
        payload: { brief, textBaked, ...debug, fallback: true },
      });
      settleFalCostInBackground(cardId, falBalanceBefore, { concurrentAtStart });
      return ok({
        done: true,
        baseImageUrl: finalUrl,
        overlayPlan: brief.overlayPlan,
        brief,
        textBaked,
        balance: bill.balance ?? undefined,
      });
    }

    const result = await submitInfographicBase(args);
    if (result.kind === "done") {
      // fast provider (mock/Flux) finished inline
      const cardId = uid("card");
      const finalUrl = await persistGeneration({
        id: cardId,
        email: bill.ctx.email,
        kind: "infographic",
        sourceUrl: result.baseImageUrl,
        payload: { brief, textBaked: result.textBaked, ...debug },
      });
      settleFalCostInBackground(cardId, falBalanceBefore, { concurrentAtStart });
      return ok({
        done: true,
        baseImageUrl: finalUrl,
        overlayPlan: brief.overlayPlan,
        brief,
        textBaked: result.textBaked,
        balance: bill.balance ?? undefined,
      });
    }
    // Queued async job (gpt-image). When Postgres is available the job is also
    // tracked server-side: the watcher finishes it even if the tab closes, so
    // the client polls /api/jobs/{id}. Legacy `job` handle kept for old tabs.
    if (tracked) {
      ensureWatcherBoot();
      await createJob({
        id: jobId,
        email: bill.ctx.email,
        kind: "infographic",
        payload: { brief, textBaked: result.textBaked, ...debug },
        falStatusUrl: result.job.statusUrl,
        falResponseUrl: result.job.responseUrl,
      });
      watchJob({
        id: jobId,
        email: bill.ctx.email,
        falStatusUrl: result.job.statusUrl,
        falResponseUrl: result.job.responseUrl,
        falBalanceBefore,
        concurrentAtStart,
      });
      // дальше возврат при неудаче — на watcher'е (по jobChargeRef)
      handedOff = true;
    }
    return ok({
      done: false,
      jobId: tracked ? jobId : undefined,
      job: result.job,
      overlayPlan: brief.overlayPlan,
      brief,
      textBaked: result.textBaked,
      balance: bill.balance ?? undefined,
    });
    } catch (err) {
      // ошибка ДО постановки async-задачи — возвращаем зарезервированные гены
      if (!handedOff) await refundReservation(bill).catch(() => undefined);
      throw err;
    }
  } catch (err) {
    return fail(err);
  } finally {
    releaseGenerationSlot();
  }
}
