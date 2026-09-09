import { applyTx } from "@/core/billing/billing";
import { getPayment, type YooPayment } from "@/core/billing/yookassa";
import { markTopupBonusUsed } from "@/core/billing/promo";

/**
 * Проверить платёж у ЮKassa и зачислить гены. Идемпотентно: reference
 * "yk-<paymentId>" уникален в billing_tx, поэтому вебхук и проверка при
 * возврате могут сработать оба — зачисление произойдёт ровно один раз.
 */
export async function verifyAndCredit(paymentId: string): Promise<{
  payment: YooPayment;
  credited: boolean;
  sparksTotal: number;
  balance: number | null;
}> {
  const payment = await getPayment(paymentId);
  if (payment.status !== "succeeded" || !payment.paid) {
    return { payment, credited: false, sparksTotal: 0, balance: null };
  }

  const email = payment.metadata?.email;
  const sparks = Number(payment.metadata?.sparks ?? 0);
  const bonus = Number(payment.metadata?.bonus ?? 0);
  if (!email || !Number.isInteger(sparks) || sparks <= 0) {
    // платёж не наш (создан не этим кодом) — не зачисляем вслепую
    throw new Error(`Платёж ${paymentId} без корректных metadata (email/sparks).`);
  }

  // Бонус промокода расходуем ЗДЕСЬ, а не при создании платежа: иначе человек,
  // открывший окно оплаты и передумавший, терял промокод молча (проверено на
  // проде 09.09.2026). markTopupBonusUsed идемпотентен для одного платежа и
  // отдаёт false второму, если окон оплаты было открыто два.
  const promoCode = payment.metadata?.promoCode;
  const promoBonus = Number(payment.metadata?.promoBonus ?? 0);
  const packBonus =
    Number.isInteger(bonus) && bonus > 0 ? bonus - (promoBonus > 0 ? promoBonus : 0) : 0;
  const promoGranted =
    promoCode && promoBonus > 0 && (await markTopupBonusUsed(email, promoCode, payment.id))
      ? promoBonus
      : 0;
  const totalBonus = Math.max(packBonus, 0) + promoGranted;

  const { balance, applied } = await applyTx({
    email,
    amount: sparks + totalBonus,
    type: "topup",
    reference: `yk-${payment.id}`,
    comment:
      `ЮKassa: ${payment.amount.value} ₽` +
      (totalBonus > 0 ? ` (+${totalBonus} бонус${promoGranted ? `, промокод ${promoCode}` : ""})` : "") +
      `, платёж ${payment.id}`,
  });
  return { payment, credited: applied, sparksTotal: sparks + totalBonus, balance };
}
