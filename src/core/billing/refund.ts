import "server-only";
import {
  applyTx,
  estimateRefund,
  getBalance,
  paymentOwner,
  recordRefund,
  type RefundEstimate,
} from "./billing";
import { AppError } from "@/lib/errors";
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
  // Ошибка в id платежа задела бы чужую реферальную цепочку — проверяем, что
  // платёж вообще наш и принадлежит этому человеку.
  if (args.paymentId) {
    const owner = await paymentOwner(args.paymentId);
    if (!owner) throw new AppError(`Платёж ${args.paymentId} не найден в журнале.`, 400);
    if (owner !== args.email) {
      throw new AppError(`Платёж ${args.paymentId} принадлежит другому аккаунту.`, 400);
    }
  }

  const estimate = await estimateRefund(args.email);
  const refundedRub = Number.isFinite(args.amountRub as number)
    ? Math.max(0, Math.floor(args.amountRub as number))
    : estimate.refundableRub;

  const referrals = args.paymentId
    ? (await reverseForPayment(args.paymentId).catch(() => ({ reversed: [] }))).reversed
    : [];

  // Обнуляем остаток. Баланс перечитываем (откат реферальных мог его уменьшить)
  // и повторяем попытку, если человек успел потратить гены между чтением и
  // списанием: guardNonNegative в этом случае откатывает операцию целиком.
  let annulledGenes = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const balance = await getBalance(args.email);
    if (balance <= 0) break;
    const { applied, insufficient } = await applyTx({
      email: args.email,
      amount: -balance,
      type: "admin",
      // в reference попадает и остаток: повтор с тем же балансом — no-op,
      // а новая попытка после списания получит свой reference и пройдёт
      reference: `refund-annul:${args.email}:${args.paymentId ?? new Date().toISOString().slice(0, 10)}:${balance}`,
      comment:
        `Возврат денежных средств ${refundedRub} ₽ по заявлению (оферта п. 9.10–9.11): ` +
        `остаток ${balance} генов аннулирован` +
        (args.paymentId ? `, платёж ${args.paymentId}` : "") +
        (args.comment ? `. ${args.comment}` : ""),
      guardNonNegative: true,
    });
    if (applied) {
      annulledGenes = balance;
      break;
    }
    if (!insufficient) break; // повтор той же операции — уже применена
  }

  await recordRefund({
    email: args.email,
    paymentId: args.paymentId,
    amountRub: refundedRub,
    genesAnnulled: annulledGenes,
    comment: args.comment,
  });

  console.log(
    `[refund] ${args.email}: вернули ${refundedRub} ₽, аннулировали ${annulledGenes} генов` +
      (referrals.length ? `, откатили ${referrals.length} реферальных начислений` : ""),
  );
  return { estimate, refundedRub, annulledGenes, referrals };
}
