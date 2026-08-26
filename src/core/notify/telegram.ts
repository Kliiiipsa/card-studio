import "server-only";

/**
 * Доставка в Telegram владельцу.
 *
 * Проблема: прод крутится в российском ДЦ Timeweb, откуда `api.telegram.org`
 * заблокирован по DPI (запрос висит и падает по таймауту). Прямой вызов Bot API
 * работает где угодно, КРОМЕ прода. Поэтому есть второй путь — ретрансляция
 * через GitHub Actions: наш сервер спокойно достучится до api.github.com, а
 * раннер GitHub (вне РФ) уже отправит сообщение в Telegram.
 *
 * env:
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID — сам бот и получатель.
 *   GITHUB_DISPATCH_TOKEN + GITHUB_DISPATCH_REPO ("owner/repo") — включают релей.
 * Все функции best-effort: любая ошибка логируется, но НИКОГДА не бросается —
 * неотправленное уведомление не должно ронять основной сценарий.
 */
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export function telegramRelayConfigured(): boolean {
  return Boolean(process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO);
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
 * Ретрансляция через GitHub Actions (repository_dispatch). Требует fine-grained
 * PAT с правом Contents:write на репозиторий и секреты TELEGRAM_BOT_TOKEN /
 * TELEGRAM_CHAT_ID в самом репозитории (их читает воркфлоу .github/workflows/tg-notify.yml).
 * Успех = HTTP 204. Латентность старта раннера обычно 5–20 с — для поддержки ок.
 */
export async function sendTelegramViaGithub(text: string): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_DISPATCH_REPO;
  if (!token || !repo) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "kartogen-notify",
      },
      body: JSON.stringify({ event_type: "tg-notify", client_payload: { text: text.slice(0, 3500) } }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 204) return true;
    console.error("[telegram:github]", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return false;
  } catch (e) {
    console.error("[telegram:github] failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Отправить в Telegram лучшим доступным путём: релей (если настроен), иначе напрямую. */
export async function notifyTelegram(text: string): Promise<boolean> {
  if (telegramRelayConfigured()) {
    if (await sendTelegramViaGithub(text)) return true;
    // релей не сработал — как последнюю попытку пробуем прямой вызов
  }
  return sendTelegramDirect(text);
}
