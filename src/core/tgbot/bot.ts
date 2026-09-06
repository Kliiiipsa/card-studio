import "server-only";
import { analyzeProductCard } from "@/core/ai/service";
import { sendMessage, sendTyping, tg, tgFileDataUrl } from "./api";
import { PER_USER_PER_DAY, releaseCheckSlot, takeCheckSlot } from "./limits";

/**
 * Публичный Telegram-бот «проверь карточку» — лид-магнит для рассылки по чатам
 * селлеров. Человек кидает скрин/фото карточки, получает УРЕЗАННЫЙ разбор
 * (балл со шкалой, баллы по рубрикам, что хорошо, одна главная проблема с
 * исправлением, миниатюра, риск модерации, счётчики «что ещё нашли») и
 * рекламную строку с ссылкой на сайт. Лимит 2 проверки в день на человека,
 * общий потолок в limits.ts.
 *
 * Полный отчёт (все проблемы, готовые заголовки и тексты плашек, идеи
 * карточек) сознательно не отдаём: он продаёт регистрацию.
 */

const SITE = "https://kartogen.ru";
// kartogen.ru/tg: считаем переходы, дальше редирект на главную с UTM.
// Ссылку показываем КАК ЕСТЬ (текст = адрес): иначе Telegram открывает диалог
// «ссылка ведёт на …», и люди, наученные мошенниками, не переходят.
const LINK = `${SITE}/tg`;
const AD = `Хочешь улучшить карточку? Попробуй бесплатно: ${LINK} — 20 генов в подарок при регистрации.`;

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
  `👋 <b>Привет! Я проверяю карточки товаров для Wildberries и Ozon.</b>\n\n` +
  `Пришлите <b>скриншот или фото карточки</b> (главное фото, как его видит покупатель) — ` +
  `через минуту вернусь с разбором:\n` +
  `📊 оценка по 100-балльной шкале и баллы по шести рубрикам\n` +
  `👍 что уже работает\n` +
  `❗ главная проблема и что именно исправить\n` +
  `🔍 читается ли карточка в миниатюре выдачи\n` +
  `⚠️ формулировки, за которые модерация может снять карточку\n\n` +
  `Бесплатно, ${PER_USER_PER_DAY} проверки в день. Просто пришлите картинку 👇`;

const NEED_PHOTO =
  `Пришлите карточку <b>картинкой</b> — скриншот или фото главного изображения. ` +
  `Текст я не читаю, только смотрю на карточки 🙂`;

/** ▰▰▰▰▰▰▱▱▱▱ — шкала из 10 делений */
const bar = (score: number) => {
  const n = Math.max(0, Math.min(10, Math.round(score / 10)));
  return "▰".repeat(n) + "▱".repeat(10 - n);
};

const light = (score: number) => (score >= 70 ? "🟢" : score >= 50 ? "🟡" : "🔴");

type ReportScores = {
  cover: number;
  infographics: number;
  text: number;
  composition: number;
  trust: number;
  sellingPower: number;
  total: number;
};
const AXES: [keyof ReportScores, string][] = [
  ["cover", "Фото"],
  ["infographics", "Инфографика"],
  ["text", "Текст"],
  ["composition", "Композиция"],
  ["trust", "Доверие"],
  ["sellingPower", "Продающая сила"],
];

export async function handleUpdate(update: TgUpdate): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.from || msg.from.is_bot) return;
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();

  // В группах отвечаем только когда обратились к боту: «пишите в личку».
  if (msg.chat.type !== "private") {
    const me = await botUsername();
    const addressed =
      me && (text.includes(`@${me}`) || (msg.caption ?? "").includes(`@${me}`) || /^\/start/.test(text));
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
        ? `Сегодня бесплатные проверки в боте закончились — попробуйте завтра. Полный разбор без очереди: ${LINK}.`
        : `На сегодня ${PER_USER_PER_DAY} бесплатные проверки использованы, завтра можно снова.\n\n` +
            `Полный разбор без лимита и готовые тексты для карточки — на ${LINK}, 20 генов в подарок при регистрации.`,
    );
    return;
  }

  await sendTyping(chatId);
  try {
    const file = await tg<{ file_path?: string }>("getFile", { file_id: fileId });
    if (!file.file_path) throw new Error("no file_path");
    const dataUrl = await tgFileDataUrl(file.file_path);
    // LLM иногда отдаёт обрезанный JSON (1 из 3 в первом прогоне) — один
    // повтор дешевле, чем просить человека слать фото заново
    const report = await analyzeProductCard(dataUrl).catch(() => analyzeProductCard(dataUrl));

    await sendMessage(chatId, formatReport(report, slot.usedToday));
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

type Report = Awaited<ReturnType<typeof analyzeProductCard>>;

/** Текст ответа: тизер отчёта + замок + реклама. HTML-разметка Telegram. */
export function formatReport(report: Report, usedToday: number): string {
  const top = report.problems.find((p) => p.severity === "high") ?? report.problems[0] ?? null;
  const lockedProblems = Math.max(0, report.problems.length - 1);
  const total = report.scores.total;
  const s = report.scores as ReportScores;

  const lines: string[] = [
    `${light(total)} <b>Оценка карточки: ${total}/100</b>`,
    `<code>${bar(total)}</code>`,
    `<i>${esc(report.diagnosis)}</i>`,
    ``,
    `📐 <b>По рубрикам</b>`,
    ...AXES.map(([k, label]) => `${light(s[k])} ${label} — <b>${s[k]}</b>`),
  ];
  if (report.whatWorks?.[0]) {
    lines.push(``, `👍 <b>Что уже хорошо:</b> ${esc(report.whatWorks[0])}`);
  }
  lines.push(``, `❗ <b>Главная проблема:</b> ${esc(top?.issue ?? report.mainProblem)}`);
  if (top?.fix) lines.push(`✅ <b>Что исправить:</b> ${esc(top.fix)}`);
  if (report.thumbnailTest?.verdict) {
    lines.push(
      ``,
      `🔍 <b>В миниатюре выдачи:</b> ${report.thumbnailTest.readable ? "читается ✔" : "не читается ✘"} — ${esc(report.thumbnailTest.verdict)}`,
    );
  }
  if (report.riskFlags?.length) {
    lines.push(`⚠️ <b>Риск модерации:</b> ${esc(report.riskFlags[0])}`);
  }
  const locked = [
    lockedProblems
      ? `${lockedProblems} ${plural(lockedProblems, "проблема", "проблемы", "проблем")} с исправлениями`
      : "",
    report.headlineIdeas.length
      ? `${report.headlineIdeas.length} ${plural(report.headlineIdeas.length, "готовый заголовок", "готовых заголовка", "готовых заголовков")}`
      : "",
    report.benefitTexts.length ? "тексты для плашек" : "",
    report.newCardIdeas.length ? "идеи новых карточек" : "",
  ].filter(Boolean);
  if (locked.length) lines.push(``, `🔒 <b>В полном разборе ещё:</b> ${locked.join(", ")}.`);
  lines.push(``, `💡 ${AD}`);
  lines.push(
    ``,
    usedToday >= PER_USER_PER_DAY
      ? `<i>Это была последняя бесплатная проверка на сегодня — завтра можно снова.</i>`
      : `<i>Осталось проверок на сегодня: ${PER_USER_PER_DAY - usedToday}.</i>`,
  );
  return lines.join("\n");
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
