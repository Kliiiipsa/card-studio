import "server-only";

/**
 * Уведомления владельцу в Telegram (обращения в поддержку и т.п.).
 * Просто HTTPS POST к Bot API — без зависимостей, порт 443 на Timeweb открыт.
 * Best-effort: любая ошибка логируется, но НИКОГДА не роняет вызывающий код —
 * клиент не должен получать ошибку из-за того, что уведомление не ушло.
 *
 * env: TELEGRAM_BOT_TOKEN (от @BotFather) + TELEGRAM_CHAT_ID (куда слать).
 */
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function notifyTelegram(text: string): Promise<boolean> {
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
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[telegram]", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[telegram] send failed:", e);
    return false;
  }
}

/** Экранирование под HTML parse_mode (пользовательский текст в сообщении). */
export function tgEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
