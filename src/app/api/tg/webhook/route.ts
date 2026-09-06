import { botConfigured } from "@/core/tgbot/api";
import { handleUpdate, type TgUpdate } from "@/core/tgbot/bot";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Вебхук публичного Telegram-бота. Telegram шлёт апдейты сюда сам (входящий
 * трафик из-за рубежа не режется), а отвечаем мы через релей на Vercel.
 *
 * Отвечаем 200 сразу и обрабатываем в фоне: анализ занимает 10–30 с, а Telegram
 * при задержке начинает слать апдейт повторно. next-start — постоянный
 * процесс, промис досчитается.
 *
 * Защита: заголовок X-Telegram-Bot-Api-Secret-Token должен совпасть с
 * TELEGRAM_WEBHOOK_SECRET (задаётся в setWebhook). Без него — 401.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!botConfigured()) return new Response("bot not configured", { status: 503 });
  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return new Response("bad json", { status: 400 });
  }
  void handleUpdate(update).catch((e) =>
    console.error("[tgbot] update failed:", e instanceof Error ? e.message : e),
  );
  return Response.json({ ok: true });
}
