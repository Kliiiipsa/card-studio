import "server-only";
import { z } from "zod";
import { getLLMProvider, getImageProvider } from "./providers";
import type { ImageResult } from "./providers/types";
import { ProviderError } from "@/lib/errors";
import {
  SYSTEM_ANALYST,
  SYSTEM_COMPARATOR,
  SYSTEM_IDEATOR,
  SYSTEM_PROMPT_ENGINEER,
  SYSTEM_PROMPT_IMPROVER,
  SYSTEM_SCORER,
  SYSTEM_TRANSLATOR,
} from "./prompts";
import {
  analysisReportSchema,
  cardIdeaSchema,
  cardScoreSchema,
  comparisonReportSchema,
  structuredPromptSchema,
  type ComparisonReport,
} from "./schemas";
import { renderStructuredPrompt } from "./prompt-builder";
import {
  buildPromptMessages,
  parsePromptResult,
  fallbackPrompt,
} from "@/core/prompting/prompt-composer";
import type { PromptIntent, PromptResult } from "@/core/prompting/prompt-intent";
import type {
  AnalysisReport,
  CardIdea,
  CardScore,
  ProductInfo,
  StructuredImagePrompt,
} from "@/core/domain/types";
import { CARD_TYPE_MAP } from "@/core/domain/card-types";
import { STYLE_MAP } from "@/core/domain/styles";

/* -------------------------------------------------------------------------- */
/*  LLM-backed functions                                                      */
/* -------------------------------------------------------------------------- */

export async function analyzeProductCard(
  imageDataUrl: string,
  product?: Partial<ProductInfo>,
  concern?: string,
): Promise<AnalysisReport> {
  const llm = getLLMProvider();
  const image = await ensureDataUrl(imageDataUrl);
  const result = await llm.complete({
    task: "analyze",
    json: true,
    vision: true,
    // Температура 0: без неё одно и то же фото получало разные баллы (50 и 43
    // на повторном запуске — жалоба пользователя 2026-08-21). Оценка карточки
    // должна быть воспроизводимой, иначе сервис выглядит гадающим.
    temperature: 0,
    context: { product },
    messages: [
      { role: "system", content: SYSTEM_ANALYST },
      {
        role: "user",
        content: analysisUserPrompt(product, concern),
        imageDataUrl: image,
      },
    ],
  });
  // zod `.default([])` marks keys optional in the inferred type, but at runtime
  // they are always present — the cast reconciles that with the domain model.
  return parse(result.text, analysisReportSchema, "анализ карточки") as AnalysisReport;
}

/** «Сравнение карточек»: моя vs конкурента, одна рубрика, честный вердикт. */
export async function compareCards(
  mineDataUrl: string,
  competitorDataUrl: string,
  product?: Partial<ProductInfo>,
  concern?: string,
): Promise<ComparisonReport> {
  const llm = getLLMProvider();
  const [mine, competitor] = await Promise.all([
    ensureDataUrl(mineDataUrl),
    ensureDataUrl(competitorDataUrl),
  ]);
  const result = await llm.complete({
    task: "compare",
    json: true,
    vision: true,
    // как и в анализе: вердикт обязан быть воспроизводимым
    temperature: 0,
    context: { product },
    messages: [
      { role: "system", content: SYSTEM_COMPARATOR },
      { role: "user", content: "Карточка А — карточка продавца:", imageDataUrl: mine },
      { role: "user", content: "Карточка Б — карточка конкурента:", imageDataUrl: competitor },
      { role: "user", content: comparisonUserPrompt(product, concern) },
    ],
  });
  // как и в analyze: ключи с zod-`.default()` в рантайме всегда присутствуют
  return parse(result.text, comparisonReportSchema, "сравнение карточек") as ComparisonReport;
}

export async function generateCardIdeas(product: Partial<ProductInfo>): Promise<CardIdea[]> {
  const llm = getLLMProvider();
  const result = await llm.complete({
    task: "ideas",
    json: true,
    context: { product },
    messages: [
      { role: "system", content: SYSTEM_IDEATOR },
      { role: "user", content: ideasUserPrompt(product) },
    ],
  });
  const parsed = parse(result.text, z.object({ ideas: z.array(cardIdeaSchema) }), "идеи карточек");
  return parsed.ideas as CardIdea[];
}

