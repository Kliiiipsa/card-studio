import type { LLMMessage } from "@/core/ai/providers/types";
import type { PromptIntent } from "./prompt-intent";
import { styleModeGuidance, cardTypeGuidance } from "./prompt-intent";

/** Shared rules that keep the generated prompt clean and on-brief. */
export const PROMPT_RULES = `Правила:
- Опиши ТОЛЬКО чистую визуальную основу карточки (товар, фон, свет, композиция).
- НЕ добавляй случайные сцены и объекты, которых нет в данных (никаких пляжей, людей, животных, если их не просили).
- НЕ проси рисовать текст, надписи, цифры или логотипы внутри изображения.
- НЕ перегружай инфографикой — оставь чистую пустую зону под заголовок.
- Товар не искажать, он главный объект и в фокусе.
- Премиальный e-commerce вид, аккуратная композиция, мягкий реалистичный свет.`;

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
  "generatedPrompt": "готовый промпт НА РУССКОМ, 2-4 предложения, описывает визуал карточки",
  "negativePrompt": "что исключить, на русском",
  "overlaySuggestion": "короткий заголовок до 5 слов на русском (для наложения текстом)",
  "visualDirection": "1 фраза о выбранном визуальном направлении"
}`;

/** Build LLM messages to author a prompt from text data only. */
export function productPromptMessages(intent: PromptIntent): LLMMessage[] {
  const name = intent.productName?.trim() || "товар";
  return [
    {
      role: "system",
      content: `Ты — арт-директор карточек Wildberries. Ты пишешь готовый промпт для image-модели по данным товара.\nКРИТИЧЕСКИ ВАЖНО: промпт должен быть строго про товар «${name}». Нельзя заменять его на другой товар или придумывать иной предмет.\n${PROMPT_RULES}`,
    },
    {
      role: "user",
      content: `Главный объект карточки — «${name}». Опиши именно его.\n\nДанные товара:\n${productBlock(intent)}\n\n${RESPONSE_SHAPE}`,
    },
  ];
}
