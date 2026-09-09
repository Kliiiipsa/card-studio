import "server-only";
import { Pool } from "pg";

/**
 * Уведомления сервиса — «колокольчик» в шапке студии. Владелец пишет из
 * админки: акция, технические работы, новая функция. Клиент видит красную
 * точку, открывает список, точка гаснет.
 *
 * Прочтения храним пер-аккаунт (email + id уведомления): счётчик «непрочитано»
 * должен быть у каждого свой, а «отметить всё прочитанным» — не терять новые
 * уведомления, появившиеся позже.
 *
 * Без Postgres (локальный файловый режим) раздел просто пуст — колокольчик не
 * показываем, ошибок не бросаем.
 */

export type NoticeKind = "info" | "promo" | "maintenance";

export type Notice = {
  id: number;
  kind: NoticeKind;
  title: string;
  body: string;
  /** необязательная ссылка «Подробнее» — только внутренний путь вида /billing */
  url: string | null;
  /** показывать полосой во всю ширину под шапкой — для важного (техработы, акция) */
  banner: boolean;
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
};

/** то же плюс признак «этот я ещё не читал» — для клиента */
export type NoticeForUser = Notice & { read: boolean };

export const NOTICE_KINDS: NoticeKind[] = ["info", "promo", "maintenance"];

export function noticesEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.PGHOST);
}

/**
 * Кому показываем колокольчик. Сначала только админ — как с пакетом «Фото
 * товара»; раскатка на всех = env NOTICES=all без правки кода.
 */
export function noticeBellEnabled(role?: string | null): boolean {
  return role === "admin" || process.env.NOTICES === "all";
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
    schemaReady = (async () => {
      await getPool().query(`
        create table if not exists notices (
          id bigserial primary key,
          kind text not null default 'info',
          title text not null,
          body text not null default '',
          url text,
          active boolean not null default true,
          created_at timestamptz not null default now(),
          expires_at timestamptz
        );
        create index if not exists notices_active_idx on notices (active, created_at desc);
        alter table notices add column if not exists banner boolean not null default false;
        create table if not exists notice_reads (
          email text not null,
          notice_id bigint not null references notices (id) on delete cascade,
          read_at timestamptz not null default now(),
          primary key (email, notice_id)
        );
      `);
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

type Row = {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  banner: boolean;
  active: boolean;
  created_at: Date;
  expires_at: Date | null;
};

function toNotice(r: Row): Notice {
  return {
    id: Number(r.id),
    kind: (NOTICE_KINDS as string[]).includes(r.kind) ? (r.kind as NoticeKind) : "info",
    title: r.title,
    body: r.body,
    url: r.url,
    banner: r.banner,
    active: r.active,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
  };
}

/** Живые уведомления для клиента + признак прочтения. Новые — сверху. */
export async function listForUser(email: string, limit = 20): Promise<NoticeForUser[]> {
  if (!noticesEnabled()) return [];
  await ensureSchema();
  const { rows } = await getPool().query<Row & { read_at: Date | null }>(
    `select n.*, r.read_at
       from notices n
       left join notice_reads r on r.notice_id = n.id and r.email = $1
      where n.active
        and (n.expires_at is null or n.expires_at > now())
      order by n.created_at desc
      limit $2`,
    [email, limit],
  );
  return rows.map((r) => ({ ...toNotice(r), read: r.read_at !== null }));
}

/** Отметить прочитанными все уведомления, которые человек сейчас видит. */
export async function markRead(email: string, ids: number[]): Promise<void> {
  if (!noticesEnabled() || !ids.length) return;
  await ensureSchema();
  await getPool().query(
    `insert into notice_reads (email, notice_id)
       select $1, unnest($2::bigint[])
       on conflict do nothing`,
    [email, ids],
  );
}

/* --------------------------------- админка -------------------------------- */

export async function listAll(limit = 100): Promise<Notice[]> {
  if (!noticesEnabled()) return [];
  await ensureSchema();
  const { rows } = await getPool().query<Row>(
    `select * from notices order by created_at desc limit $1`,
    [limit],
  );
  return rows.map(toNotice);
}

export async function createNotice(args: {
  kind: NoticeKind;
  title: string;
  body: string;
  url?: string | null;
  banner?: boolean;
  expiresAt?: string | null;
}): Promise<Notice> {
  await ensureSchema();
  const { rows } = await getPool().query<Row>(
    `insert into notices (kind, title, body, url, banner, expires_at)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [
      args.kind,
      args.title.slice(0, 120),
      args.body.slice(0, 2000),
      args.url?.slice(0, 300) || null,
      args.banner ?? false,
      args.expiresAt || null,
    ],
  );
  return toNotice(rows[0]);
}

export async function setActive(id: number, active: boolean): Promise<void> {
  await ensureSchema();
  await getPool().query(`update notices set active = $2 where id = $1`, [id, active]);
}

export async function deleteNotice(id: number): Promise<void> {
  await ensureSchema();
  await getPool().query(`delete from notices where id = $1`, [id]);
}

/** Сколько человек уже открыло уведомление — видно в админке. */
export async function readCounts(ids: number[]): Promise<Record<number, number>> {
  if (!noticesEnabled() || !ids.length) return {};
  await ensureSchema();
  const { rows } = await getPool().query<{ notice_id: string; n: string }>(
    `select notice_id, count(*) as n from notice_reads
      where notice_id = any($1::bigint[]) group by notice_id`,
    [ids],
  );
  return Object.fromEntries(rows.map((r) => [Number(r.notice_id), Number(r.n)]));
}

/** Стереть прочтения при удалении аккаунта (см. core/auth/deletion.ts). */
export async function deleteReadsFor(email: string): Promise<void> {
  if (!noticesEnabled()) return;
  await ensureSchema();
  await getPool().query(`delete from notice_reads where email = $1`, [email]);
}
