import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import {
  adminReferralSummary,
  referralStats,
  referralsEnabled,
  reverseForPayment,
} from "@/core/referrals/referrals";
import { getUser } from "@/core/auth/store-pg";
import { REFERRAL } from "@/core/billing/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Без параметров — кто кого привёл и сколько на этом заработал (вкладка
 * «Отчёты»). С `?email=` — ссылка конкретного аккаунта: раздел закрыт гейтом,
 * и сам человек свою ссылку пока получить не может, а поддержке выдать её
 * нужно. Несуществующий аккаунт отклоняем: код, выданный на опечатку, тихо
 * уведёт чужие начисления в никуда.
 */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!referralsEnabled()) return ok({ rows: [], totals: null });

    const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
    if (email) {
      const user = await getUser(email);
      if (!user) throw new AppError(`Аккаунта ${email} нет — проверьте адрес.`, 404);
      const stats = await referralStats(user.email);
      if (!stats) throw new AppError("Не удалось выдать ссылку.", 500);
      return ok({ ...stats, email: user.email, role: user.role, reward: REFERRAL });
    }

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