export async function generatePromptForImageModel(args: {
  product: Partial<ProductInfo>;
  cardType: string;
  style: string;
  userPrompt?: string;
}): Promise<StructuredImagePrompt> {
  const llm = getLLMProvider();
  const result = await llm.complete({
    task: "build-prompt",
    json: true,
    context: args,
    messages: [
      { role: "system", content: SYSTEM_PROMPT_ENGINEER },
      { role: "user", content: buildPromptUserPrompt(args) },
    ],
  });
  const fields = parse(result.text, structuredPromptSchema, "построение промпта");
  return { ...fields, rendered: renderStructuredPrompt(fields) };
}

export async function improveUserPrompt(args: {
  prompt: string;
  cardType?: string;
  style?: string;
}): Promise<string> {
  const llm = getLLMProvider();
  const result = await llm.complete({
    task: "improve-prompt",
    context: args,
    messages: [
      { role: "system", content: SYSTEM_PROMPT_IMPROVER },
      { role: "user", content: improveUserMessage(args) },
    ],
  });
  return result.text.trim();
}

export async function scoreGeneratedCard(args: {
  imageDataUrl: string;
  product?: Partial<ProductInfo>;
  cardType?: string;
}): Promise<CardScore> {
  const llm = getLLMProvider();
  const image = await ensureDataUrl(args.imageDataUrl);
  const result = await llm.complete({
    task: "score",
    json: true,
    vision: true,
    context: args,
    messages: [
      { role: "system", content: SYSTEM_SCORER },
      {
        role: "user",
        content: scoreUserPrompt(args),
        imageDataUrl: image,
      },
    ],
  });
  // mock wraps in { scores }, a real model may return the score object directly
  const loose = safeJson(result.text);
  const candidate =
    loose && typeof loose === "object" && "scores" in loose
      ? (loose as { scores: unknown }).scores
      : loose;
  const parsed = cardScoreSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ProviderError(
      "Не удалось оценить карточку. Попробуйте ещё раз.",
      parsed.error.message,
    );
  }
  return parsed.data;
}

/* -------------------------------------------------------------------------- */
/*  Prompt authoring ("Написать промпт")                                      */
/* -------------------------------------------------------------------------- */

export async function writePrompt(input: {
  product?: Partial<ProductInfo>;
  cardType?: string;
  styleMode?: string;
  userNote?: string;
  referenceImageDataUrl?: string;
}): Promise<PromptResult> {
  const product = input.product ?? {};
  const intent: PromptIntent = {
    productName: product.name,
    category: product.category,
    benefits: product.benefits,
    painPoints: product.pains,
    targetAudience: product.audience,
    userNote: input.userNote,
    cardType: input.cardType,
    styleMode: (input.styleMode as PromptIntent["styleMode"]) ?? "auto",
    generationMode: input.referenceImageDataUrl ? "image-to-image" : "text-to-image",
  };

  const image = input.referenceImageDataUrl
    ? await ensureDataUrl(input.referenceImageDataUrl)
    : undefined;

  try {
    const llm = getLLMProvider();
    const result = await llm.complete({
      task: "write-prompt",
      json: true,
      vision: !!image,
      context: { intent },
      messages: buildPromptMessages(intent, image),
    });
    const parsed = parsePromptResult(safeJson(result.text));
    return parsed ?? fallbackPrompt(intent);
  } catch {
    // never block the user — fall back to the deterministic prompt
    return fallbackPrompt(intent);
  }
}

/* -------------------------------------------------------------------------- */
/*  Image-model functions                                                     */
/* -------------------------------------------------------------------------- */

export async function generateImageFromText(args: {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  count?: number;
  /** Russian text to render on the card, kept verbatim (NOT translated) */
  cardText?: string;
}): Promise<ImageResult> {
  const image = getImageProvider();
  const prompt = await buildModelPrompt(args.prompt, args.cardText);
  const negativePrompt = await translateToEnglish(args.negativePrompt ?? "");
  return image.textToImage({ ...args, prompt, negativePrompt });
}

export async function generateImageFromReference(args: {
  prompt: string;
  negativePrompt?: string;
  referenceImageDataUrl: string;
  strength?: number;
  aspectRatio?: string;
  count?: number;
  /** Russian text to render on the card, kept verbatim (NOT translated) */
  cardText?: string;
}): Promise<ImageResult> {
  const image = getImageProvider();
  const prompt = await buildModelPrompt(args.prompt, args.cardText);
  const negativePrompt = await translateToEnglish(args.negativePrompt ?? "");
  return image.imageToImage({ ...args, prompt, negativePrompt });
}

