import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { createJob, jobsEnabled } from "@/core/jobs/jobs";
import { ensureWatcherBoot, watchJob } from "@/core/jobs/watcher";
import { persistGeneration } from "@/core/jobs/persist";
import { uid } from "@/lib/utils";
import { infographicGenerateSchema } from "@/core/infographics/schemas";
import {
  submitInfographicBase,
  generateInfographicFallback,
  type InfographicBaseArgs,
} from "@/core/infographics/infographic-service";
import type { InfographicBrief } from "@/core/infographics/types";
import { validateDataUrl } from "@/lib/image-validation";
import { readFalBalance, settleFalCostInBackground, falJobsInFlight } from "@/core/ai/fal-cost";

export const runtime = "nodejs";
// This route no longer waits for the (multi-minute) gpt-image generation: it only
// SUBMITS the job and returns a handle the client polls via /generate/status. The
// only synchronous work here is the fast Flux path (mock/Flux base, or the forced
// fallback), which stays well under any serverless function timeout.
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    // affordability is checked up-front; the actual charge happens only when a
    // base is successfully produced (sync paths below, async — in /status)
    const bill = await requireSparks(req, "infographic");
    const body = await parseBody(req, infographicGenerateSchema);
    if (body.productImage?.startsWith("data:")) validateDataUrl(body.productImage);
    if (body.styleReferenceImage?.startsWith("data:")) validateDataUrl(body.styleReferenceImage);
    const brief = body.brief as unknown as InfographicBrief;
    /**
     * Что кладём в задачу для разбора жалоб («Генерации» в админке): что
     * человек заполнил и выбрал, прикладывал ли фото/референс и какой промпт
     * реально ушёл в модель. Сами изображения НЕ сохраняем.
     */
    const debug = {
      userInput: body.userInput,
      hasProductPhoto: Boolean(body.productImage),
      hasStyleReference: Boolean(body.styleReferenceImage),
      imagePrompt: brief.imagePrompt?.slice(0, 2000),
      styleProfileName: brief.styleProfile?.name,
      styleProfileSource: brief.styleProfile?.source,
    };
    const args: InfographicBaseArgs = {
      brief,
      productImage: body.productImage,
      styleReferenceImage: body.styleReferenceImage,
      productName: body.productName,
      aspectRatio: body.aspectRatio,
      variantSeed: body.variantSeed,
      keepBackground: body.keepBackground,
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
        email: bill.email,
        kind: "infographic",
        sourceUrl: baseImageUrl,
        payload: { brief, textBaked, ...debug, fallback: true },
      });
      settleFalCostInBackground(cardId, falBalanceBefore, { concurrentAtStart });
      const balance = await chargeSparks(bill);
      return ok({
        done: true,
        baseImageUrl: finalUrl,
        overlayPlan: brief.overlayPlan,
        brief,
        textBaked,
        balance: balance ?? undefined,
      });
    }

    const result = await submitInfographicBase(args);
    if (result.kind === "done") {
      // fast provider (mock/Flux) finished inline
      const cardId = uid("card");
      const finalUrl = await persistGeneration({
        id: cardId,
        email: bill.email,
        kind: "infographic",
        sourceUrl: result.baseImageUrl,
        payload: { brief, textBaked: result.textBaked, ...debug },
      });
      settleFalCostInBackground(cardId, falBalanceBefore, { concurrentAtStart });
      const balance = await chargeSparks(bill);
      return ok({
        done: true,
        baseImageUrl: finalUrl,
        overlayPlan: brief.overlayPlan,
        brief,
        textBaked: result.textBaked,
        balance: balance ?? undefined,
      });
    }
    // Queued async job (gpt-image). When Postgres is available the job is also
    // tracked server-side: the watcher finishes it even if the tab closes, so
    // the client polls /api/jobs/{id}. Legacy `job` handle kept for old tabs.
    let jobId: string | undefined;
    if (jobsEnabled()) {
      ensureWatcherBoot();
      jobId = uid("job");
      await createJob({
        id: jobId,
        email: bill.email,
        kind: "infographic",
        payload: { brief, textBaked: result.textBaked, ...debug },
        falStatusUrl: result.job.statusUrl,
        falResponseUrl: result.job.responseUrl,
      });
      watchJob({
        id: jobId,
        email: bill.email,
        falStatusUrl: result.job.statusUrl,
        falResponseUrl: result.job.responseUrl,
        falBalanceBefore,
        concurrentAtStart,
      });
    }
    return ok({
      done: false,
      jobId,
      job: result.job,
      overlayPlan: brief.overlayPlan,
      brief,
      textBaked: result.textBaked,
    });
  } catch (err) {
    return fail(err);
  }
}
