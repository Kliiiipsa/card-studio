/**
 * Next.js instrumentation hook — выполняется ОДИН раз при старте сервера
 * (nodejs runtime). Здесь поднимаем мониторы рантайма и страховку от падения
 * процесса (см. core/ops/runtime-metrics). На edge-runtime ничего не делаем.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRuntimeMonitors } = await import("@/core/ops/runtime-metrics");
    startRuntimeMonitors();
    // ежечасная сверка денег (журнал, балансы, платежи ЮKassa) с тревогой владельцу
    const { startMoneyAuditLoop } = await import("@/core/billing/money-audit");
    startMoneyAuditLoop();
  }
}
