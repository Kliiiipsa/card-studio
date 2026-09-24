import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import {
  adminReferralSummary,
  referralsEnabled,
  reverseForPayment,
} from "@/core/referrals/referrals";
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

/**
 * Откат реферальных начислений по возвращённому платежу.
 * Тело: { paymentId: "2f0c…" } — id платежа ЮKassa, за который вернули деньги.
 * Возвраты ручные, поэтому и откат ручной: владелец вызывает его после того,
 * как вернул деньги в кабинете ЮKassa.
 */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!referralsEnabled()) throw new AppError("Программа недоступна.", 503);
    const body = (await req.json().catch(() => ({}))) as { paymentId?: string };
    const paymentId = body.paymentId?.trim();
    if (!paymentId) throw new AppError("Укажите paymentId платежа ЮKassa.", 400);
    const result = await reverseForPayment(paymentId);
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
