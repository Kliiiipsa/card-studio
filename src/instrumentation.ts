/**
 * Next.js instrumentation hook — выполняется ОДИН раз при старте сервера
 * (nodejs runtime). Здесь поднимаем мониторы рантайма и страховку от падения
 * процесса (см. core/ops/runtime-metrics). На edge-runtime ничего не делаем.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRuntimeMonitors } = await import("@/core/ops/runtime-metrics");
    startRuntimeMonitors();
    // ежечасная сверка денег (журнал, балансы, платежи ЮKassa) с тревогой владельцу.
    // Сверка — только наблюдатель: если она не поднялась, сайт и оплаты
    // обязаны работать дальше, поэтому любая ошибка здесь глотается.
    try {
      const { startMoneyAuditLoop } = await import("@/core/billing/money-audit");
      startMoneyAuditLoop();
    } catch (e) {
      console.error("[money-audit] сверка не запущена:", e);
    }
  }
}
