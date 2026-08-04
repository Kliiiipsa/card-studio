import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { analyzeRequestSchema } from "@/core/ai/schemas";
import { analyzeProductCard } from "@/core/ai/service";
import { validateDataUrl } from "@/lib/image-validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "analyze");
    const body = await parseBody(req, analyzeRequestSchema);
    validateDataUrl(body.imageDataUrl);
    const report = await analyzeProductCard(body.imageDataUrl, body.product, body.concern);
    const balance = await chargeSparks(bill);
    return ok({ ...report, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