/**
 * Image models work best in English, but users write Russian. Translate the
 * descriptive prompt to English.
 *
 * IMPORTANT: image models render Cyrillic poorly, so we DON'T ask the model to
 * draw the headline text. Instead we pass the headline's *meaning* (to guide the
 * composition) and instruct the model to leave a clean empty typography zone.
 * The real Russian text is composited on top later via the canvas renderer.
 */
async function buildModelPrompt(prompt: string, cardText?: string): Promise<string> {
  const en = await translateToEnglish(prompt);
  const text = cardText?.trim();
  if (!text) return en;
  const meaning = await translateToEnglish(text);
  return (
    `${en}. Reserve a clean, empty typography area for a short headline about "${meaning}". ` +
    `Do NOT render any text, letters, words or logos inside the image — keep that area clear so ` +
    `text can be overlaid later. Balanced premium layout with the product as the focal point.`
  );
}

/** Translate to English via the LLM; returns input unchanged if it has no Cyrillic. */
async function translateToEnglish(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || !/[а-яё]/i.test(trimmed)) return trimmed;
  try {
    const llm = getLLMProvider();
    const result = await llm.complete({
      task: "translate",
      temperature: 0.1,
      context: { text: trimmed },
      messages: [
        { role: "system", content: SYSTEM_TRANSLATOR },
        { role: "user", content: trimmed },
      ],
    });
    const out = result.text.trim();
    return out || trimmed;
  } catch {
    // translation is best-effort; fall back to the original text
    return trimmed;
  }
}

/* -------------------------------------------------------------------------- */
/*  Prompt assembly helpers (sent to real LLM; mock ignores)                  */
/* -------------------------------------------------------------------------- */

