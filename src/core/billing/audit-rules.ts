/**
 * Сверка денег — ПРАВИЛА. Чистая функция без базы и сети: на вход снимок
 * журнала, балансов и платежей ЮKassa, на выход список расхождений. Данные
 * собирает money-audit.ts; правила проверяются автотестом scripts/test-money.cjs
 * перед каждой сборкой.
 *
 * Появилась после 06.11.2026: повторная проверка платежа от 23.09 выдала
 * клиенту бонус 500 генов второй раз, и узнали мы об этом случайно, из журнала.
 * Каждое правило ниже отвечает на вопрос «как бы мы узнали об этом сами».
 */

export type AuditLedgerRow = {
  id: number;
  email: string;
  amount: number;
  type: string;
  reference: string | null;
  createdAt: string; // ISO
};

export type AuditPayment = {
  id: string;
  /** рубли платежа */
  amountRub: number;
  /** когда банк подтвердил оплату (или создан, если подтверждения нет) */
  paidAt: string; // ISO
  email: string | null;
  sparks: number;
  bonus: number;
};

export type AuditInput = {
  nowMs: number;
  /** начало окна, за которое сверяем платежи с журналом */
  windowStartMs: number;
  /** начисления за окно (все типы, кроме списаний и возвратов генов) */
  recent: AuditLedgerRow[];
  /**
   * Пополнения, на которые ссылаются бонусы и реферальные из `recent`, по
   * reference. Ищутся по всему журналу, а не только в окне: именно так ловится
   * «бонус к платежу полуторамесячной давности».
   */
  topupsByRef: Record<string, AuditLedgerRow>;
  /** аккаунты, где кешированный баланс не равен сумме журнала или ушёл в минус */
  balanceIssues: { email: string; balance: number; ledgerSum: number }[];
  /** успешные платежи ЮKassa за окно с запасом; null — ЮKassa не ответила */
  payments: AuditPayment[] | null;
};

export type AuditFinding = {
  /** стабильный ключ: по нему расхождение не присылается повторно и снимается кнопкой «Принято» */
  key: string;
  code:
    | "late-reward"
    | "reward-without-topup"
    | "paid-not-credited"
    | "topup-amount-mismatch"
    | "bonus-over-promised"
    | "topup-without-payment"
    | "topup-not-from-payment"
    | "big-gift"
    | "balance-mismatch"
    | "negative-balance";
  severity: "crit" | "warn";
  email: string | null;
  /** одна строка для карточки и темы письма — без почты клиента */
  title: string;
  /** подробности для письма и админки */
  detail: string;
};

/** сколько после пополнения ещё законно дописываются бонус и реферальные */
export const REWARD_WINDOW_MS = 48 * 60 * 60 * 1000;
/** столько даём вебхуку и странице на зачисление, прежде чем бить тревогу */
export const CREDIT_GRACE_MS = 20 * 60 * 1000;
/**
 * Разовое подарочное начисление крупнее этого — повод посмотреть глазами.
 * Самый большой законный подарок сейчас: бонус пакета 3000 (500) плюс бонус
 * промокода; реферальные — 10% от пополнения. До тысячи не дотягивает ничто.
 */
export const BIG_GIFT_GENES = 1000;

/** yk-<id>:bonus, ref-pay:<id>, ref-first:<id> → id платежа, к которому привязано начисление */
export function rewardPaymentId(reference: string | null): string | null {
  if (!reference) return null;
  const m = /^yk-(.+):bonus$/.exec(reference) ?? /^ref-(?:pay|first):(.+)$/.exec(reference);
  return m ? m[1] : null;
}

const ms = (iso: string) => new Date(iso).getTime();
const day = (iso: string) => iso.slice(0, 10);

