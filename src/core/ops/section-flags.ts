import "server-only";
import { Pool } from "pg";
import type { SparkAction } from "@/core/billing/prices";

/**
 * Экстренные рубильники разделов (запрос пользователя 2026-08-25): админ в
 * один клик закрывает раздел «на технические работы» БЕЗ деплоя. Проверка —
 * на сервере в requireSparks, поэтому срабатывает и для давно открытых
 * вкладок: любой новый запуск получает вежливый отказ, а уже идущие
 * генерации спокойно доезжают (блокируется только вход, не завершение).
 * Админа рубильник не ограничивает — можно чинить и проверять на проде.
 */
export const SWITCHABLE_SECTIONS: { action: SparkAction; label: string }[] = [
  { action: "generate", label: "Фото товара" },
  { action: "infographic", label: "Инфографика" },
  { action: "video", label: "Видео товара" },
  { action: "seo", label: "SEO-тексты" },
  { action: "analyze", label: "Анализ карточки" },
  { action: "compare", label: "Сравнение карточек" },
  { action: "turnkey", label: "Карточка под ключ" },
];

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
        `create table if not exists section_flags (
           action text primary key,
           disabled boolean not null default false,
           updated_at timestamptz not null default now()
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

/** Кеш на несколько секунд: рубильник почти мгновенный, а БД не дёргается на каждый запрос. */
const CACHE_MS = 10_000;
let cache: { at: number; disabled: Set<string> } | null = null;

/** Множество выключенных разделов. Ошибка БД = ничего не выключено (сервис важнее рубильника). */
export async function disabledSections(): Promise<Set<string>> {
  if (!pgEnabled()) return new Set();
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.disabled;
  try {
    await ensureSchema();
    const { rows } = await getPool().query<{ action: string }>(
      "select action from section_flags where disabled = true",
    );
    cache = { at: Date.now(), disabled: new Set(rows.map((r) => r.action)) };
    return cache.disabled;
  } catch (e) {
    console.error("[section-flags] read failed:", e);
    return cache?.disabled ?? new Set();
  }
}

export async function setSectionDisabled(action: string, disabled: boolean): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `insert into section_flags (action, disabled, updated_at) values ($1, $2, now())
     on conflict (action) do update set disabled = $2, updated_at = now()`,
    [action, disabled],
  );
  cache = null; // рубильник должен сработать сразу, не через 10 секунд
}

export async function listSectionFlags(): Promise<{ action: string; disabled: boolean }[]> {
  const disabled = await disabledSections();
  return SWITCHABLE_SECTIONS.map((s) => ({
    action: s.action,
    disabled: disabled.has(s.action),
  }));
}
