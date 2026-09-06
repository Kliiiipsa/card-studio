import { recordBotClick } from "@/core/tgbot/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ссылка из ответов Telegram-бота: считаем переход (только число, без ПДн) и
 * отправляем на главную с UTM, чтобы регистрации из бота были видны в
 * «Источниках» админки как telegram.
 */
export async function GET(req: Request) {
  void recordBotClick();
  const origin = new URL(req.url).origin;
  return Response.redirect(
    `${origin}/?utm_source=telegram&utm_medium=bot&utm_campaign=check`,
    302,
  );
}
