import { applyTx, getBalance } from "@/core/billing/billing";
import { getPayment, type YooPayment } from "@/core/billing/yookassa";
import { markTopupBonusUsed } from "@/core/billing/promo";
import { rewardOnPayment } from "@/core/referrals/referrals";

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

  // Деньги и подарки — РАЗНЫЕ записи в журнале (с 24.09.2026). Раньше бонус
  // сидел внутри суммы пополнения, а его размер приходилось выковыривать из
  // комментария регуляркой — для отчётов терпимо, для расчёта возврата денег
  // нет. Теперь сумма записи `topup` равна рублям платежа (1 ген = 1 ₽),
  // поэтому «сколько человек заплатил» — это один SUM.
  const { balance: afterTopup, applied } = await applyTx({
    email,
    amount: sparks,
    type: "topup",
    reference: `yk-${payment.id}`,
    comment: `ЮKassa: ${payment.amount.value} ₽, платёж ${payment.id}`,
  });
  let balance = afterTopup;

  // Дальше идём ВСЕГДА, а не только при applied: каждое начисление защищено
  // своим reference, зато повторный вызов (вебхук + возврат на страницу)
  // достроит то, что не успело записаться, если процесс упал посередине.
  if (totalBonus > 0) {
    const bonusTx = await applyTx({
      email,
      amount: totalBonus,
      type: "bonus",
      reference: `yk-${payment.id}:bonus`,
      comment:
        `Бонус к пополнению: пакет` +
        (promoGranted ? ` + промокод ${promoCode} (+${promoGranted})` : "") +
        `, платёж ${payment.id}`,
    });
    balance = bonusTx.balance;
  }

  // Реферальные: пригласившему процент с КАЖДОГО пополнения, приглашённому —
  // процент к первому. Идемпотентно по id платежа; ошибки не трогают платёж.
  // База начисления — РУБЛИ платежа, а не гены на балансе. Сейчас это одно и
  // то же (1 ген = 1 ₽, оферта п. 6.3), но берём сумму у ЮKassa: правило в
  // оферте сформулировано именно про уплаченные деньги, и если прайс когда-то
  // разойдётся с номиналом, начисление останется верным.
  const paidRub = Math.floor(Number(payment.amount.value) || 0);
  const { refereeBonus } = await rewardOnPayment({
    refereeEmail: email,
    paidRub,
    paymentId: payment.id,
  }).catch(() => ({ refereeBonus: 0 }));
  if (refereeBonus > 0) balance = await getBalance(email);

  return {
    payment,
    credited: applied,
    sparksTotal: sparks + totalBonus + refereeBonus,
    balance,
  };
}
