/**
 * IP клиента за обратным прокси Timeweb.
 *
 * Клиент может прислать свой `X-Forwarded-For` — и раньше мы брали ЛЕВЫЙ
 * элемент, то есть именно то, что подделал клиент (аудит 2026-08-26). Прокси
 * Timeweb дописывает реальный IP СПРАВА, поэтому берём правый элемент (по
 * числу доверенных прокси-хопов). Это ломает подделку антифрод-проверок
 * «один промокод на IP» и подмену IP в логах.
 *
 * TRUSTED_PROXY_HOPS — сколько прокси перед приложением (по умолчанию 1 =
 * сам LB Timeweb). Если инфраструктура добавит ещё хоп, поднять значение.
 */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) {
      const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1);
      // берём hops-й элемент с конца: его выставил наш доверенный прокси
      const idx = Math.max(0, parts.length - hops);
      return parts[idx] || parts[parts.length - 1] || null;
    }
  }
  // X-Real-IP прокси выставляет сам (клиентский перезаписывается) — запасной путь
  return req.headers.get("x-real-ip") || null;
}