export function auditLedger(input: AuditInput): AuditFinding[] {
  const out: AuditFinding[] = [];
  const paymentsById = new Map((input.payments ?? []).map((p) => [p.id, p]));
  const recentByRef = new Map(
    input.recent.filter((r) => r.reference).map((r) => [r.reference as string, r]),
  );

  for (const r of input.recent) {
    // 1. Бонус или реферальные к платежу, которого в журнале нет либо который
    //    зачислен давно. Ровно случай 06.11.2026.
    const payId = rewardPaymentId(r.reference);
    if (payId && r.amount > 0) {
      const topup = input.topupsByRef[`yk-${payId}`];
      if (!topup) {
        out.push({
          key: `reward-without-topup:${r.reference}`,
          code: "reward-without-topup",
          severity: "crit",
          email: r.email,
          title: `Начислено ${r.amount} генов к платежу, которого нет в журнале`,
          detail: `Запись №${r.id} от ${r.createdAt}: +${r.amount} (${r.reference}). Пополнения yk-${payId} в журнале нет.`,
        });
      } else if (ms(r.createdAt) - ms(topup.createdAt) > REWARD_WINDOW_MS) {
        const days = Math.round((ms(r.createdAt) - ms(topup.createdAt)) / 86400000);
        out.push({
          key: `late-reward:${r.reference}`,
          code: "late-reward",
          severity: "crit",
          email: r.email,
          title: `Начислено ${r.amount} генов к старому платежу (${days} дн. спустя)`,
          detail: `Запись №${r.id} от ${r.createdAt}: +${r.amount} (${r.reference}). Само пополнение записано ${topup.createdAt}, на ${days} дн. раньше. Похоже на повторную выдачу бонуса.`,
        });
      }
    }

    // 2. Пополнение, за которым не стоит платёж ЮKassa.
    if (r.type === "topup" && r.amount > 0) {
      const m = /^yk-(.+)$/.exec(r.reference ?? "");
      if (!m) {
        out.push({
          key: `topup-not-from-payment:${r.id}`,
          code: "topup-not-from-payment",
          severity: "warn",
          email: r.email,
          title: `Пополнение на ${r.amount} генов не через ЮKassa`,
          detail: `Запись №${r.id} от ${r.createdAt}: +${r.amount}, reference ${r.reference ?? "нет"}. Денег за ней в ЮKassa нет.`,
        });
      } else if (input.payments && ms(r.createdAt) >= input.windowStartMs) {
        const p = paymentsById.get(m[1]);
        if (!p) {
          out.push({
            key: `topup-without-payment:${r.reference}`,
            code: "topup-without-payment",
            severity: "crit",
            email: r.email,
            title: `Пополнение на ${r.amount} генов без успешного платежа в ЮKassa`,
            detail: `Запись №${r.id} от ${r.createdAt}: +${r.amount} (${r.reference}). Среди успешных платежей ЮKassa такого нет.`,
          });
        }
      }
    }

    // 3. Крупный разовый подарок (ручные корректировки владельца не считаем).
    if (
      r.amount >= BIG_GIFT_GENES &&
      (r.type === "bonus" || r.type === "welcome" || r.type === "refund")
    ) {
      out.push({
        key: `big-gift:${r.id}`,
        code: "big-gift",
        severity: "warn",
        email: r.email,
        title: `Крупное подарочное начисление: ${r.amount} генов`,
        detail: `Запись №${r.id} от ${r.createdAt}: +${r.amount}, тип ${r.type}, reference ${r.reference ?? "нет"}. Таких больших подарков правила не предусматривают.`,
      });
    }
  }

  // 4. Сверка с ЮKassa: каждый успешный платёж зачислен ровно на свою сумму,
  //    бонус не больше обещанного.
  for (const p of input.payments ?? []) {
    if (!p.email || !(p.sparks > 0)) continue; // платёж создан не нашим кодом
    if (ms(p.paidAt) < input.windowStartMs) continue;
    const topup = recentByRef.get(`yk-${p.id}`) ?? input.topupsByRef[`yk-${p.id}`];
    if (!topup) {
      if (input.nowMs - ms(p.paidAt) > CREDIT_GRACE_MS) {
        out.push({
          key: `paid-not-credited:${p.id}`,
          code: "paid-not-credited",
          severity: "crit",
          email: p.email,
          title: `Оплата ${p.amountRub} ₽ прошла, а гены не зачислены`,
          detail: `Платёж ${p.id} от ${p.paidAt} на ${p.amountRub} ₽ (${p.sparks} генов). Записи yk-${p.id} в журнале нет.`,
        });
      }
      continue;
    }
    if (topup.amount !== p.sparks || topup.email !== p.email) {
      out.push({
        key: `topup-amount-mismatch:${p.id}`,
        code: "topup-amount-mismatch",
        severity: "crit",
        email: p.email,
        title: `Зачислено ${topup.amount} генов вместо ${p.sparks} по платежу ${day(p.paidAt)}`,
        detail: `Платёж ${p.id}: оплачено ${p.amountRub} ₽ за ${p.sparks} генов для ${p.email}. В журнале запись №${topup.id}: +${topup.amount} для ${topup.email}.`,
      });
    }
    const bonusRow = recentByRef.get(`yk-${p.id}:bonus`);
    if (bonusRow && bonusRow.amount > p.bonus) {
      out.push({
        key: `bonus-over-promised:${p.id}`,
        code: "bonus-over-promised",
        severity: "crit",
        email: p.email,
        title: `Бонус ${bonusRow.amount} генов больше обещанного (${p.bonus})`,
        detail: `Платёж ${p.id}: в платеже обещан бонус ${p.bonus}, в журнале запись №${bonusRow.id}: +${bonusRow.amount}.`,
      });
    }
  }

  // 5. Баланс должен равняться сумме журнала и не уходить в минус.
  for (const b of input.balanceIssues) {
    if (b.balance < 0) {
      out.push({
        key: `negative-balance:${b.email}`,
        code: "negative-balance",
        severity: "crit",
        email: b.email,
        title: `Баланс ушёл в минус: ${b.balance}`,
        detail: `У ${b.email} баланс ${b.balance}, сумма журнала ${b.ledgerSum}.`,
      });
    }
    if (b.balance !== b.ledgerSum) {
      out.push({
        // разницу кладём в ключ: если она изменится, это новое расхождение
        key: `balance-mismatch:${b.email}:${b.balance - b.ledgerSum}`,
        code: "balance-mismatch",
        severity: "crit",
        email: b.email,
        title: `Баланс не сходится с журналом на ${b.balance - b.ledgerSum}`,
        detail: `У ${b.email} баланс ${b.balance}, а сумма всех записей журнала ${b.ledgerSum}.`,
      });
    }
  }

  return out;
}
