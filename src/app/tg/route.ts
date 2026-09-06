import { recordBotClick } from "@/core/tgbot/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ссылка из ответов Telegram-бота: kartogen.ru/tg. Считаем переход (только
 * число, без ПДн) и отправляем на главную с UTM, чтобы регистрации из бота
 * были видны в «Источниках» админки как telegram.
 *
 * Адрес короткий и в боте показан как есть: Telegram пугает людей диалогом
 * «ссылка ведёт на …», если текст ссылки не совпадает с адресом.
 * Хост — константа: за прокси Timeweb req.url приходит как localhost:3000.
 */
const SITE = process.env.SITE_URL || "https://kartogen.ru";

export async function GET() {
  void recordBotClick();
  return Response.redirect(`${SITE}/?utm_source=telegram&utm_medium=bot&utm_campaign=check`, 302);
}
