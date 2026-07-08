import { parseBody, ok, fail } from "@/lib/api";
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
    };

    // Client asks for the Flux fallback after a queued gpt-image job failed.
    if (body.forceFallback) {
      const { baseImageUrl, textBaked } = await generateInfographicFallback(args);
      return ok({ done: true, baseImageUrl, overlayPlan: brief.overlayPlan, brief, textBaked });
    }

    const result = await submitInfographicBase(args);
    if (result.kind === "done") {
      // fast provider (mock/Flux) finished inline
      return ok({
        done: true,
        baseImageUrl: result.baseImageUrl,
        overlayPlan: brief.overlayPlan,
        brief,
        textBaked: result.textBaked,
      });
    }
    // queued async job (gpt-image): client polls /generate/status with `job`
    return ok({
      done: false,
      job: result.job,
      overlayPlan: brief.overlayPlan,
      brief,
      textBaked: result.textBaked,
    });
  } catch (err) {
    return fail(err);
  }
}
