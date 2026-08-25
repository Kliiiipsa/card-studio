import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, getBalance } from "@/core/billing/billing";
import { yookassaConfigured } from "@/core/billing/yookassa";
import { verifyAndCredit } from "@/core/billing/yookassa-credit";

export const runtime = "nodejs";

const schema = z.object({ paymentId: z.string().min(1).max(64) });

/**
 * Called by the billing page when the user returns from the ЮKassa payment
 * page. Re-fetches the payment with our credentials and credits the sparks
 * (idempotent — the webhook may have done it already).
 */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    if (!billingEnabled() || !yookassaConfigured()) {
      throw new AppError("Оплата не настроена.", 503);
    }

    const { paymentId } = await parseBody(req, schema);
    const { payment, sparksTotal } = await verifyAndCredit(paymentId);

    // Баланс отдаём для текущего пользователя (платёж мог быть оплачен
    // с другого аккаунта — гены в любом случае ушли на email из платежа).
    const balance = await getBalance(session.email);
    return ok({
      status: payment.status,
      paid: payment.paid,
      sparks: sparksTotal || undefined,
      balance,
    });
  } catch (err) {
    return fail(err);
  }
}
