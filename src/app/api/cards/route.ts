import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { jobsEnabled, listCompleted } from "@/core/jobs/jobs";

export const runtime = "nodejs";

/** «Мои карточки»: every completed generation of the account, newest first. */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    if (!jobsEnabled()) return ok({ cards: [] });
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") ?? undefined;
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
    const jobs = await listCompleted({ email: session.email, kind, limit: 60, offset });
    return ok({
      // turnkey parents are progress containers — their items are already
      // recorded individually as infographic/generator cards
      cards: jobs.filter((j) => j.kind !== "turnkey").map((j) => {
        const payload = (j.payload ?? {}) as {
          brief?: { headline?: string };
          prompt?: string;
          cardText?: string;
          productName?: string;
        };
        return {
          id: j.id,
          kind: j.kind,
          url: j.resultUrl,
          title:
            payload.brief?.headline ||
            payload.cardText ||
            payload.productName ||
            payload.prompt?.slice(0, 60) ||
            null,
          createdAt: j.createdAt,
        };
      }),
    });
  } catch (err) {
    return fail(err);
  }
}
