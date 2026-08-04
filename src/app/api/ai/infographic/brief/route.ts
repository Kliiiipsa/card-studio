import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { briefRequestSchema } from "@/core/infographics/schemas";
import { buildInfographicBrief } from "@/core/infographics/infographic-service";
import type { InfographicInput, StyleProfile } from "@/core/infographics/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "brief");
    const { styleProfile, ...input } = await parseBody(req, briefRequestSchema);
    const brief = await buildInfographicBrief(
      input as InfographicInput,
      styleProfile as StyleProfile | undefined,
    );
    const balance = await chargeSparks(bill);
    return ok({ ...brief, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
