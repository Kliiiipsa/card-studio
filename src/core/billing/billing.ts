import { Pool } from "pg";

/**
 * Sparks ledger on Postgres. Every balance change is a row in billing_tx
 * (the source of truth for disputes); billing_balance keeps the cached total.
 * When no Postgres is configured (pure-local demo), billing is disabled and
 * everything is free — the callers check `billingEnabled()`.
 */
export type TxType = "welcome" | "topup" | "charge" | "refund" | "admin";

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
      `);
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
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
}): Promise<{ balance: number; applied: boolean }> {
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
      const upd = await client.query<{ balance: number }>(
        `insert into billing_balance (email, balance) values ($1, $2)
         on conflict (email) do update set balance = billing_balance.balance + $2
         returning balance`,
        [args.email, args.amount],
      );
      balance = upd.rows[0].balance;
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
