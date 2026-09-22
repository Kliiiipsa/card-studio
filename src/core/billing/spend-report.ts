import "server-only";
import { allTransactionsAsc, type SparkTransaction } from "./billing";
import { falCostForJobs } from "@/core/jobs/jobs";
import { FAL_COST_PER_GENE, RUB_PER_USD } from "./prices";
import { isHiddenAccount } from "@/core/auth/hidden-accounts";

/**
 * Отчёт «Расходы»: сколько подарочных (бесплатных для клиента) генов люди
 * тратят в день и во что это обходится нам.
 *
 * У баланса один котёл, поэтому «бесплатный» ген определяется правилом:
 * списание сначала съедает подарочные гены, потом оплаченные. Подарочные —
 * стартовый бонус, промокоды, ручные начисления админа и бонус к пакету
 * пополнения (в ЮKassa-транзакции он сидит в сумме, вытаскиваем из комментария
 * «(+N бонус…)»). Оплаченные — только то, за что реально пришли деньги.
 * Возврат за неудачную генерацию возвращает гены в обратном порядке: сначала
 * оплаченные, потом подарочные.
 *
 * Рубли считаем двумя способами: номинал (1 ген = 1 ₽ — сколько «подарили»
 * в ценах прайса) и себестоимость fal — по замеру задачи (gen:<jobId>), а где
 * замера нет (текстовые услуги, старые записи) — типичная оценка за ген.
 */

export type SpendDay = {
  /** дата по Москве, YYYY-MM-DD */
  date: string;
  freeGenes: number;
  paidGenes: number;
  /** себестоимость fal подарочных генов, ₽ */
  freeCostRub: number;
  /** себестоимость fal оплаченных генов, ₽ */
  paidCostRub: number;
  /** списаний (генераций и текстовых услуг) */
  charges: number;
  /** уникальных людей, у кого было списание */
  users: number;
  /** списаний, для которых замера fal не было — себестоимость оценена */
  estimated: number;
};

export type SpendReport = {
  days: SpendDay[];
  totals: Omit<SpendDay, "date">;
  /** в среднем за день по дням периода (включая дни без списаний) */
  avgFreeGenesPerDay: number;
  avgFreeCostRubPerDay: number;
  /** на что уходят подарочные гены за период */
  byAction: { action: string; freeGenes: number; charges: number }[];
  periodDays: number;
  from: string;
  to: string;
  rubPerUsd: number;
};

const MSK_OFFSET_MS = 3 * 3600_000;
const mskDate = (iso: string): string =>
  new Date(new Date(iso).getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);

