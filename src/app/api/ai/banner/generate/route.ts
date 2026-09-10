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
// генерацию здесь нельзя (см. тот же приём в инфографике).
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
        productName: body.productName,
        headline: body.headline,
        subheadline: body.subheadline,
        look: body.look,
        format: body.format,
        productImage: body.productImage,
        reserveBand: body.reserveBand,
      });

      /** что показать в админке («Генерации») при разборе жалобы */
      const debug = {
        productName: body.productName,
        headline: body.headline,
        subheadline: body.subheadline,
        look: body.look,
        format: body.format,
        width: result.width,
        height: result.height,
        hasProductPhoto: Boolean(body.productImage),
        reserveBand: body.reserveBand,
        imagePrompt: result.prompt.slice(0, 2000),
        userInput: body.userInput,
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
