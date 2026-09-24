import { Pool } from "pg";

/**
 * Sparks ledger on Postgres. Every balance change is a row in billing_tx
 * (the source of truth for disputes); billing_balance keeps the cached total.
 * When no Postgres is configured (pure-local demo), billing is disabled and
 * everything is free — the callers check `billingEnabled()`.
 *
 * Рядом живёт billing_refunds — реестр возвратов денег: сколько кому вернули
 * и сколько генов при этом аннулировали (оферта п. 9.10–9.11).
 */

/**
 * Тип операции. Разделение topup/bonus введено 2026-09-24 и несёт денежный
 * смысл, а не косметический:
 *
 *  - `topup` — ТОЛЬКО реальные деньги. С 24.09.2026 сумма такой записи равна
 *    рублям, которые человек заплатил (1 ген = 1 ₽), поэтому «сколько заплатил»
 *    считается одним SUM, а не разбором комментария.
 *  - `bonus` — подарочные гены, за которые денег не приходило: бонус пакета,
 *    промокод, реферальные начисления. Возврату деньгами не подлежат (оферта
 *    п. 9.9), в базу расчёта возврата не входят.
 *
 * До 24.09.2026 бонус пакета сидел ВНУТРИ суммы записи `topup`, а число пряталось
 * в комментарии. Старые строки так и остались — их разбирает legacyBonusInComment.
 */
export type TxType = "welcome" | "topup" | "bonus" | "charge" | "refund" | "admin";

/**
 * Бонус, зашитый в сумму пополнения ДО разделения типов (24.09.2026):
 * комментарий вида «ЮKassa: 200 ₽ (+35 бонус, промокод X), платёж …».
 * Для новых записей всегда 0 — бонус лежит отдельной строкой типа `bonus`.
 */
export function legacyBonusInComment(comment: string | null): number {
  const m = /\(\+(\d+)\s*бонус/.exec(comment ?? "");
  return m ? Number(m[1]) : 0;
}

export type SparkTransaction = {
  id: number;
  email: string;
  amount: number;
  type: TxType;
  action: string | null;
  reference: string | null;
  comment: string | null;
  createdAt: string;
};

export function billingEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.PGHOST);
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = process.env.DATABASE_URL
      ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
      : new Pool({ max: 5 });
  }
  return pool;
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getPool().query(`
        create table if not exists billing_balance (
          email text primary key,
          balance int not null default 0
        );
        create table if not exists billing_tx (
          id bigserial primary key,
          email text not null,
          amount int not null,
          type text not null,
          action text,
          reference text unique,
          comment text,
          created_at timestamptz not null default now()
        );
        create index if not exists billing_tx_email_idx on billing_tx (email, created_at desc);
        -- Реестр возвратов денег (24.09.2026). Нужен, чтобы формула п. 9.10
        -- помнила, сколько человеку уже вернули: иначе после возврата и нового
        -- пополнения она предлагала вернуть всю сумму заново, включая бонус
        -- пакета, и цикл можно было повторять. Заодно это учёт возвратов для
        -- отчётности — сумма отсюда вычитается из выручки.
        create table if not exists billing_refunds (
          id bigserial primary key,
          email text not null,
          payment_id text,
          amount_rub int not null,
          genes_annulled int not null default 0,
          comment text,
          created_at timestamptz not null default now()
        );
        create index if not exists billing_refunds_email_idx on billing_refunds (email);
      `);
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

/**
 * Гарантировать, что таблицы биллинга созданы. Нужно тем модулям, которые
 * читают billing_tx / billing_refunds своим пулом (отчёт по источникам): у них
 * своя ensureSchema, и без этого вызова запрос мог упасть на свежем деплое,
 * если до него никто не трогал баланс.
 */
export async function ensureBillingSchema(): Promise<void> {
  await ensureSchema();
}

export async function getBalance(email: string): Promise<number> {
  await ensureSchema();
  const { rows } = await getPool().query<{ balance: number }>(
    "select balance from billing_balance where email = $1",
    [email],
  );
  return rows[0]?.balance ?? 0;
}

/**
 * Apply a balance change (positive = credit, negative = charge) atomically.
 * `reference` deduplicates: the same reference is applied exactly once (a
 * repeated call returns the current balance without a second write) — this is
 * what makes async-poll charging and welcome bonuses idempotent.
 */
