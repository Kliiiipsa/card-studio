import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { briefRequestSchema } from "@/core/infographics/schemas";
import {
  buildInfographicBrief,
  adaptiveScenesEnabled,
} from "@/core/infographics/infographic-service";
import { sessionFromRequest } from "@/core/auth/session";
import type { InfographicInput, StyleProfile } from "@/core/infographics/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "brief");
    const { styleProfile, ...input } = await parseBody(req, briefRequestSchema);
    // превью адаптивных сцен: у админа vision дополнительно вернёт art-дирекшн
    const session = await sessionFromRequest(req);
    const brief = await buildInfographicBrief(
      input as InfographicInput,
      styleProfile as StyleProfile | undefined,
      { adaptiveArt: adaptiveScenesEnabled(session?.role) },
    );
    const balance = await chargeSparks(bill);
    return ok({ ...brief, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
