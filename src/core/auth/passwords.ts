import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with Node's built-in scrypt (no external deps).
 * Stored format: "s1:<saltHex>:<hashHex>". Server-only (node:crypto).
 */
const KEY_LEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `s1:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "s1" || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
