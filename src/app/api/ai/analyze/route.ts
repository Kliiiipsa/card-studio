import { parseBody, ok, fail } from "@/lib/api";
import { analyzeRequestSchema } from "@/core/ai/schemas";
import { analyzeProductCard } from "@/core/ai/service";
import { validateDataUrl } from "@/lib/image-validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, analyzeRequestSchema);
    validateDataUrl(body.imageDataUrl);
    const report = await analyzeProductCard(body.imageDataUrl, body.product, body.concern);
    return ok(report);
  } catch (err) {
    return fail(err);
  }
}
