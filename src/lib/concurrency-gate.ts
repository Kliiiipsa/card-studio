import "server-only";

/**
 * Клапан одновременных генераций (admission control) на один инстанс.
 *
 * Зачем: под пиком слишком много ПАРАЛЛЕЛЬНЫХ тяжёлых запросов (каждый держит
 * фото в памяти при отправке в fal) могут исчерпать RAM и уронить процесс.
 * Ограничиваем число одновременных — но НЕ грубым отказом: лишний запрос ЖДЁТ
 * свободный слот до `maxWaitMs` (визуально это просто чуть более долгий спиннер,
 * без пугающих сообщений). Мягкое сообщение показываем ТОЛЬКО если за это время
 * слот так и не освободился (сервер реально забит) — и гены при этом не списаны,
 * потому что клапан стоит ДО резерва и вызова fal.
 *
 * Слот держится лишь на время «тяжёлой» части запроса (обычно 1–3 с, до ответа/
 * постановки задачи в fal), потом сразу освобождается следующему в очереди —
 * поэтому пропускная способность высокая, а «N одновременных» ≠ «N человек всего».
 *
 * Состояние на globalThis, чтобы пережить HMR в dev. Один инстанс → глобально.
 */
type Gate = { active: number; waiters: Array<() => void> };

const gate: Gate = ((globalThis as Record<string, unknown>).__genGate ??= {
  active: 0,
  waiters: [],
}) as Gate;

function maxSlots(): number {
  const n = Number(process.env.GEN_MAX_CONCURRENT);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function defaultWaitMs(): number {
  const n = Number(process.env.GEN_MAX_WAIT_MS);
  return Number.isFinite(n) && n >= 0 ? n : 3000;
}

/** Мягкое, НЕ пугающее сообщение — только когда слот так и не освободился. */
export const GEN_BUSY_MESSAGE =
  "Сейчас много генераций одновременно — подождите минутку и попробуйте ещё раз. Гены не списаны.";

/**
 * Занять слот. Возвращает true, если слот получен (сразу или в течение ожидания),
 * false — если за `maxWaitMs` слот не освободился. Каждый успешный вызов ОБЯЗАН
 * иметь парный `releaseGenerationSlot()` в `finally`.
 */
export function acquireGenerationSlot(maxWaitMs = defaultWaitMs()): Promise<boolean> {
  if (gate.active < maxSlots()) {
    gate.active++;
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const onFree = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // наследуем освобождённый слот — active НЕ увеличиваем (его уже посчитали)
      resolve(true);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const i = gate.waiters.indexOf(onFree);
      if (i >= 0) gate.waiters.splice(i, 1);
      resolve(false);
    }, maxWaitMs);
    gate.waiters.push(onFree);
  });
}

/** Освободить слот: передать ожидающему в очереди либо уменьшить счётчик. */
export function releaseGenerationSlot(): void {
  const next = gate.waiters.shift();
  if (next) {
    next(); // слот переходит следующему, active не меняется
  } else {
    gate.active = Math.max(0, gate.active - 1);
  }
}

/** Для метрик/диагностики. */
export function generationGateState(): { active: number; waiting: number; max: number } {
  return { active: gate.active, waiting: gate.waiters.length, max: maxSlots() };
}
