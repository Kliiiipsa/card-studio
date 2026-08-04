import type { LLMMessage } from "@/core/ai/providers/types";
import type { PromptIntent } from "./prompt-intent";
import { styleModeGuidance, cardTypeGuidance } from "./prompt-intent";
import { PROMPT_RULES } from "./prompt-from-product";

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

/** Build LLM (vision) messages to author a prompt from the product photo + data. */
export function imagePromptMessages(intent: PromptIntent, imageDataUrl: string): LLMMessage[] {
  const name = intent.productName?.trim();
  const anchor = name
    ? `Главный объект — «${name}» (см. фото). Опиши именно этот товар, не заменяй его другим.`
    : `Опиши именно тот товар, что на фото, не заменяй его другим.`;
  return [
    {
      role: "system",
      content: `Ты — арт-директор карточек Wildberries. Сначала внимательно рассмотри фото товара, затем напиши готовый промпт для image-модели.\nКРИТИЧЕСКИ ВАЖНО: сохрани реальный товар с фото (тип предмета, форма, цвет, материал). Нельзя заменять его на другой предмет. ${PROMPT_RULES}`,
    },
    {
      role: "user",
      content: `${anchor}\n\nДанные товара:\n${productBlock(intent)}\n\n${RESPONSE_SHAPE}`,
      imageDataUrl,
    },
  ];
}