function productBlock(p?: Partial<ProductInfo>): string {
  if (!p) return "Данные о товаре не переданы — опирайся на изображение.";
  return [
    p.name && `Название: ${p.name}`,
    p.category && `Категория: ${p.category}`,
    p.price && `Цена: ${p.price}`,
    p.audience && `ЦА: ${p.audience}`,
    p.benefits?.length && `Преимущества: ${p.benefits.join(", ")}`,
    p.pains?.length && `Боли клиента: ${p.pains.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function analysisUserPrompt(p?: Partial<ProductInfo>, concern?: string): string {
  return `Проанализируй карточку товара с изображения. Данные о товаре:
${productBlock(p)}
${concern ? `\nЧто беспокоит продавца: ${concern}. Сфокусируй анализ и приоритеты на этом.\n` : ""}
Верни JSON со строго такими полями:
observed ({product — какой товар видишь, existingText[] — ВСЕ надписи с карточки дословно (пустой массив, если текста нет), composition — композиция в одном предложении}),
diagnosis (короткий диагноз), mainProblem (главная проблема одним предложением),
whatWorks (что уже хорошо, массив),
problems (массив {issue, severity: "high"|"medium"|"low", fix — конкретное исправление}, отсортируй по важности, каждая проблема ровно один раз),
headlineIdeas (3 готовых заголовка до 6 слов каждый),
benefitTexts (3–4 готовых текста для плашек преимуществ, 1–3 слова каждый),
textRewrites (массив {current — существующая надпись дословно или "" если её нет, better — готовая замена}),
visualTips (рекомендации по визуалу, массив),
thumbnailTest ({readable: true/false, verdict — читаемость карточки в миниатюре ~200px одним предложением}),
riskFlags (рискованные для модерации WB формулировки с карточки; пустой массив, если чисто),
newCardIdeas (массив объектов {cardType, title, angle, headline, keyPoints[]}),
scores ({cover, infographics, text, composition, trust, sellingPower, total} 0-100 по рубрике),
scoreReasons ({cover, infographics, text, composition, trust, sellingPower} — по одному короткому предложению-обоснованию).`;
}

function comparisonUserPrompt(p?: Partial<ProductInfo>, concern?: string): string {
  return `Сравни карточку А (продавца) и карточку Б (конкурента). Данные о товаре:
${productBlock(p)}
${concern ? `\nЧто важно продавцу: ${concern}. Сфокусируй сравнение на этом.\n` : ""}
Верни JSON со строго такими полями:
observed ({mine — что видишь на карточке А, competitor — что видишь на карточке Б; по одному предложению с перечислением надписей}),
verdict ("mine" | "competitor" | "tie" — по правилу разницы total из рубрики),
verdictText (2–3 предложения: кто выигрывает и почему, простым языком),
scoreMine и scoreCompetitor ({cover, infographics, text, composition, trust, sellingPower, total} 0–100 по рубрике, кратно 5),
axisComments ({cover, infographics, text, composition, trust, sellingPower} — по одному предложению-сравнению на ось),
advantages (в чём карточка А уже сильнее: каждый пункт в форме «У вас … — у конкурента …», массив),
weaknesses (что у конкурента сделано лучше: каждый пункт начинается с «У конкурента …» и заканчивается контрастом с карточкой А, массив),
adopt (что перенять у конкурента: конкретные шаги для карточки А, каждый начинается с глагола, массив 3–5 пунктов),
thumbnailVerdict (кто заметнее в миниатюре ~200px и почему, одно предложение).`;
}

function ideasUserPrompt(p: Partial<ProductInfo>): string {
  return `Придумай 5–10 идей карточек для этого товара:
${productBlock(p)}

Верни JSON: { "ideas": [ { "cardType", "title", "angle", "headline", "keyPoints": [] } ] }.
Покрой разные смыслы: обложка, преимущества, lifestyle, состав, доверие, проблема→решение, сравнение.`;
}

function buildPromptUserPrompt(args: {
  product: Partial<ProductInfo>;
  cardType: string;
  style: string;
  userPrompt?: string;
}): string {
  const ct = CARD_TYPE_MAP[args.cardType as keyof typeof CARD_TYPE_MAP];
  const st = STYLE_MAP[args.style as keyof typeof STYLE_MAP];
  return `Собери структурный промпт для image-модели (карточка Wildberries).
${productBlock(args.product)}
Тип карточки: ${ct?.title ?? args.cardType} (${ct?.promptHint ?? ""})
Стиль: ${st?.title ?? args.style} — visual: ${st?.visual ?? ""}; palette: ${st?.palette ?? ""}; lighting: ${st?.lighting ?? ""}
Пожелания пользователя: ${args.userPrompt || "нет"}

Верни JSON со строго такими ключами (значения на английском):
product, marketplace, cardType, targetAudience, mainBenefit, visualStyle, composition,
background, lighting, typographyArea, colorPalette, premiumDetails, restrictions, negativePrompt.
Обязательно в restrictions: "do not distort product".`;
}

function improveUserMessage(args: { prompt: string; cardType?: string; style?: string }): string {
  return `Черновой промпт пользователя: "${args.prompt}".
Тип карточки: ${args.cardType ?? "-"}. Стиль: ${args.style ?? "-"}.
Верни улучшенный промпт одной строкой НА РУССКОМ языке.`;
}

function scoreUserPrompt(args: { product?: Partial<ProductInfo>; cardType?: string }): string {
  return `Оцени эту карточку для Wildberries по 6 осям (0-100) и выведи total.
${productBlock(args.product)}
Тип карточки: ${args.cardType ?? "не указан"}.
Верни JSON: { "cover", "infographics", "text", "composition", "trust", "sellingPower", "total", "comment" }.`;
}

/* -------------------------------------------------------------------------- */
/*  JSON parsing                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Vision-capable LLMs here (Yandex Qwen) require images as base64 `data:` URLs.
 * Generated images from fal.ai come back as remote URLs, so fetch + inline them.
 */
async function ensureDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  if (/^https?:\/\//.test(src)) {
    let res: Response;
    try {
      res = await fetch(src, { cache: "no-store" });
    } catch (e) {
      throw new ProviderError(
        "Не удалось загрузить изображение.",
        `fetch image failed: ${String(e)}`,
      );
    }
    if (!res.ok) {
      throw new ProviderError("Не удалось загрузить изображение.", `image ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
  throw new ProviderError("Некорректный формат изображения.", "unsupported image src");
}

function safeJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // try to extract the first {...} block
    const match = /\{[\s\S]*\}/.exec(cleaned);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parse<T>(text: string, schema: z.ZodType<T>, label: string): T {
  const data = safeJson(text);
  if (data == null) {
    throw new ProviderError(
      `AI вернул некорректный ответ (${label}).`,
      `unparseable: ${text.slice(0, 200)}`,
    );
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ProviderError(`AI вернул ответ в неверном формате (${label}).`, result.error.message);
  }
  return result.data;
}

/* ------------------------------ SEO texts ------------------------------- */

const seoTextsSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  keywords: z.array(z.string()).default([]),
});

