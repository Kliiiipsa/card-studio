import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Ссылка «отписаться» для рекламных писем. Подписана HMAC от AUTH_SECRET:
 * по ней нельзя отписать чужой адрес, а самому человеку не нужен вход —
 * отписка обязана работать в один клик из письма, иначе первая же кнопка
 * «спам» у Mail.ru портит доставляемость и кодов входа.
 */

const SITE = process.env.SITE_URL || "https://kartogen.ru";

function secret(): string {
  return process.env.AUTH_SECRET || "";
}

export function unsubscribeToken(email: string): string {
  return createHmac("sha256", secret())
    .update(`unsub:${email.trim().toLowerCase()}`)
    .digest("base64url")
    .slice(0, 32);
}

export function unsubscribeLink(email: string): string {
  const e = Buffer.from(email.trim().toLowerCase()).toString("base64url");
  return `${SITE}/unsubscribe?e=${e}&t=${unsubscribeToken(email)}`;
}

/** Возвращает почту, если пара (e, t) подлинная, иначе null. */
export function verifyUnsubscribe(e: string | undefined, t: string | undefined): string | null {
  if (!e || !t || !secret()) return null;
  let email: string;
  try {
    email = Buffer.from(e, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!email.includes("@")) return null;
  const expected = Buffer.from(unsubscribeToken(email));
  const given = Buffer.from(t);
  if (expected.length !== given.length) return null;
  return timingSafeEqual(expected, given) ? email : null;
}
