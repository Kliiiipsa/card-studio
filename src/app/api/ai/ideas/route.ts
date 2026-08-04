import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { ideasRequestSchema } from "@/core/ai/schemas";
import { generateCardIdeas } from "@/core/ai/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "ideas");
    const body = await parseBody(req, ideasRequestSchema);
    const ideas = await generateCardIdeas(body.product);
    const balance = await chargeSparks(bill);
    return ok({ ...{ ideas }, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
