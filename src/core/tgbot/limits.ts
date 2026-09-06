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

/** Для админки/логов: сколько людей и проверок за период. */
export async function botStats(days = 30): Promise<{ users: number; checks: number }> {
  if (!pgOn()) return { users: mem.size, checks: [...mem.values()].reduce((a, b) => a + b, 0) };
  try {
    await ensure();
    const { rows } = await getPool().query<{ users: string; checks: string }>(
      `select count(distinct user_id)::text as users, coalesce(sum(count),0)::text as checks
         from tg_checks where day >= current_date - $1::int`,
      [days],
    );
    return { users: Number(rows[0]?.users ?? 0), checks: Number(rows[0]?.checks ?? 0) };
  } catch {
    return { users: 0, checks: 0 };
  }
}
