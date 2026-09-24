import "server-only";
import { applyTx, estimateRefund, getBalance, type RefundEstimate } from "./billing";
import { reverseForPayment } from "@/core/referrals/referrals";

/**
 * Возврат денег по заявлению (оферта п. 9.9–9.12).
 *
 * Деньги возвращает владелец руками в кабинете ЮKassa — автоматического
 * возврата у нас нет и не планируется. Эта процедура оформляет ПОСЛЕДСТВИЯ
 * возврата в нашем учёте, и без неё в схеме зияла дыра: формула считала, сколько
 * вернуть, но остаток генов на балансе никто не списывал.
 *
 * Как это эксплуатировалось бы: человек платит 3000 ₽, получает 3500 генов,
 * тратит 100 и просит возврат. Услуг оказано на 100 ₽, возвращаем 2900 ₽ — и у
 * него остаётся 3400 генов, за которые деньги уже вернули. Себестоимость этих
 * генов около 1530 ₽, и повторять можно сколько угодно. Поэтому возврат денег
 * обнуляет баланс целиком, включая бонусные гены: возврат означает отказ от
 * услуг, оплаченных этим платежом.
 *
 * Порядок шагов важен. Сначала откатываем реферальные начисления: гены
 * пригласившего лежат на ДРУГОМ аккаунте, и после обнуления баланса заявителя
 * их уже не найти по остатку. Потом обнуляем то, что осталось у заявителя.
 */

export type RefundResult = {
  /** расчёт на момент возврата — попадает в журнал и в ответ владельцу */
  estimate: RefundEstimate;
  /** сколько денег владелец вернул (по умолчанию — расчётная сумма) */
  refundedRub: number;
  /** сколько генов аннулировано с баланса заявителя */
  annulledGenes: number;
  /** что сняли по реферальной цепочке (пригласивший + бонус за первое пополнение) */
  referrals: { email: string; amount: number; taken: number }[];
};

export async function processRefund(args: {
  email: string;
  /** id платежа ЮKassa — если указан, откатим и реферальные начисления с него */
  paymentId?: string;
  /** фактически возвращённая сумма, если владелец вернул не расчётную */
  amountRub?: number;
  comment?: string;
}): Promise<RefundResult> {
  const estimate = await estimateRefund(args.email);
  const refundedRub = Number.isFinite(args.amountRub as number)
    ? Math.max(0, Math.floor(args.amountRub as number))
    : estimate.refundableRub;

  const referrals = args.paymentId
    ? (await reverseForPayment(args.paymentId).catch(() => ({ reversed: [] }))).reversed
    : [];

  // баланс перечитываем: откат реферальных мог его уменьшить
  const balance = await getBalance(args.email);
  let annulledGenes = 0;
  if (balance > 0) {
    const { applied } = await applyTx({
      email: args.email,
      amount: -balance,
      type: "admin",
      // привязка к платежу делает повтор безопасным; без платежа хватает даты —
      // после первого обнуления баланс всё равно ноль и шаг пропускается
      reference: `refund-annul:${args.email}:${args.paymentId ?? new Date().toISOString().slice(0, 10)}`,
      comment:
        `Возврат денежных средств ${refundedRub} ₽ по заявлению (оферта п. 9.10–9.11): ` +
        `остаток ${balance} генов аннулирован` +
        (args.paymentId ? `, платёж ${args.paymentId}` : "") +
        (args.comment ? `. ${args.comment}` : ""),
      guardNonNegative: true,
    });
    if (applied) annulledGenes = balance;
  }

  console.log(
    `[refund] ${args.email}: вернули ${refundedRub} ₽, аннулировали ${annulledGenes} генов` +
      (referrals.length ? `, откатили ${referrals.length} реферальных начислений` : ""),
  );
  return { estimate, refundedRub, annulledGenes, referrals };
}