/** бонус пакета/промокода внутри ЮKassa-транзакции: «(+35 бонус, промокод X)» */
function bonusInTopup(t: SparkTransaction): number {
  const m = /\(\+(\d+)\s*бонус/.exec(t.comment ?? "");
  return m ? Number(m[1]) : 0;
}

type Pools = { free: number; paid: number; paidConsumed: number };

type ChargeSlice = {
  date: string;
  email: string;
  action: string;
  reference: string | null;
  fromFree: number;
  fromPaid: number;
};

export async function buildSpendReport(opts: {
  days: number;
  includeHidden?: boolean;
}): Promise<SpendReport> {
  const periodDays = Math.min(Math.max(opts.days, 1), 365);
  const all = await allTransactionsAsc();
  const txs = opts.includeHidden ? all : all.filter((t) => !isHiddenAccount(t.email));

  const pools = new Map<string, Pools>();
  const poolOf = (email: string): Pools => {
    let p = pools.get(email);
    if (!p) {
      p = { free: 0, paid: 0, paidConsumed: 0 };
      pools.set(email, p);
    }
    return p;
  };

  const charges: ChargeSlice[] = [];
  // возвраты — отрицательные срезы того же дня, чтобы неудачные генерации не
  // засчитывались как расход
  const refunds: ChargeSlice[] = [];

  for (const t of txs) {
    const p = poolOf(t.email);
    const amt = t.amount;
    switch (t.type) {
      case "welcome":
        p.free += amt;
        break;
      case "topup": {
        if (t.reference?.startsWith("yk-")) {
          const bonus = Math.min(bonusInTopup(t), amt);
          p.paid += amt - bonus;
          p.free += bonus;
        } else {
          // промокод, демо-оплата — денег не было
          p.free += amt;
        }
        break;
      }
      case "admin": {
        if (amt >= 0) p.free += amt;
        else {
          let need = -amt;
          const f = Math.min(p.free, need);
          p.free -= f;
          need -= f;
          p.paid = Math.max(0, p.paid - need);
        }
        break;
      }
      case "charge": {
        let need = -amt;
        const fromFree = Math.min(p.free, need);
        p.free -= fromFree;
        need -= fromFree;
        const fromPaid = Math.min(p.paid, need);
        p.paid -= fromPaid;
        need -= fromPaid;
        p.paidConsumed += fromPaid;
        charges.push({
          date: mskDate(t.createdAt),
          email: t.email,
          action: t.action ?? "other",
          reference: t.reference,
          // остаток сверх известных котлов (не должно случаться при guardNonNegative)
          fromFree: fromFree + need,
          fromPaid,
        });
        break;
      }
      case "refund": {
        const toPaid = Math.min(p.paidConsumed, amt);
        p.paid += toPaid;
        p.paidConsumed -= toPaid;
        const toFree = amt - toPaid;
        p.free += toFree;
        refunds.push({
          date: mskDate(t.createdAt),
          email: t.email,
          action: t.action ?? "other",
          reference: t.reference,
          fromFree: toFree,
          fromPaid: toPaid,
        });
        break;
      }
      default:
        break;
    }
  }

  // окно периода по Москве
  const today = mskDate(new Date().toISOString());
  const fromDate = mskDate(new Date(Date.now() - (periodDays - 1) * 86_400_000).toISOString());
  const inWindow = (d: string) => d >= fromDate && d <= today;
  // Списание, за которое потом вернули гены (refund:<ref>), — неудачная
  // генерация: её не считаем ни в генах, ни в себестоимости.
  const refundedRefs = new Set(
    refunds
      .map((r) => (r.reference?.startsWith("refund:") ? r.reference.slice(7) : null))
      .filter((x): x is string => !!x),
  );
  const winCharges = charges.filter(
    (c) => inWindow(c.date) && !(c.reference && refundedRefs.has(c.reference)),
  );

  // себестоимость по замерам задач
  const jobIds = winCharges
    .map((c) => (c.reference?.startsWith("gen:") ? c.reference.slice(4) : null))
    .filter((x): x is string => !!x);
  const costs = await falCostForJobs(jobIds);

  const dayMap = new Map<string, SpendDay & { emails: Set<string> }>();
  const dayOf = (date: string) => {
    let d = dayMap.get(date);
    if (!d) {
      d = {
        date,
        freeGenes: 0,
        paidGenes: 0,
        freeCostRub: 0,
        paidCostRub: 0,
        charges: 0,
        users: 0,
        estimated: 0,
        emails: new Set(),
      };
      dayMap.set(date, d);
    }
    return d;
  };
  const byAction = new Map<string, { action: string; freeGenes: number; charges: number }>();

  for (const c of winCharges) {
    const d = dayOf(c.date);
    const total = c.fromFree + c.fromPaid;
    const jobId = c.reference?.startsWith("gen:") ? c.reference.slice(4) : null;
    const usd = jobId ? costs.get(jobId) : undefined;
    let costRub: number;
    if (usd !== undefined) costRub = usd * RUB_PER_USD;
    else {
      costRub = total * FAL_COST_PER_GENE.typical;
      d.estimated += 1;
    }
    const freeShare = total > 0 ? c.fromFree / total : 0;
    d.freeGenes += c.fromFree;
    d.paidGenes += c.fromPaid;
    d.freeCostRub += costRub * freeShare;
    d.paidCostRub += costRub * (1 - freeShare);
    d.charges += 1;
    d.emails.add(c.email);
    const a = byAction.get(c.action) ?? { action: c.action, freeGenes: 0, charges: 0 };
    a.freeGenes += c.fromFree;
    a.charges += 1;
    byAction.set(c.action, a);
  }
  const days: SpendDay[] = [...dayMap.values()]
    .map(({ emails, ...d }) => ({
      ...d,
      users: emails.size,
      freeCostRub: Math.round(d.freeCostRub),
      paidCostRub: Math.round(d.paidCostRub),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const totals = days.reduce(
    (acc, d) => ({
      freeGenes: acc.freeGenes + d.freeGenes,
      paidGenes: acc.paidGenes + d.paidGenes,
      freeCostRub: acc.freeCostRub + d.freeCostRub,
      paidCostRub: acc.paidCostRub + d.paidCostRub,
      charges: acc.charges + d.charges,
      users: acc.users, // уникальные за период считаем ниже
      estimated: acc.estimated + d.estimated,
    }),
    {
      freeGenes: 0,
      paidGenes: 0,
      freeCostRub: 0,
      paidCostRub: 0,
      charges: 0,
      users: 0,
      estimated: 0,
    },
  );
  totals.users = new Set(winCharges.map((c) => c.email)).size;

  return {
    days,
    totals,
    avgFreeGenesPerDay: Math.round((totals.freeGenes / periodDays) * 10) / 10,
    avgFreeCostRubPerDay: Math.round(totals.freeCostRub / periodDays),
    byAction: [...byAction.values()].sort((a, b) => b.freeGenes - a.freeGenes),
    periodDays,
    from: fromDate,
    to: today,
    rubPerUsd: RUB_PER_USD,
  };
}
