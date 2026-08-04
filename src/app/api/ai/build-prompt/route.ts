import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { buildPromptRequestSchema } from "@/core/ai/schemas";
import { generatePromptForImageModel } from "@/core/ai/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "build_prompt");
    const body = await parseBody(req, buildPromptRequestSchema);
    const structured = await generatePromptForImageModel(body);
    const balance = await chargeSparks(bill);
    return ok({ ...structured, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
