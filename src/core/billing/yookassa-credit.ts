import { applyTx, getBalance, getTxByReference } from "@/core/billing/billing";
import { getPayment, type YooPayment } from "@/core/billing/yookassa";
import { markTopupBonusUsed } from "@/core/billing/promo";
import { rewardOnPayment } from "@/core/referrals/referrals";

/**
 * Сколько после зачисления платежа мы ещё «достраиваем» недописанное (бонус,
 * реферальные), если процесс упал посередине. ЮKassa повторяет вебхук до
 * 24 часов — берём с запасом. Позже этого срока платёж считается закрытым.
 */
const COMPLETE_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Можно ли достраивать бонус и реферальные к пополнению, которое уже записано
 * в журнале. Да — только если запись новой схемы (сумма строки равна sparks,
 * то есть бонус НЕ сидит внутри) и она свежая. Чистая функция: проверяется
 * отдельно от базы.
 */
export function canCompleteCredit(
  prev: { amount: number; type: string; createdAt: Date } | null,
  sparks: number,
  nowMs: number,
): boolean {
  return (
    prev !== null &&
    prev.type === "topup" &&
    prev.amount === sparks &&
    nowMs - prev.createdAt.getTime() < COMPLETE_WINDOW_MS
  );
}

/**
 * Проверить платёж у ЮKassa и зачислить гены. Идемпотентно: reference
 * "yk-<paymentId>" уникален в billing_tx, поэтому вебхук и проверка при
 * возврате могут сработать оба — зачисление произойдёт ровно один раз.
 *
 * `stale: true` — платёж был полностью зачислен давно, этот вызов ничего не
 * сделал. Клиенту в таком случае нельзя показывать «оплата прошла».
 */
export async function verifyAndCredit(paymentId: string): Promise<{
  payment: YooPayment;
  credited: boolean;
  stale: boolean;
  sparksTotal: number;
  balance: number | null;
}> {
  const payment = await getPayment(paymentId);
  if (payment.status !== "succeeded" || !payment.paid) {
    return { payment, credited: false, stale: false, sparksTotal: 0, balance: null };
  }

  const email = payment.metadata?.email;
  const sparks = Number(payment.metadata?.sparks ?? 0);
  const bonus = Number(payment.metadata?.bonus ?? 0);
  if (!email || !Number.isInteger(sparks) || sparks <= 0) {
    // платёж не наш (создан не этим кодом) — не зачисляем вслепую
    throw new Error(`Платёж ${paymentId} без корректных metadata (email/sparks).`);
  }

  // Деньги и подарки — РАЗНЫЕ записи в журнале (с 24.09.2026). Раньше бонус
  // сидел внутри суммы пополнения, а его размер приходилось выковыривать из
  // комментария регуляркой — для отчётов терпимо, для расчёта возврата денег
  // нет. Теперь сумма записи `topup` равна рублям платежа (1 ген = 1 ₽),
  // поэтому «сколько человек заплатил» — это один SUM.
  const topupRef = `yk-${payment.id}`;
  const { balance: afterTopup, applied } = await applyTx({
    email,
    amount: sparks,
    type: "topup",
    reference: topupRef,
    comment: `ЮKassa: ${payment.amount.value} ₽, платёж ${payment.id}`,
  });
  let balance = afterTopup;

  // Пополнение уже было записано раньше. Достраивать бонус и реферальные можно
  // ТОЛЬКО если это тот же свежий платёж, недописанный из-за сбоя или гонки
  // «вебхук + возврат на страницу». Два случая, когда достраивать нельзя:
  //  1) запись старой схемы (до 24.09.2026): бонус уже сидит ВНУТРИ суммы
  //     пополнения (сумма строки больше sparks), отдельной строки `:bonus` у
  //     неё нет и не должно быть. 06.11.2026 повторная проверка платежа от
  //     23.09 выдала клиенту бонус 500 генов второй раз — отсюда это условие;
  //  2) платёж закрыт давно: всё, что должно было записаться, записалось.
  // В обоих случаях не трогаем и промокод (markTopupBonusUsed), иначе старый
  // номер платежа мог бы молча израсходовать чужой активный бонус.
  if (!applied) {
    const prev = await getTxByReference(topupRef);
    if (!canCompleteCredit(prev, sparks, Date.now())) {
      return { payment, credited: false, stale: true, sparksTotal: 0, balance };
    }
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

  // Сюда доходим и при applied, и при свежем повторе: каждое начисление
  // защищено своим reference, зато повторный вызов (вебхук + возврат на
  // страницу) достроит то, что не успело записаться, если процесс упал
  // посередине.
  if (totalBonus > 0) {
    const bonusTx = await applyTx({
      email,
      amount: totalBonus,
      type: "bonus",
      reference: `${topupRef}:bonus`,
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
    stale: false,
    sparksTotal: sparks + totalBonus + refereeBonus,
    balance,
  };
}
