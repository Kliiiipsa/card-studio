/**
 * IP клиента за обратным прокси Timeweb. Тот же порядок заголовков, что и в
 * журнале согласий, — чтобы «IP регистрации» и «IP применения промокода»
 * означали одно и то же.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip") || null;
}