export async function applyTx(args: {
  email: string;
  amount: number;
  type: TxType;
  action?: string;
  reference?: string;
  comment?: string;
  /**
   * Для списаний: не дать балансу уйти в минус. Уменьшение делается атомарным
   * UPDATE с условием `balance >= |amount|`; если средств не хватает —
   * транзакция откатывается целиком (строка billing_tx тоже), возвращается
   * `insufficient: true`. Закрывает гонку «проверил баланс → списал»
   * (аудит 2026-08-26): N параллельных запросов больше не могут все пройти.
   */
  guardNonNegative?: boolean;
}): Promise<{ balance: number; applied: boolean; insufficient?: boolean }> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const inserted = await client.query(
      `insert into billing_tx (email, amount, type, action, reference, comment)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (reference) do nothing
       returning id`,
      [
        args.email,
        args.amount,
        args.type,
        args.action ?? null,
        args.reference ?? null,
        args.comment ?? null,
      ],
    );
    let balance: number;
    if (inserted.rows[0]) {
      if (args.guardNonNegative && args.amount < 0) {
        // атомарное условное списание: одна строка обновится только если
        // средств хватает; конкурентные запросы упрутся здесь, а не в минус
        const upd = await client.query<{ balance: number }>(
          `update billing_balance set balance = balance + $2
             where email = $1 and balance + $2 >= 0
           returning balance`,
          [args.email, args.amount],
        );
        if (upd.rowCount === 0) {
          await client.query("rollback");
          const cur = await getPool().query<{ balance: number }>(
            "select balance from billing_balance where email = $1",
            [args.email],
          );
          return { balance: cur.rows[0]?.balance ?? 0, applied: false, insufficient: true };
        }
        balance = upd.rows[0].balance;
      } else {
        const upd = await client.query<{ balance: number }>(
          `insert into billing_balance (email, balance) values ($1, $2)
           on conflict (email) do update set balance = billing_balance.balance + $2
           returning balance`,
          [args.email, args.amount],
        );
        balance = upd.rows[0].balance;
      }
    } else {
      const cur = await client.query<{ balance: number }>(
        "select balance from billing_balance where email = $1",
        [args.email],
      );
      balance = cur.rows[0]?.balance ?? 0;
    }
    await client.query("commit");
    return { balance, applied: Boolean(inserted.rows[0]) };
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function listTransactions(opts: {
  email?: string;
  limit?: number;
}): Promise<SparkTransaction[]> {
  await ensureSchema();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const { rows } = opts.email
    ? await getPool().query(
        `select * from billing_tx where email = $1 order by created_at desc limit $2`,
        [opts.email, limit],
      )
    : await getPool().query(`select * from billing_tx order by created_at desc limit $1`, [limit]);
  return rows.map((r) => ({
    id: Number(r.id),
    email: r.email,
    amount: r.amount,
    type: r.type,
    action: r.action,
    reference: r.reference,
    comment: r.comment,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/**
 * Весь журнал в хронологическом порядке — для отчёта «Расходы», где надо
 * прогнать баланс каждого пользователя с нуля (какие списания шли из подарочных
 * генов, какие из оплаченных). Объём небольшой (тысячи строк), читаем целиком.
 */
export async function allTransactionsAsc(): Promise<SparkTransaction[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `select * from billing_tx order by created_at asc, id asc`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    email: r.email,
    amount: r.amount,
    type: r.type,
    action: r.action,
    reference: r.reference,
    comment: r.comment,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/**
 * РЕАЛЬНЫЕ платежи (ЮKassa, reference 'yk-…') за конкретный МОСКОВСКИЙ день —
 * для выгрузки чеков в «Отчётах». Промо-начисления и бонусы сюда НЕ попадают:
 * чек = поступление денег. Границы дня считаем в +03:00 (налоговая отчётность
 * по московскому времени).
 */
export async function paymentsOnDate(dateStr: string): Promise<SparkTransaction[]> {
  await ensureSchema();
  const from = `${dateStr}T00:00:00+03:00`;
  const { rows } = await getPool().query(
    `select * from billing_tx
      where type = 'topup'
        and reference like 'yk-%'
        and created_at >= $1::timestamptz
        and created_at < $1::timestamptz + interval '1 day'
      order by created_at asc`,
    [from],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    email: r.email,
    amount: r.amount,
    type: r.type,
    action: r.action,
    reference: r.reference,
    comment: r.comment,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** Суммарные обязательства: сколько генов на балансах всех пользователей. */
export async function totalUserBalance(): Promise<{ totalGenes: number; accounts: number }> {
  await ensureSchema();
  const { rows } = await getPool().query<{ total: string | null; accounts: string }>(
    `select coalesce(sum(balance), 0) as total, count(*) filter (where balance > 0) as accounts
       from billing_balance`,
  );
  return { totalGenes: Number(rows[0].total ?? 0), accounts: Number(rows[0].accounts) };
}

export type RefundEstimate = {
  /** рублей реально заплачено через ЮKassa за всё время */
  paidRub: number;
  /** рублей уже возвращено по прошлым заявлениям */
  refundedRub: number;
  /** стоимость фактически оказанных услуг по прайсу (списания минус возвраты генов) */
  servicesRub: number;
  /** сколько подарено бонусных генов — справочно, в расчёт НЕ входит */
  bonusGenes: number;
  /** к возврату деньгами */
  refundableRub: number;
  balance: number;
};

/**
 * Чей это платёж ЮKassa. Нужно при оформлении возврата: если владелец ошибётся
 * в id платежа, откат реферальных начислений задел бы чужую цепочку.
 */
export async function paymentOwner(paymentId: string): Promise<string | null> {
  await ensureSchema();
  const { rows } = await getPool().query<{ email: string }>(
    "select email from billing_tx where reference = $1 and type = 'topup'",
    [`yk-${paymentId}`],
  );
  return rows[0]?.email ?? null;
}

/** Сколько денег человеку уже вернули по прошлым заявлениям. */
export async function refundedTotal(email: string): Promise<number> {
  await ensureSchema();
  const { rows } = await getPool().query<{ total: string | null }>(
    "select sum(amount_rub)::text as total from billing_refunds where email = $1",
    [email],
  );
  return Number(rows[0]?.total ?? 0);
}

/** Записать факт возврата в реестр (вызывается из processRefund). */
export async function recordRefund(args: {
  email: string;
  paymentId?: string;
  amountRub: number;
  genesAnnulled: number;
  comment?: string;
}): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `insert into billing_refunds (email, payment_id, amount_rub, genes_annulled, comment)
     values ($1, $2, $3, $4, $5)`,
    [args.email, args.paymentId ?? null, args.amountRub, args.genesAnnulled, args.comment ?? null],
  );
}

/**
 * Сколько денег вернуть по заявлению (оферта п. 9.9–9.10).
 *
 * Формула: уплаченные рубли − стоимость фактически оказанных услуг по прайсу,
 * не больше уплаченного и не меньше нуля. Бонусные гены не участвуют: они не
 * увеличивают сумму возврата и не уменьшают её.
 *
 * Почему именно так. Баланс — один котёл, и вопрос «человек потратил бонусные
 * гены или свои» не имеет ответа: любое деление было бы нашей выдумкой, и в
 * споре нас на ней поймают. Считать надо не котлы, а две честные цифры —
 * сколько заплатил и на сколько получил услуг. Формула заодно закрывает схему
 * «пополнился на 100, взял 100 бонусом, потратил всё, требую 100 назад»:
 * услуг оказано на 100 ₽, возвращать нечего.
 *
 * Потолок по текущему балансу — страховка от ручных списаний админа: если гены
 * уже сняли с баланса, вернуть за них деньги нельзя.
 *
 * Уже возвращённые деньги вычитаются из базы (реестр billing_refunds). Без
 * этого схема повторялась: человек возвращал 1000 ₽, пополнялся снова, и
 * формула предлагала вернуть 1100 ₽ — весь новый платёж плюс бонус пакета.
 */
export async function estimateRefund(email: string): Promise<RefundEstimate> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    type: string;
    amount: number;
    reference: string | null;
    comment: string | null;
  }>("select type, amount, reference, comment from billing_tx where email = $1", [email]);

  let paidRub = 0;
  let servicesRub = 0;
  let bonusGenes = 0;
  for (const r of rows) {
    switch (r.type) {
      case "topup":
        // деньги — только ЮKassa; промо-начисления и демо-оплаты деньгами не были
        if (r.reference?.startsWith("yk-")) {
          const legacy = Math.min(legacyBonusInComment(r.comment), r.amount);
          paidRub += r.amount - legacy;
          bonusGenes += legacy;
        } else {
          bonusGenes += r.amount;
        }
        break;
      case "bonus":
      case "welcome":
        bonusGenes += r.amount;
        break;
      case "charge":
        servicesRub += -r.amount;
        break;
      case "refund":
        // гены вернули за неудачную генерацию — услуга не была оказана
        servicesRub -= r.amount;
        break;
      case "admin":
        // ручное начисление владельца — такой же подарок, денег за него не
        // приходило; ручное списание в базу возврата не лезет, но потолок по
        // балансу его уже учитывает
        if (r.amount > 0) bonusGenes += r.amount;
        break;
      default:
        break;
    }
  }
  const [balance, refundedRub] = await Promise.all([getBalance(email), refundedTotal(email)]);
  const services = Math.max(servicesRub, 0);
  // сколько денег этого человека ещё «не отработано и не возвращено»
  const left = paidRub - refundedRub;
  const refundableRub = Math.max(0, Math.min(left - services, left, balance));
  return { paidRub, refundedRub, servicesRub: services, bonusGenes, refundableRub, balance };
}

/** balances for the admin table, keyed by email */
export async function balancesFor(emails: string[]): Promise<Record<string, number>> {
  if (!emails.length) return {};
  await ensureSchema();
  const { rows } = await getPool().query<{ email: string; balance: number }>(
    "select email, balance from billing_balance where email = any($1)",
    [emails],
  );
  return Object.fromEntries(rows.map((r) => [r.email, r.balance]));
}
