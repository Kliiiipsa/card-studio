import "server-only";
import { monitorEventLoopDelay } from "node:perf_hooks";
import os from "node:os";
import { falJobsInFlight } from "@/core/ai/fal-cost";

/**
 * Показатели «здоровья» самого процесса для админской вкладки «Состояние» —
 * чтобы под рекламным наплывом сразу видеть, что пора усиливать сервер
 * (докупить RAM / ядра / поднять план), а не узнавать об этом от упавшего сайта.
 *
 * Всё считается ВНУТРИ процесса (Node), без внешних запросов:
 *  - RAM: process.memoryUsage().rss против лимита контейнера (env SERVER_RAM_MB).
 *  - CPU: os.loadavg() относительно числа ядер (на Linux; на Windows-деве = 0).
 *  - Отзывчивость: лаг event-loop (perf_hooks) — лучший признак «сервер задыхается».
 *  - Аптайм и число активных генераций.
 *
 * Здесь же — страховка от падения: логгеры unhandledRejection/uncaughtException.
 * Состояние живёт на globalThis, чтобы пережить HMR-перезагрузки модулей в dev.
 */
type EldHistogram = ReturnType<typeof monitorEventLoopDelay>;
type RuntimeState = { eld: EldHistogram | null; started: boolean };

const state: RuntimeState = ((globalThis as Record<string, unknown>).__runtimeMetrics ??= {
  eld: null,
  started: false,
}) as RuntimeState;

/** Запустить мониторы один раз при старте сервера (см. src/instrumentation.ts). */
export function startRuntimeMonitors(): void {
  if (state.started) return;
  state.started = true;

  // Гистограмма задержки event-loop: пока пусто/быстро — сервер здоров.
  try {
    const eld = monitorEventLoopDelay({ resolution: 20 });
    eld.enable();
    state.eld = eld;
  } catch {
    state.eld = null;
  }

  // Страховка от падения одного инстанса: не даём шальной ошибке уронить весь
  // сайт молча. unhandledRejection — логируем и продолжаем (иначе в свежих Node
  // процесс падает). uncaughtException — логируем и выходим: продолжать с
  // повреждённым состоянием опаснее, платформа Timeweb перезапустит процесс.
  process.on("unhandledRejection", (reason) => {
    console.error(
      "[unhandledRejection]",
      reason instanceof Error ? reason.stack : String(reason),
    );
  });
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err instanceof Error ? err.stack : String(err));
    process.exit(1);
  });
}

export type RuntimeMetrics = {
  rssMb: number;
  heapUsedMb: number;
  ramLimitMb: number;
  ramPct: number;
  cpuCount: number;
  load1: number;
  loadPct: number;
  lagMeanMs: number;
  lagMaxMs: number;
  uptimeSec: number;
  jobsInFlight: number;
};

export function getRuntimeMetrics(): RuntimeMetrics {
  // подстраховка: если instrumentation-хук не поднял мониторы (например, отключён
  // на этой платформе) — поднимем их лениво при первом обращении из админки.
  if (!state.started) startRuntimeMonitors();

  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1048576);
  const heapUsedMb = Math.round(mem.heapUsed / 1048576);
  const ramLimitMb = Number(process.env.SERVER_RAM_MB) || 2048;
  const ramPct = ramLimitMb > 0 ? Math.round((rssMb / ramLimitMb) * 100) : 0;

  const cpuCount = os.cpus()?.length || 1;
  const load1 = os.loadavg()[0] ?? 0;
  const loadPct = Math.round((load1 / cpuCount) * 100);

  let lagMeanMs = 0;
  let lagMaxMs = 0;
  if (state.eld) {
    lagMeanMs = Math.round((state.eld.mean || 0) / 1e6);
    lagMaxMs = Math.round((state.eld.max || 0) / 1e6);
    // окно измерения = время до следующего опроса админкой
    state.eld.reset();
  }

  return {
    rssMb,
    heapUsedMb,
    ramLimitMb,
    ramPct,
    cpuCount,
    load1: Math.round(load1 * 100) / 100,
    loadPct,
    lagMeanMs,
    lagMaxMs,
    uptimeSec: Math.round(process.uptime()),
    jobsInFlight: falJobsInFlight(),
  };
}
