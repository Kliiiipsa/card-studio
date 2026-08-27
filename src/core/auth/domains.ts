/**
 * Registration is limited to Russian mail providers — the check is by domain
 * whitelist, then ownership is proven with an emailed code.
 * Pure + client-safe (used by the register form for instant feedback).
 */
const RUSSIAN_MAIL_DOMAINS = new Set([
  // Яндекс
  "yandex.ru",
  "ya.ru",
  // VK / Mail.ru Group
  "mail.ru",
  "bk.ru",
  "list.ru",
  "inbox.ru",
  "internet.ru",
  "vk.com",
  // Rambler
  "rambler.ru",
  "myrambler.ru",
  "autorambler.ru",
  "ro.ru",
]);

const EMAIL_RE = /^[a-z0-9][a-z0-9._+-]*@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Канонический адрес для антифрода: срезает тег `+…` из локальной части.
 * `user+1@yandex.ru`, `user+2@yandex.ru` → `user@yandex.ru`. Российские
 * провайдеры доставляют plus-адреса в базовый ящик, поэтому по канону
 * дедуплицируется приветственный бонус и ставится «надгробие» — иначе один
 * ящик = бесконечные бонусы (аудит 2026-08-26). Для ВХОДА/хранения аккаунта
 * используется обычный normalizeEmail (плюс-адрес остаётся отдельным логином).
 */
export function canonicalEmail(raw: string): string {
  const email = normalizeEmail(raw);
  const at = email.lastIndexOf("@");
  if (at < 0) return email;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  // ya.ru и yandex.ru — ОДИН физический ящик Яндекса. Складываем алиас, иначе
  // user@ya.ru и user@yandex.ru получат приветственный бонус дважды и обойдут
  // «надгробие» удаления (launch-аудит 2026-08-27).
  if (domain === "ya.ru") domain = "yandex.ru";
  return `${local}@${domain}`;
}

/** Returns null when ok, otherwise a user-facing error message (Russian). */
export function validateRussianEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (!EMAIL_RE.test(email)) return "Введите корректный адрес почты.";
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (!RUSSIAN_MAIL_DOMAINS.has(domain)) {
    return "Регистрация доступна только с российской почтой: Яндекс (yandex.ru, ya.ru), Mail.ru (mail.ru, bk.ru, list.ru, inbox.ru, vk.com) или Rambler.";
  }
  return null;
}

export const ALLOWED_DOMAINS_HINT = "yandex.ru · ya.ru · mail.ru · bk.ru · list.ru · inbox.ru · vk.com · rambler.ru";
