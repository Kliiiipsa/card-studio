import "server-only";

/**
 * Bot API для публичного Telegram-бота (@kartogenTP_bot по умолчанию).
 *
 * api.telegram.org режется по DPI из ДЦ Timeweb, поэтому ВСЕ вызовы идут через
 * наш релей на Vercel (relay/api/tg.js): обычный HTTPS POST с секретом, релей
 * уже дёргает Telegram. Входящие апдейты Telegram шлёт нам сам (вебхук), это
 * работает без релея. Токен передаём в теле: релей секрет-гейтит запрос и
 * ничего не знает о том, какой это бот.
 *
 * env: TELEGRAM_PUBLIC_BOT_TOKEN (иначе TELEGRAM_BOT_TOKEN — бот поддержки),
 *      TELEGRAM_RELAY_URL (…/api/notify → заменяем на …/api/tg), TELEGRAM_RELAY_SECRET.
 */
export function botToken(): string {
  return process.env.TELEGRAM_PUBLIC_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
}

export function botConfigured(): boolean {
  return Boolean(botToken() && process.env.TELEGRAM_RELAY_URL && process.env.TELEGRAM_RELAY_SECRET);
}

function relayUrl(): string {
  return (process.env.TELEGRAM_RELAY_URL || "").replace(/\/api\/notify$/, "/api/tg");
}

type TgResponse<T> = { ok: boolean; result?: T; description?: string };

/** Вызов метода Bot API через релей. Бросает при сетевой ошибке или ok:false. */
export async function tg<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(relayUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-relay-secret": process.env.TELEGRAM_RELAY_SECRET! },
    body: JSON.stringify({ token: botToken(), method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json().catch(() => null)) as TgResponse<T> | null;
  if (!data || !data.ok) {
    throw new Error(`tg ${method}: ${res.status} ${data?.description ?? "no body"}`);
  }
  return data.result as T;
}

/** Скачать файл Telegram (по file_path из getFile) → data URL. */
export async function tgFileDataUrl(filePath: string): Promise<string> {
  const res = await fetch(relayUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-relay-secret": process.env.TELEGRAM_RELAY_SECRET! },
    body: JSON.stringify({ token: botToken(), method: "getFileBytes", params: { file_path: filePath } }),
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; base64?: string; contentType?: string }
    | null;
  if (!data?.ok || !data.base64) throw new Error(`tg getFileBytes: ${res.status}`);
  const mime = (data.contentType || "").split(";")[0].trim();
  // Telegram отдаёт octet-stream для фото — тип берём по расширению
  const byExt = /\.png$/i.test(filePath) ? "image/png" : /\.webp$/i.test(filePath) ? "image/webp" : "image/jpeg";
  const type = mime.startsWith("image/") ? mime : byExt;
  return `data:${type};base64,${data.base64}`;
}

export async function sendMessage(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

export async function sendTyping(chatId: number | string) {
  return tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
}
