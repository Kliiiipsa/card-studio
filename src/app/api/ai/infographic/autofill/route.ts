import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { autofillSchema } from "@/core/infographics/schemas";
import { autofillFromImage } from "@/core/infographics/infographic-service";
import { validateDataUrl } from "@/lib/image-validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "autofill");
    const body = await parseBody(req, autofillSchema);
    if (body.imageDataUrl.startsWith("data:")) validateDataUrl(body.imageDataUrl);
    const result = await autofillFromImage(body);
    const balance = await chargeSparks(bill);
    return ok({ ...result, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
