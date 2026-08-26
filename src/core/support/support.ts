import "server-only";
import { Pool } from "pg";

/**
 * Обращения в поддержку. Храним в Postgres (чтобы был список и ничего не
 * терялось), плюс шлём уведомление в Telegram владельцу. Без Postgres
 * (локальный файловый режим) просто не храним — уведомление всё равно уйдёт.
 */
export type SupportTicket = {
  id: number;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
};

function pgEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.PGHOST);
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;
function getPool(): Pool {
  if (!pool) {
    pool = process.env.DATABASE_URL
      ? new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
      : new Pool({ max: 3 });
  }
  return pool;
}
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(
        `create table if not exists support_tickets (
           id bigserial primary key,
           email text not null,
           subject text not null default '',
           message text not null,
           created_at timestamptz not null default now()
         )`,
      )
      .then(() => undefined)
      .catch((e) => {
        schemaReady = null;
        throw e;
      });
  }
  return schemaReady;
}

export async function saveTicket(args: {
  email: string;
  subject: string;
  message: string;
}): Promise<number | null> {
  if (!pgEnabled()) return null;
  await ensureSchema();
  const { rows } = await getPool().query<{ id: string }>(
    `insert into support_tickets (email, subject, message) values ($1, $2, $3) returning id`,
    [args.email, args.subject.slice(0, 200), args.message.slice(0, 4000)],
  );
  return Number(rows[0].id);
}
