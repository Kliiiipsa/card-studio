import "server-only";
import { lookup } from "node:dns/promises";
import { AppError } from "./errors";

/**
 * Защита от SSRF (аудит 2026-08-26). Пользователь в некоторых роутах может
 * подсунуть вместо картинки URL, и сервер его тянет. Без защиты этим можно
 * ходить во внутреннюю сеть хостинга и к метаданным облака.
 *
 * Правила: только http/https; хост резолвится, и если ЛЮБОЙ его IP —
 * приватный/loopback/link-local/метадата — отказ; редиректы запрещены
 * (иначе публичный хост увёл бы на внутренний); таймаут и лимит размера.
 */

function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local + 169.254.169.254 метадата
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const s = ip.toLowerCase().split("%")[0];
  if (s === "::1" || s === "::") return true; // loopback / unspecified
  if (s.startsWith("fe80")) return true; // link-local
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped ::ffff:a.b.c.d — проверяем как IPv4
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (m) return ipv4IsPrivate(m[1]);
  return false;
}

async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("Некорректная ссылка.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("Ссылка должна быть http(s).");
  }
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(url.hostname, { all: true });
  } catch {
    throw new AppError("Не удалось разрешить адрес.", 502);
  }
  for (const { address, family } of addrs) {
    const priv = family === 6 ? ipv6IsPrivate(address) : ipv4IsPrivate(address);
    if (priv) throw new AppError("Адрес недоступен.", 400, `SSRF blocked: ${url.hostname} -> ${address}`);
  }
  return url;
}

const MAX_BYTES = 20 * 1024 * 1024; // 20 МБ — с запасом на видео из fal

/** Безопасный fetch внешнего медиа: без SSRF, без редиректов, с лимитами. */
export async function safeFetchMedia(
  raw: string,
  timeoutMs = 15_000,
): Promise<{ buf: Buffer; contentType: string }> {
  await assertSafeUrl(raw);
  let res: Response;
  try {
    res = await fetch(raw, {
      cache: "no-store",
      redirect: "error", // редирект на внутренний адрес — запрещён
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new AppError("Не удалось загрузить ресурс.", 502, `safeFetch failed: ${String(e)}`);
  }
  if (!res.ok) throw new AppError("Не удалось загрузить ресурс.", 502, `status ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len && len > MAX_BYTES) throw new AppError("Файл слишком большой.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new AppError("Файл слишком большой.");
  return { buf, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}
