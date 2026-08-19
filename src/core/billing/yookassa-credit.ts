import { applyTx } from "@/core/billing/billing";
import { getPayment, type YooPayment } from "@/core/billing/yookassa";

/**
 * Проверить платёж у ЮKassa и зачислить искры. Идемпотентно: reference
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

  const { balance, applied } = await applyTx({
    email,
    amount: sparks + (Number.isInteger(bonus) && bonus > 0 ? bonus : 0),
    type: "topup",
    reference: `yk-${payment.id}`,
    comment: `ЮKassa: ${payment.amount.value} ₽${bonus > 0 ? ` (+${bonus} бонус)` : ""}, платёж ${payment.id}`,
  });
  return { payment, credited: applied, sparksTotal: sparks + (bonus > 0 ? bonus : 0), balance };
}
