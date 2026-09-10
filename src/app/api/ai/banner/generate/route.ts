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
import { sessionFromRequest } from "@/core/auth/session";
import { validateDataUrl } from "@/lib/image-validation";
import { persistSourcePhoto } from "@/core/storage/source-photo";
import { readFalBalance, settleFalCostInBackground, falJobsInFlight } from "@/core/ai/fal-cost";
import { bannerGenerateSchema } from "@/core/banners/schemas";
import { bannersEnabled, submitBannerBase } from "@/core/banners/banner-service";

export const runtime = "nodejs";
// Роут только СТАВИТ задачу в очередь fal и отдаёт handle — ждать многоминутную
// генерацию здесь нельзя (тот же приём, что в инфографике).
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await acquireGenerationSlot())) return fail(new AppError(GEN_BUSY_MESSAGE, 503));
  try {
    const session = await sessionFromRequest(req);
    if (!bannersEnabled(session?.role)) {
      throw new AppError("Раздел ещё не открыт.", 403);
    }

    const body = await parseBody(req, bannerGenerateSchema);
    if (body.productImage?.startsWith("data:")) validateDataUrl(body.productImage);

    const tracked = jobsEnabled();
    const jobId = uid("job");
    // резерв ДО обращения к fal — параллельные запросы не сожгут баланс
    const bill = await reserveSparks(req, "banner", jobChargeRef(jobId));
    let handedOff = false;
    try {
      const sourceUrl = await persistSourcePhoto(body.productImage, jobId);
      const concurrentAtStart = falJobsInFlight();
      const falBalanceBefore = await readFalBalance();

      const result = await submitBannerBase({
        creativeType: body.creativeType,
        format: body.format,
        look: body.look,
        subject: body.subject,
        headline: body.headline,
        subheadline: body.subheadline,
        price: body.price,
        oldPrice: body.oldPrice,
        cta: body.cta,
        phone: body.phone,
        site: body.site,
        productImage: body.productImage,
        logoCorner: body.logoCorner,
      });

      /**
       * Снимок для разбора жалоб («Генерации» в админке).
       * ТЕЛЕФОН СЮДА НЕ КЛАДЁМ: для разбора он не нужен, а это личный контакт
       * клиента — незачем держать его в журнале. В промпте он есть по делу,
       * но промпт мы режем до 2000 символов и телефон из него вычищаем.
       */
      const debug = {
        subject: body.subject,
        headline: body.headline,
        subheadline: body.subheadline,
        creativeType: body.creativeType,
        format: body.format,
        look: body.look,
        width: result.width,
        height: result.height,
        hasProductPhoto: Boolean(body.productImage),
        hasLogo: Boolean(body.logoCorner),
        hasPhone: Boolean(body.phone),
        imagePrompt: redactPhone(result.prompt, body.phone).slice(0, 2000),
        userInput: {
          benefit: body.benefit,
          price: body.price,
          oldPrice: body.oldPrice,
          cta: body.cta,
          site: body.site,
        },
        sourceUrl,
      };

      if (result.kind === "done") {
        const cardId = uid("card");
        const finalUrl = await persistGeneration({
          id: cardId,
          email: bill.ctx.email,
          kind: "banner",
          sourceUrl: result.imageUrl,
          payload: debug,
        });
        settleFalCostInBackground(cardId, falBalanceBefore, { concurrentAtStart });
        return ok({
          done: true,
          imageUrl: finalUrl,
          width: result.width,
          height: result.height,
          balance: bill.balance ?? undefined,
        });
      }

      if (tracked) {
        ensureWatcherBoot();
        await createJob({
          id: jobId,
          email: bill.ctx.email,
          kind: "banner",
          payload: debug,
          falStatusUrl: result.job.statusUrl,
          falResponseUrl: result.job.responseUrl,
        });
        watchJob({
          id: jobId,
          email: bill.ctx.email,
          kind: "banner",
          falStatusUrl: result.job.statusUrl,
          falResponseUrl: result.job.responseUrl,
          falBalanceBefore,
          concurrentAtStart,
        });
        // дальше возврат генов при неудаче — на watcher'е (по jobChargeRef)
        handedOff = true;
      }

      return ok({
        done: false,
        jobId: tracked ? jobId : undefined,
        job: result.job,
        width: result.width,
        height: result.height,
        balance: bill.balance ?? undefined,
      });
    } catch (err) {
      if (!handedOff) await refundReservation(bill).catch(() => undefined);
      throw err;
    }
  } catch (err) {
    return fail(err);
  } finally {
    releaseGenerationSlot();
  }
}

/** Вырезает телефон из сохраняемого промпта — в журнале ему не место. */
function redactPhone(prompt: string, phone?: string): string {
  if (!phone?.trim()) return prompt;
  return prompt.split(phone.trim()).join("<телефон скрыт>");
}
