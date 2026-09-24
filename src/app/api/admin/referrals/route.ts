import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { adminReferralSummary, referralsEnabled } from "@/core/referrals/referrals";
import { REFERRAL } from "@/core/billing/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Кто кого привёл и сколько на этом заработал — для вкладки «Отчёты». */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!referralsEnabled()) return ok({ rows: [], totals: null });
    const summary = await adminReferralSummary();
    return ok({ ...summary, reward: REFERRAL });
  } catch (err) {
    return fail(err);
  }
}
