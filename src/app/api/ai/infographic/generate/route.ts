import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { createJob, jobsEnabled } from "@/core/jobs/jobs";
import { ensureWatcherBoot, watchJob } from "@/core/jobs/watcher";
import { uid } from "@/lib/utils";
import { infographicGenerateSchema } from "@/core/infographics/schemas";
import {
  submitInfographicBase,
  generateInfographicFallback,
  type InfographicBaseArgs,
} from "@/core/infographics/infographic-service";
import type { InfographicBrief } from "@/core/infographics/types";
import { validateDataUrl } from "@/lib/image-validation";

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
    const args: InfographicBaseArgs = {
      brief,
      productImage: body.productImage,
      styleReferenceImage: body.styleReferenceImage,
      productName: body.productName,
      aspectRatio: body.aspectRatio,
      variantSeed: body.variantSeed,
    };

    // Client asks for the Flux fallback after a queued gpt-image job failed.
    if (body.forceFallback) {
      const { baseImageUrl, textBaked } = await generateInfographicFallback(args);
      const balance = await chargeSparks(bill);
      return ok({
        done: true,
        baseImageUrl,
        overlayPlan: brief.overlayPlan,
        brief,
        textBaked,
        balance: balance ?? undefined,
      });
    }

    const result = await submitInfographicBase(args);
    if (result.kind === "done") {
      // fast provider (mock/Flux) finished inline
      const balance = await chargeSparks(bill);
      return ok({
        done: true,
        baseImageUrl: result.baseImageUrl,
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
        payload: { brief, textBaked: result.textBaked },
        falStatusUrl: result.job.statusUrl,
        falResponseUrl: result.job.responseUrl,
      });
      watchJob({
        id: jobId,
        email: bill.email,
        falStatusUrl: result.job.statusUrl,
        falResponseUrl: result.job.responseUrl,
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
