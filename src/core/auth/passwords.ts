import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with Node's built-in scrypt (no external deps).
 * Stored format: "s1:<saltHex>:<hashHex>". Server-only (node:crypto).
 *
 * scrypt вызывается АСИНХРОННО (не scryptSync): хеширование тяжёлое (~десятки
 * мс CPU), а инстанс один. Синхронный вызов замораживал единственное ядро на
 * каждый вход/регистрацию — при рекламном наплыве это копило латентность для
 * ВСЕХ запросов. Async-вариант считает в пуле потоков libuv, event-loop свободен.
 */
const KEY_LEN = 32;
const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `s1:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "s1" || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = (await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
