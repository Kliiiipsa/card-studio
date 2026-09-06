import "server-only";
import { getPool } from "@/core/auth/store-pg";

/**
 * Лимиты публичного бота: 2 проверки в день на пользователя Telegram + общий
 * дневной потолок расходов. Счётчики в Postgres (переживают рестарт), в
 * dev без БД — в памяти. Никаких персональных данных: только числовой id
 * Telegram, username не храним.
 */
export const PER_USER_PER_DAY = 2;
export const GLOBAL_PER_DAY = 500;

const pgOn = () => Boolean(process.env.PGHOST || process.env.DATABASE_URL);

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= getPool()
    .query(
      `create table if not exists tg_checks (
         user_id bigint not null,
         day date not null,
         count int not null default 0,
         primary key (user_id, day)
       );`,
    )
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

const mem = new Map<string, number>();
const today = () => new Date().toISOString().slice(0, 10);

export type LimitVerdict = { allowed: boolean; usedToday: number; globalFull?: boolean };

function takeMem(userId: number, day: string): LimitVerdict {
  const k = `${userId}:${day}`;
  const used = mem.get(k) ?? 0;
  if (used >= PER_USER_PER_DAY) return { allowed: false, usedToday: used };
  mem.set(k, used + 1);
  return { allowed: true, usedToday: used + 1 };
}

/** Проверить и сразу занять слот (если разрешено). БД недоступна → память:
 *  лимит на человека всё равно держится, бот не молчит из-за базы. */
export async function takeCheckSlot(userId: number): Promise<LimitVerdict> {
  const day = today();
  if (!pgOn()) return takeMem(userId, day);
  try {
    return await takePg(userId, day);
  } catch (e) {
    console.error("[tgbot] limits db failed, using memory:", e instanceof Error ? e.message : e);
    return takeMem(userId, day);
  }
}

async function takePg(userId: number, day: string): Promise<LimitVerdict> {
  await ensure();
  const pool = getPool();
  const { rows: g } = await pool.query<{ total: string }>(
    `select coalesce(sum(count), 0)::text as total from tg_checks where day = $1`,
    [day],
  );
  if (Number(g[0]?.total ?? 0) >= GLOBAL_PER_DAY) return { allowed: false, usedToday: 0, globalFull: true };
  const { rows } = await pool.query<{ count: number }>(
    `insert into tg_checks (user_id, day, count) values ($1, $2, 1)
     on conflict (user_id, day) do update
       set count = tg_checks.count + 1
       where tg_checks.count < $3
     returning count`,
    [userId, day, PER_USER_PER_DAY],
  );
  if (!rows.length) return { allowed: false, usedToday: PER_USER_PER_DAY };
  return { allowed: true, usedToday: rows[0].count };
}

/** Вернуть слот, если анализ упал по нашей вине — человек не должен терять попытку. */
export async function releaseCheckSlot(userId: number): Promise<void> {
  const day = today();
  if (!pgOn()) {
    const k = `${userId}:${day}`;
    mem.set(k, Math.max(0, (mem.get(k) ?? 0) - 1));
    return;
  }
  try {
    await ensure();
    await getPool().query(
      `update tg_checks set count = greatest(0, count - 1) where user_id = $1 and day = $2`,
      [userId, day],
    );
  } catch (e) {
    console.error("[tgbot] release failed:", e);
  }
}

/* ------------------------- клики по ссылке из бота ------------------------- */
// Ссылка в ответе бота ведёт на /go/tg → счётчик по дням → редирект на сайт с UTM.
// Персональных данных нет: только число переходов за день.

let clicksReady: Promise<void> | null = null;
function ensureClicks(): Promise<void> {
  clicksReady ??= getPool()
    .query(`create table if not exists tg_clicks (day date primary key, count int not null default 0);`)
    .then(() => undefined)
    .catch((e) => {
      clicksReady = null;
      throw e;
    });
  return clicksReady;
}
const memClicks = new Map<string, number>();

export async function recordBotClick(): Promise<void> {
  const day = today();
  if (!pgOn()) {
    memClicks.set(day, (memClicks.get(day) ?? 0) + 1);
    return;
  }
  try {
    await ensureClicks();
    await getPool().query(
      `insert into tg_clicks (day, count) values ($1, 1)
       on conflict (day) do update set count = tg_clicks.count + 1`,
      [day],
    );
  } catch (e) {
    console.error("[tgbot] click record failed:", e instanceof Error ? e.message : e);
  }
}

export type BotStats = {
  /** уникальные пользователи Telegram, делавшие проверку */
  users: { today: number; d30: number; all: number };
  checks: { today: number; d30: number; all: number };
  clicks: { today: number; d30: number; all: number };
};

/** Для админки: люди, проверки и переходы по ссылке — сегодня / 30 дней / всего. */
export async function botStats(): Promise<BotStats> {
  const zero = { today: 0, d30: 0, all: 0 };
  if (!pgOn()) {
    const day = today();
    const checksToday = [...mem.entries()].filter(([k]) => k.endsWith(day)).reduce((a, [, v]) => a + v, 0);
    const checksAll = [...mem.values()].reduce((a, b) => a + b, 0);
    const usersAll = new Set([...mem.keys()].map((k) => k.split(":")[0])).size;
    const clicksAll = [...memClicks.values()].reduce((a, b) => a + b, 0);
    return {
      users: { today: usersAll, d30: usersAll, all: usersAll },
      checks: { today: checksToday, d30: checksAll, all: checksAll },
      clicks: { today: memClicks.get(day) ?? 0, d30: clicksAll, all: clicksAll },
    };
  }
  try {
    await ensure();
    await ensureClicks();
    const pool = getPool();
    const q = async (sql: string) => (await pool.query<{ t: string; d: string; a: string }>(sql)).rows[0];
    const c = await q(
      `select coalesce(sum(count) filter (where day = current_date), 0)::text as t,
              coalesce(sum(count) filter (where day >= current_date - 30), 0)::text as d,
              coalesce(sum(count), 0)::text as a from tg_checks`,
    );
    const u = await q(
      `select count(distinct user_id) filter (where day = current_date)::text as t,
              count(distinct user_id) filter (where day >= current_date - 30)::text as d,
              count(distinct user_id)::text as a from tg_checks`,
    );
    const k = await q(
      `select coalesce(sum(count) filter (where day = current_date), 0)::text as t,
              coalesce(sum(count) filter (where day >= current_date - 30), 0)::text as d,
              coalesce(sum(count), 0)::text as a from tg_clicks`,
    );
    const n = (r?: { t: string; d: string; a: string }) =>
      r ? { today: Number(r.t), d30: Number(r.d), all: Number(r.a) } : zero;
    return { users: n(u), checks: n(c), clicks: n(k) };
  } catch (e) {
    console.error("[tgbot] stats failed:", e instanceof Error ? e.message : e);
    return { users: zero, checks: zero, clicks: zero };
  }
}
