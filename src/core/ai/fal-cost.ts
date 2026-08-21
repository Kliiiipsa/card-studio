import "server-only";

/**
 * Реальная стоимость генерации по данным fal.
 *
 * У fal НЕТ публичного API «сколько стоил запрос N»: очередь отдаёт только
 * время инференса, а /billing/invoices требует ADMIN-ключ и даёт месячные
 * суммы. Поэтому цену берём из самого достоверного источника, который доступен
 * — из остатка на счёте: читаем баланс до отправки задачи и после её
 * завершения, разница = то, что fal с нас списал. Это не прайс-лист и не
 * прикидка, а фактическое списание.
 *
 * Ограничение: если в окне между замерами шла ещё одна генерация, дельта
 * содержит их сумму. Такие случаи помечаем как неточные (exact: false), в
 * админке они показываются со знаком «≈».
 */

const BALANCE_URL = "https://rest.fal.ai/billing/user_balance";

/** сколько задач fal сейчас в работе — для отметки точности замера */
let inFlight = 0;

export function falJobStarted(): void {
  inFlight += 1;
}

export function falJobFinished(): void {
  inFlight = Math.max(0, inFlight - 1);
}

export function falJobsInFlight(): number {
  return inFlight;
}

/** Остаток на счёте fal в долларах; null — если прочитать не удалось. */
export async function readFalBalance(): Promise<number | null> {
  const key = process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "";
  if (!key) return null;
  try {
    const res = await fetch(BALANCE_URL, {
      headers: { Authorization: `Key ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const usd = Number((await res.text()).trim());
    return Number.isFinite(usd) ? usd : null;
  } catch {
    return null;
  }
}

export type FalCost = { usd: number | null; exact: boolean };

/**
 * Досчитать стоимость по остатку счёта.
 *
 * ВАЖНО (замерено 2026-08-21): fal списывает с баланса НЕ мгновенно — деньги
 * за инфографику появились в остатке примерно через полминуты после
 * завершения задачи. Поэтому ждём терпеливо (по умолчанию до 2 минут).
 * Вызывать это нужно в фоне, уже после того, как клиент получил результат:
 * замер не должен задерживать ответ.
 */
export async function settleFalCost(
  balanceBefore: number | null | undefined,
  /** concurrentAtStart — сколько ЧУЖИХ задач fal шло в момент отправки */
  opts: { concurrentAtStart?: number; maxWaitMs?: number } = {},
): Promise<FalCost> {
  if (typeof balanceBefore !== "number") return { usd: null, exact: false };

  const deadline = Date.now() + (opts.maxWaitMs ?? 120_000);
  const STEP_MS = 5000;
  for (;;) {
    const after = await readFalBalance();
    if (after !== null) {
      const delta = balanceBefore - after;
      if (delta > 0) {
        // параллельные задачи в окне замера → дельта общая, помечаем как «≈»
        const exact = (opts.concurrentAtStart ?? 0) === 0 && inFlight <= 1;
        return { usd: Number(delta.toFixed(4)), exact };
      }
    }
    if (Date.now() + STEP_MS > deadline) return { usd: null, exact: false };
    await new Promise((r) => setTimeout(r, STEP_MS));
  }
}

/**
 * Фоновый замер для СИНХРОННЫХ генераций: клиент уже получил картинку, а мы
 * ещё пару минут ждём, когда fal спишет деньги, и дописываем цену в задачу.
 */
export function settleFalCostInBackground(
  jobId: string,
  balanceBefore: number | null | undefined,
  opts: { concurrentAtStart?: number } = {},
): void {
  if (typeof balanceBefore !== "number") return;
  void (async () => {
    try {
      const cost = await settleFalCost(balanceBefore, opts);
      if (cost.usd === null) return;
      const { setJobCost } = await import("@/core/jobs/jobs");
      await setJobCost(jobId, cost.usd, cost.exact);
    } catch (e) {
      console.error("[fal-cost] background settle failed:", e);
    }
  })();
}
