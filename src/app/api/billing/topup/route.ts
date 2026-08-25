import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, applyTx } from "@/core/billing/billing";
import { TOPUP_PACKAGES, CUSTOM_TOPUP, customTopup, gens } from "@/core/billing/prices";
import { yookassaConfigured, createPayment } from "@/core/billing/yookassa";
import { consumeTopupBonus, releaseTopupBonus } from "@/core/billing/promo";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";

const schema = z.object({
  packageId: z.string(),
  /** only for packageId === "custom": whole rubles */
  amountRub: z.number().int().optional(),
});

/**
 * Top-up entry point.
 *  - ЮKassa настроена (YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY): создаёт платёж
 *    и возвращает confirmationUrl — клиент уходит на страницу оплаты. Гены
 *    зачисляет вебхук или проверка при возврате (см. yookassa-credit.ts).
 *  - Иначе, BILLING_DEMO_TOPUP=true (локальная разработка): мгновенное
 *    демо-зачисление без денег.
 *  - Иначе: 503 «оплата подключается».
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

    if (yookassaConfigured()) {
      const origin = process.env.CANONICAL_HOST
        ? `https://${process.env.CANONICAL_HOST}`
        : new URL(req.url).origin;
      // ожидающий промокод на бонус: забираем его сейчас, чтобы он попал в
      // metadata платежа и зачислился вместе с оплатой
      const promo = await consumeTopupBonus(session.email);
      const promoBonus = promo ? Math.round((pack.sparks * promo.percent) / 100) : 0;
      const bonus = pack.bonus + promoBonus;
      try {
        const { id, confirmationUrl } = await createPayment({
          amountRub: pack.priceRub,
          description: `Kartogen: ${gens(pack.sparks)}${bonus ? ` + ${bonus} бонусом` : ""}`,
          // paymentId кладёт в sessionStorage клиент перед редиректом —
          // на возврате страница /billing сама проверит и зачислит платёж
          returnUrl: `${origin}/billing`,
          metadata: {
            email: session.email,
            packageId: pack.id,
            sparks: String(pack.sparks),
            bonus: String(bonus),
            ...(promo ? { promoCode: promo.code, promoBonus: String(promoBonus) } : {}),
          },
        });
        return ok({ paymentId: id, confirmationUrl, promoBonus: promoBonus || undefined });
      } catch (e) {
        // платёж не создался — возвращаем промокод пользователю
        if (promo) await releaseTopupBonus(session.email, promo.code);
        throw e;
      }
    }

    // Demo crediting: только когда ЮKassa не настроена (локальные тесты).
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
