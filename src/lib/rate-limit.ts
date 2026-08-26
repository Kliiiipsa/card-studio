import "server-only";
import { AppError } from "./errors";

/**
 * Ограничитель частоты запросов (аудит 2026-08-26). Раньше лимитов не было
 * нигде: с одного IP можно было наплодить сотни аккаунтов в минуту и завалить
 * бесплатные ИИ-роуты, сжигая наши токены. Фиксированное окно в памяти
 * процесса — Timeweb работает одним инстансом, этого достаточно; при рестарте
 * счётчики сбрасываются, что для коротких окон нормально.
 */

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number): void {
  // редкая уборка протухших ключей, чтобы Map не рос бесконечно
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
}

/**
 * Проверить и учесть запрос. Возвращает { ok, retryAfterSec }.
 * НЕ бросает — вызывающий сам решает, что делать (или зовёт enforceRateLimit).
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  const b = store.get(key);
  if (!b || b.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (b.count >= opts.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Как rateLimit, но при превышении сразу бросает 429 с понятным текстом. */
export function enforceRateLimit(
  key: string,
  opts: { limit: number; windowMs: number; message?: string },
): void {
  const { ok, retryAfterSec } = rateLimit(key, opts);
  if (!ok) {
    throw new AppError(
      opts.message ?? `Слишком много запросов. Повторите через ${retryAfterSec} с.`,
      429,
    );
  }
}
