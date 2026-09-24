import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, estimateRefund } from "@/core/billing/billing";
import { processRefund } from "@/core/billing/refund";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Расчёт возврата по почте — предпросмотр перед списанием. */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!billingEnabled()) throw new AppError("Биллинг не настроен.", 503);
    const email = new URL(req.url).searchParams.get("email")?.trim();
    if (!email) throw new AppError("Укажите email.", 400);
    return ok(await estimateRefund(email));
  } catch (err) {
    return fail(err);
  }
}

/**
 * Оформить возврат в учёте: аннулировать остаток генов и откатить реферальные
 * начисления. Деньги владелец возвращает отдельно, в кабинете ЮKassa.
 *
 * Тело: { email, paymentId?, amountRub?, comment?, confirm: true }
 * confirm обязателен: операция обнуляет баланс человека и отменяется только
 * ручным начислением обратно.
 */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!billingEnabled()) throw new AppError("Биллинг не настроен.", 503);
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      paymentId?: string;
      amountRub?: number;
      comment?: string;
      confirm?: boolean;
    };
    const email = body.email?.trim();
    if (!email) throw new AppError("Укажите email.", 400);
    if (body.confirm !== true) {
      throw new AppError("Операция обнуляет баланс — передайте confirm: true.", 400);
    }
    const result = await processRefund({
      email,
      paymentId: body.paymentId?.trim() || undefined,
      amountRub: body.amountRub,
      comment: body.comment?.trim() || undefined,
    });
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
