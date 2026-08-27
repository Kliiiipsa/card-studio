import "server-only";

/**
 * Доставка в Telegram владельцу.
 *
 * Проблема: прод крутится в российском ДЦ Timeweb, откуда `api.telegram.org`
 * заблокирован по DPI (запрос висит и падает по таймауту). Прямой вызов Bot API
 * работает где угодно, КРОМЕ прода. Поэтому есть релей: крохотная функция на
 * Vercel (вне РФ) `https://kartogen-tg-relay.vercel.app/api/notify` — наш сервер
 * шлёт ей обычный HTTPS POST с секретным заголовком, а она уже дёргает Telegram.
 *
 * env:
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID — сам бот и получатель (для прямого пути).
 *   TELEGRAM_RELAY_URL + TELEGRAM_RELAY_SECRET — включают релей (боевой путь на проде).
 * Все функции best-effort: любая ошибка логируется, но НИКОГДА не бросается —
 * неотправленное уведомление не должно ронять основной сценарий.
 */
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export function telegramRelayConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_RELAY_URL && process.env.TELEGRAM_RELAY_SECRET);
}

/** Прямой вызов Bot API. С прода (РФ) обычно уходит в таймаут — это ожидаемо. */
export async function sendTelegramDirect(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("[telegram:direct]", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[telegram:direct] failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Ретрансляция через HTTPS-релей (функция на Vercel вне РФ). Наш сервер шлёт
 * обычный POST с секретным заголовком, релей уже отправляет в Telegram.
 * Успех = HTTP 200 с {sent:true}.
 */
export async function sendTelegramViaRelay(text: string): Promise<boolean> {
  const url = process.env.TELEGRAM_RELAY_URL;
  const secret = process.env.TELEGRAM_RELAY_SECRET;
  if (!url || !secret) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-relay-secret": secret },
      body: JSON.stringify({ text: text.slice(0, 4000) }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return true;
    console.error("[telegram:relay]", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return false;
  } catch (e) {
    console.error("[telegram:relay] failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Отправить в Telegram лучшим доступным путём: релей (если настроен), иначе напрямую. */
export async function notifyTelegram(text: string): Promise<boolean> {
  if (telegramRelayConfigured()) {
    if (await sendTelegramViaRelay(text)) return true;
    // релей не сработал — как последнюю попытку пробуем прямой вызов
  }
  return sendTelegramDirect(text);
}
