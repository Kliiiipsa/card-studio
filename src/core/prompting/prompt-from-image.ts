import type { LLMMessage } from "@/core/ai/providers/types";
import type { PromptIntent } from "./prompt-intent";
import { styleModeGuidance, cardTypeGuidance } from "./prompt-intent";
import { promptRules } from "./prompt-from-product";

function productBlock(intent: PromptIntent): string {
  return [
    intent.productName && `Товар: ${intent.productName}`,
    intent.category && `Категория: ${intent.category}`,
    intent.targetAudience && `Аудитория: ${intent.targetAudience}`,
    intent.benefits?.length && `Преимущества: ${intent.benefits.join(", ")}`,
    intent.painPoints?.length && `Боли клиента: ${intent.painPoints.join(", ")}`,
    intent.cardType && `Тип карточки: ${cardTypeGuidance(intent.cardType)}`,
    `Стиль: ${styleModeGuidance(intent.styleMode)}`,
    intent.userNote && `Пожелание пользователя: ${intent.userNote}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const RESPONSE_SHAPE = `Верни строго JSON:
{
  "generatedPrompt": "готовый промпт НА РУССКОМ, 2-4 предложения; сохрани реальный товар с фото, опиши достойный фон/свет/композицию",
  "negativePrompt": "что исключить, на русском",
  "overlaySuggestion": "короткий заголовок до 5 слов на русском",
  "visualDirection": "1 фраза о выбранном визуальном направлении"
}`;

/**
 * v2 «Подсказать задание» (2026-09-08). Старая кнопка описывала то, что и так
 * видно на фото, — люди не понимали, зачем она. Теперь это черновик ЗАДАНИЯ:
 * что изменить на этом фото под выбранный сценарий, повелительным наклонением,
 * коротко. Товар и человек на фото — не предмет правки, их не «улучшаем».
 */
const TASK_SHAPE = `Верни строго JSON:
{
  "generatedPrompt": "задание НА РУССКОМ, 1-3 коротких предложения в повелительном наклонении: что именно изменить на этом фото (фон, свет, тень, лишние предметы, кадрирование). Не описывай товар и не пересказывай фото.",
  "negativePrompt": "что исключить, на русском",
  "overlaySuggestion": "",
  "visualDirection": "1 фраза о выбранном визуальном направлении"
}`;

function taskMessages(intent: PromptIntent, imageDataUrl: string): LLMMessage[] {
  const name = intent.productName?.trim();
  const who = name ? `Товар на фото — «${name}».` : "Товар на фото — тот, что вы видите.";
  return [
    {
      role: "system",
      content:
        "Ты — фоторедактор маркетплейса. Тебе показывают фото товара, которое пойдёт в карточку. " +
        "Твоя задача — написать короткое задание ретушёру: что изменить на ЭТОМ фото, чтобы оно " +
        "стало продающим под выбранный сценарий.\n" +
        "Правила:\n" +
        "- Пиши повелительно и конкретно: «убери коробку слева», «замени фон на светло-серый», «добавь мягкую тень», «сделай свет ровнее».\n" +
        "- Только то, что реально стоит поменять на этом фото. Если фон уже хороший — так и скажи: «фон оставь».\n" +
        "- Сам товар не меняй и не описывай: не «улучшай» форму, цвет, модель.\n" +
        "- Если товар показан на человеке (одежда, обувь, аксессуар, кружка в руке) — человек остаётся в кадре как есть. Никогда не пиши «убери модель/человека/руку».\n" +
        "- «Товар — единственный герой» значит убрать ЛИШНИЕ предметы вокруг, а не человека, на котором товар.\n" +
        "- Никакого текста, надписей, плашек и логотипов на фото.\n" +
        "- Без названий брендов и артикулов.\n" +
        "- 1-3 предложения, без вступлений.",
    },
    {
      role: "user",
      content:
        `${who} Если товар на человеке или в руке — человек остаётся в кадре, задание про него не пишем.\n\n` +
        `${productBlock(intent)}\n\n${TASK_SHAPE}`,
      imageDataUrl,
    },
  ];
}

/** Build LLM (vision) messages to author a prompt from the product photo + data. */
export function imagePromptMessages(intent: PromptIntent, imageDataUrl: string): LLMMessage[] {
  if (intent.taskMode) return taskMessages(intent, imageDataUrl);
  const name = intent.productName?.trim();
  const anchor = name
    ? `Главный объект — «${name}» (см. фото). Опиши именно этот товар, не заменяй его другим.`
    : `Опиши именно тот товар, что на фото, не заменяй его другим.`;
  return [
    {
      role: "system",
      content: `Ты — арт-директор карточек Wildberries. Сначала внимательно рассмотри фото товара, затем напиши готовый промпт для image-модели.\nКРИТИЧЕСКИ ВАЖНО: сохрани реальный товар с фото (тип предмета, форма, цвет, материал). Нельзя заменять его на другой предмет. ${promptRules(intent)}`,
    },
    {
      role: "user",
      content: `${anchor}\n\nДанные товара:\n${productBlock(intent)}\n\n${RESPONSE_SHAPE}`,
      imageDataUrl,
    },
  ];
}
