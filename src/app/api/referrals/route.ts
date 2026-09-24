import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { referralsEnabled, referralStats } from "@/core/referrals/referrals";
import { REFERRAL } from "@/core/billing/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ссылка и статистика приглашений для страницы «Пригласить друга». */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    if (!referralsEnabled()) throw new AppError("Программа пока недоступна.", 503);
    const stats = await referralStats(session.email);
    if (!stats) throw new AppError("Не удалось получить ссылку.", 500);
    return ok({ ...stats, reward: REFERRAL });
  } catch (err) {
    return fail(err);
  }
}
