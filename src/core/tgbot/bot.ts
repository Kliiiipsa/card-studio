import "server-only";
import { analyzeProductCard } from "@/core/ai/service";
import { sendMessage, sendTyping, tg, tgFileDataUrl } from "./api";
import { PER_USER_PER_DAY, releaseCheckSlot, takeCheckSlot } from "./limits";

/**
 * Публичный Telegram-бот «проверь карточку» — лид-магнит для рассылки по чатам
 * селлеров. Человек кидает скрин/фото карточки, получает УРЕЗАННЫЙ разбор
 * (тот же тизер, что на /check: балл, диагноз, одна главная проблема с
 * исправлением, счётчики «что ещё нашли») и рекламную строку с ссылкой на сайт.
 * Лимит 2 проверки в день на человека, общий потолок в limits.ts.
 *
 * Полный отчёт сознательно не отдаём: он продаёт регистрацию.
 */

const SITE = "https://kartogen.ru";
const LINK = `${SITE}/?utm_source=telegram&utm_medium=bot&utm_campaign=check`;
const AD = `Хочешь улучшить карточку? Попробуй бесплатно: <a href="${LINK}">kartogen.ru</a> — 20 генов в подарок при регистрации.`;

type TgUser = { id: number; is_bot?: boolean; username?: string; first_name?: string };
type TgChat = { id: number; type: "private" | "group" | "supergroup" | "channel" };
type TgPhoto = { file_id: string; width: number; height: number; file_size?: number };
type TgDocument = { file_id: string; mime_type?: string; file_size?: number; file_name?: string };
export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  caption?: string;
  photo?: TgPhoto[];
  document?: TgDocument;
};
export type TgUpdate = { update_id: number; message?: TgMessage };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let cachedUsername: string | null = null;
async function botUsername(): Promise<string> {
  if (cachedUsername) return cachedUsername;
  try {
    const me = await tg<{ username?: string }>("getMe", {});
    cachedUsername = me.username ?? "";
  } catch {
    cachedUsername = "";
  }
  return cachedUsername;
}

const HELLO =
  `👋 Привет! Я проверяю карточки товаров для Wildberries и Ozon.\n\n` +
  `Пришлите <b>скриншот или фото карточки</b> — через минуту дам оценку по 100-балльной шкале, ` +
  `главную ошибку и что именно исправить.\n\n` +
  `Бесплатно, ${PER_USER_PER_DAY} проверки в день.`;

const NEED_PHOTO =
  `Пришлите фото или скриншот карточки товара картинкой — я её разберу. ` +
  `Текстовые вопросы не читаю, только смотрю на карточки 🙂`;

export async function handleUpdate(update: TgUpdate): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.from || msg.from.is_bot) return;
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();

  // В группах отвечаем только когда обратились к боту: «пишите в личку».
  if (msg.chat.type !== "private") {
    const me = await botUsername();
    const addressed = me && (text.includes(`@${me}`) || (msg.caption ?? "").includes(`@${me}`) || /^\/start/.test(text));
    if (!addressed) return;
    await sendMessage(
      chatId,
      `Чтобы проверить карточку, напишите мне в личные сообщения: @${me} — пришлите туда фото карточки.`,
    );
    return;
  }

  if (/^\/start/.test(text) || /^\/help/.test(text)) {
    await sendMessage(chatId, HELLO);
    return;
  }

  const fileId = pickImage(msg);
  if (!fileId) {
    await sendMessage(chatId, NEED_PHOTO);
    return;
  }

  const userId = msg.from.id;
  const slot = await takeCheckSlot(userId);
  if (!slot.allowed) {
    await sendMessage(
      chatId,
      slot.globalFull
        ? `Сегодня бесплатные проверки в боте закончились — попробуйте завтра. Полный разбор без очереди: <a href="${LINK}">kartogen.ru</a>.`
        : `На сегодня ${PER_USER_PER_DAY} бесплатные проверки использованы, завтра можно снова.\n\n` +
            `Полный разбор без лимита и готовые тексты для карточки — на <a href="${LINK}">kartogen.ru</a>, 20 генов в подарок при регистрации.`,
    );
    return;
  }

  await sendTyping(chatId);
  try {
    const file = await tg<{ file_path?: string }>("getFile", { file_id: fileId });
    if (!file.file_path) throw new Error("no file_path");
    const dataUrl = await tgFileDataUrl(file.file_path);
    const report = await analyzeProductCard(dataUrl);

    const top = report.problems.find((p) => p.severity === "high") ?? report.problems[0] ?? null;
    const lockedProblems = Math.max(0, report.problems.length - 1);
    const lockedTexts = report.headlineIdeas.length + report.benefitTexts.length + report.textRewrites.length;

    const lines = [
      `📊 <b>Оценка карточки: ${report.scores.total}/100</b>`,
      ``,
      `<b>Диагноз:</b> ${esc(report.diagnosis)}`,
      ``,
      `❗ <b>Главная проблема:</b> ${esc(top?.issue ?? report.mainProblem)}`,
    ];
    if (top?.fix) lines.push(`✅ <b>Что исправить:</b> ${esc(top.fix)}`);
    if (report.thumbnailTest?.verdict) lines.push(`🔍 <b>В миниатюре:</b> ${esc(report.thumbnailTest.verdict)}`);
    if (lockedProblems || lockedTexts) {
      lines.push(
        ``,
        `🔒 В полном разборе ещё: ${[
          lockedProblems ? `${lockedProblems} ${plural(lockedProblems, "проблема", "проблемы", "проблем")}` : "",
          lockedTexts ? `${lockedTexts} ${plural(lockedTexts, "готовый текст", "готовых текста", "готовых текстов")} для плашек и заголовка` : "",
        ]
          .filter(Boolean)
          .join(", ")}.`,
      );
    }
    lines.push(``, AD);
    if (slot.usedToday >= PER_USER_PER_DAY) {
      lines.push(``, `<i>Это была последняя бесплатная проверка на сегодня.</i>`);
    }
    await sendMessage(chatId, lines.join("\n"));
    console.log(`[tgbot] check ok user=${userId} score=${report.scores.total} used=${slot.usedToday}`);
  } catch (e) {
    // наша ошибка — попытку возвращаем
    await releaseCheckSlot(userId);
    console.error("[tgbot] check failed:", e instanceof Error ? e.message : e);
    await sendMessage(
      chatId,
      `Не получилось разобрать это изображение. Пришлите скриншот карточки ещё раз (попытка не потрачена).`,
    ).catch(() => undefined);
  }
}

/** Лучшее изображение из сообщения: самое крупное фото или документ-картинка ≤ 6 МБ. */
function pickImage(msg: TgMessage): string | null {
  if (msg.photo?.length) {
    const best = [...msg.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    return best.file_id;
  }
  const d = msg.document;
  if (d && /^image\/(jpeg|png|webp)$/.test(d.mime_type ?? "") && (d.file_size ?? 0) <= 6 * 1024 * 1024) {
    return d.file_id;
  }
  return null;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
