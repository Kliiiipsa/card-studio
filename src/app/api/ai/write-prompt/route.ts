import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { writePromptRequestSchema } from "@/core/ai/schemas";
import { writePrompt } from "@/core/ai/service";
import { validateDataUrl } from "@/lib/image-validation";
import { photoFixEnabled } from "@/core/ai/photo-fix";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "write_prompt");
    const body = await parseBody(req, writePromptRequestSchema);
    if (body.referenceImageDataUrl?.startsWith("data:")) {
      validateDataUrl(body.referenceImageDataUrl);
    }
    const result = await writePrompt({ ...body, photoFix: photoFixEnabled(bill.role) });
    const balance = await chargeSparks(bill);
    return ok({ ...result, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
