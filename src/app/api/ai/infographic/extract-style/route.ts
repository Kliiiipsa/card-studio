import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { extractStyleSchema } from "@/core/infographics/schemas";
import { extractStyleProfile } from "@/core/infographics/infographic-service";
import { validateDataUrl } from "@/lib/image-validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "extract_style");
    const body = await parseBody(req, extractStyleSchema);
    if (body.referenceImageDataUrl.startsWith("data:")) validateDataUrl(body.referenceImageDataUrl);
    const profile = await extractStyleProfile(body.referenceImageDataUrl);
    const balance = await chargeSparks(bill);
    return ok({ ...profile, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
