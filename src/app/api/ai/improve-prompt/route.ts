import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { improvePromptRequestSchema } from "@/core/ai/schemas";
import { improveUserPrompt } from "@/core/ai/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "improve_prompt");
    const body = await parseBody(req, improvePromptRequestSchema);
    const prompt = await improveUserPrompt(body);
    const balance = await chargeSparks(bill);
    return ok({ ...{ prompt }, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
