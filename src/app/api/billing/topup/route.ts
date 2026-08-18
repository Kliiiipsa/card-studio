import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, applyTx } from "@/core/billing/billing";
import { TOPUP_PACKAGES, CUSTOM_TOPUP, customTopup } from "@/core/billing/prices";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";

const schema = z.object({
  packageId: z.string(),
  /** only for packageId === "custom": whole rubles */
  amountRub: z.number().int().optional(),
});

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

    const { packageId, amountRub } = await parseBody(req, schema);
    const pack =
      packageId === CUSTOM_TOPUP.id
        ? customTopup(amountRub ?? 0)
        : TOPUP_PACKAGES.find((p) => p.id === packageId);
    if (!pack) {
      throw new AppError(
        packageId === CUSTOM_TOPUP.id
          ? `Сумма должна быть целым числом от ${CUSTOM_TOPUP.minRub} до ${CUSTOM_TOPUP.maxRub} ₽.`
          : "Неизвестный пакет пополнения.",
      );
    }

    // Demo crediting is OFF by default now that the site is under ЮKassa
    // review — a "payment" that instantly credits sparks without money would
    // look like a broken checkout. BILLING_DEMO_TOPUP=true re-enables it for
    // internal testing; the real integration replaces this branch entirely.
    if (process.env.BILLING_DEMO_TOPUP !== "true") {
      throw new AppError(
        "Оплата подключается: приём платежей через ЮKassa скоро появится. Пока пополнить баланс можно через поддержку — admin@kartogen.ru.",
        503,
      );
    }

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
