import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, applyTx } from "@/core/billing/billing";
import { TOPUP_PACKAGES } from "@/core/billing/prices";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";

const schema = z.object({ packageId: z.string() });

/**
 * DEMO top-up. Until a real ЮKassa shop is connected (needs ИП/самозанятость)
 * this endpoint credits the package immediately, marked as a demo payment.
 *
 * Real integration plan (swap-in, same route):
 *  1. POST https://api.yookassa.ru/v3/payments  (amount, capture, return_url,
 *     metadata: {email, packageId}, Idempotence-Key) → return confirmation_url.
 *  2. Webhook route verifies the notification and calls applyTx with
 *     reference = yookassa payment id (already idempotent).
 */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    if (!billingEnabled()) throw new AppError("Биллинг не настроен.", 500);

    const { packageId } = await parseBody(req, schema);
    const pack = TOPUP_PACKAGES.find((p) => p.id === packageId);
    if (!pack) throw new AppError("Неизвестный пакет пополнения.");

    const { balance } = await applyTx({
      email: session.email,
      amount: pack.sparks + pack.bonus,
      type: "topup",
      reference: uid("demo-pay"),
      comment: `ЮKassa (демо): пакет ${pack.sparks}${pack.bonus ? ` +${pack.bonus} бонус` : ""}`,
    });
    return ok({ balance, demo: true });
  } catch (err) {
    return fail(err);
  }
}