export type SeoTexts = { title: string; description: string; keywords: string[] };

/**
 * SEO copy for a WB listing: title with the main keys, a natural long
 * description and a keyword list. Never throws — falls back to a
 * deterministic draft so a batch (turnkey) step can't die on it.
 */
const AUDIENCE_LABEL: Record<string, string> = {
  women: "женщины",
  men: "мужчины",
  kids: "дети",
  unisex: "унисекс",
};

export async function generateSeoTexts(input: {
  productName: string;
  category?: string;
  benefits: string[];
  materials?: string[];
  /** women | men | kids | unisex */
  audience?: string;
  season?: string;
  brand?: string;
  /** ключи, собранные самим продавцом — используются обязательно */
  ownKeywords?: string[];
  /** живые подсказки поиска WB (см. wb-suggest.ts), по убыванию популярности */
  wbSuggestions?: string[];
}): Promise<SeoTexts> {
  const fallback: SeoTexts = {
    title: input.productName,
    description: [input.productName, ...input.benefits].join(". "),
    keywords: [input.productName, input.category ?? ""].filter(Boolean),
  };
  try {
    const llm = getLLMProvider();
    const result = await llm.complete({
      task: "seo",
      json: true,
      context: { input },
      messages: [
        {
          role: "system",
          content:
            "Ты — SEO-специалист по Wildberries. Пишешь тексты, по которым карточку находят в поиске WB. " +
            "Запрещены формулировки, за которые модерация WB снимает карточку: превосходные степени без подтверждения («лучший», «№1», «самый»), " +
            "медицинские и лечебные обещания («лечит», «избавляет от боли», «оздоравливает»), упоминание чужих брендов и торговых марок, " +
            "обещания результата («гарантия похудения»). Отвечай строго JSON на русском, без markdown.",
        },
        {
          role: "user",
          content: `Товар: ${input.productName}
Категория: ${input.category ?? "не указана"}
Целевая аудитория: ${AUDIENCE_LABEL[input.audience ?? ""] ?? "не указана"}
Сезон/повод: ${input.season || "не указан"}
Бренд продавца: ${input.brand || "не указан — бренд в название не вставляй"}
Преимущества: ${input.benefits.join(", ") || "не указаны"}
Состав: ${(input.materials ?? []).join(", ") || "не указан"}
${
  input.wbSuggestions?.length
    ? `\nРЕАЛЬНЫЕ подсказки поиска WB по этому товару, по убыванию популярности (это настоящий спрос — выбирай ключи В ПЕРВУЮ ОЧЕРЕДЬ отсюда, отбрасывая нерелевантные товару):\n${input.wbSuggestions.join("; ")}\n`
    : ""
}${
  input.ownKeywords?.length
    ? `\nКлючевые фразы продавца — включи КАЖДУЮ в keywords, а самые важные вплети в название и описание:\n${input.ownKeywords.join("; ")}\n`
    : ""
}
Верни JSON: {
"title": SEO-название СТРОГО до 60 символов (жёсткий лимит WB) — начинается с самого частотного ключа${input.brand ? " или бренда" : ""}, без спама и КАПСА,
"description": продающее описание 800–1200 знаков — естественный текст с вплетёнными ключевыми запросами, абзацами, без списков и без выдуманных характеристик,
"keywords": массив из 12–15 поисковых запросов, от частотных к нишевым${input.wbSuggestions?.length ? " — опирайся на реальные подсказки WB выше" : ""}
}`,
        },
      ],
    });
    const seo = parse(result.text, seoTextsSchema, "SEO-тексты") as SeoTexts;
    // Жёсткая страховка лимита WB: название длиннее 60 обрезаем по слову —
    // красивое название на 80 символов WB оборвёт на полуслове сам.
    if (seo.title.length > 60) {
      seo.title = seo.title.slice(0, 60).replace(/\s+\S*$/u, "").replace(/[,;:\s]+$/u, "");
    }
    return seo;
  } catch {
    return fallback;
  }
}
