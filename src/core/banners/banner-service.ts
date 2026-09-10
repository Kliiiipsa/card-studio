import "server-only";
import { getLLMProvider, getBannerImageProvider } from "@/core/ai/providers";
import type {
  ImageJobHandle,
  ImageJobStatus,
  I2IRequest,
  T2IRequest,
} from "@/core/ai/providers/types";
import { AppError, ProviderError } from "@/lib/errors";
import { buildBannerPrompt } from "./banner-prompt-builder";
import { getFormat, checkSize, snapTo16, CREATIVE_TYPES } from "./formats";
import type { BannerLook, CreativeTypeId, OptionalFieldId } from "./types";

/**
 * Раздел под гейтом: пока его видит только админ. Раскатка на всех —
 * переменной BANNERS=all на проде, без выкладки кода.
 */
export function bannersEnabled(role?: string | null): boolean {
  return role === "admin" || process.env.BANNERS === "all";
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
    const m = /\{[\s\S]*\}/.exec(cleaned);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/* --------------------- разбор свободного описания --------------------- */

export type HeadlineOption = { headline: string; subheadline?: string };

export type CreativePlan = {
  creativeType: CreativeTypeId;
  subject: string;
  benefit?: string;
  /** какие необязательные поля стоит показать под эту задачу */
  fields: OptionalFieldId[];
  headlines: HeadlineOption[];
  /**
   * Текстовая модель не ответила, и это черновик «на глазок». Интерфейс обязан
   * сказать об этом вслух: молча подсунуть плохой заголовок хуже, чем честно
   * попросить вписать его руками — заголовок ведь запекается в картинку.
   */
  degraded?: boolean;
};

const TYPE_IDS = CREATIVE_TYPES.map((t) => t.id);
const FIELD_IDS: OptionalFieldId[] = ["benefit", "price", "oldPrice", "phone", "site", "logo"];

/**
 * Черновик, когда модель не ответила. Заголовок НЕ выдумываем и целиком описание
 * в него не суём: длинная фраза, запечённая в картинку, выглядит как ошибка и
 * стоит человеку 15 генов. Даём короткую заготовку и честный флаг degraded.
 */
function fallbackPlan(description: string): CreativePlan {
  const words = description.trim().split(/\s+/).filter(Boolean);
  const subject =
    words
      .slice(0, 4)
      .join(" ")
      .replace(/[.,;:!?]+$/, "") || "Ваше предложение";
  return {
    creativeType: "banner",
    subject,
    fields: ["benefit", "price", "site"],
    headlines: [{ headline: subject }],
    degraded: true,
  };
}

/**
 * Человек пишет свободным текстом, что ему нужно, — модель понимает задачу и
 * заполняет форму черновиком.
 *
 * ВАЖНО: модель выбирает ИЗ ФИКСИРОВАННОГО списка типов и полей, а не выдумывает
 * свои. Иначе при одинаковом вводе интерфейс каждый раз разный, и разбирать
 * жалобу «у меня пропало поле цены» невозможно.
 */
export async function planCreative(description: string): Promise<CreativePlan> {
  try {
    const llm = getLLMProvider();
    const res = await llm.complete({
      task: "write-prompt",
      json: true,
      context: { intent: { description } },
      messages: [
        {
          role: "system",
          content: `Ты — рекламный директор. Человек описал своими словами, что ему нужно. Разбери задачу и заполни форму.

Ответ строго JSON:
{"creativeType":"banner|social-post|profile-header|business-card",
 "subject":"что рекламируем, 2-6 слов",
 "benefit":"главное преимущество одной строкой или пустая строка",
 "fields":["benefit","price","oldPrice","phone","site","logo"],
 "headlines":[{"headline":"...","subheadline":"..."}]}

Правила:
— creativeType выбирай ТОЛЬКО из четырёх значений выше: баннер для рекламы, пост в соцсети, шапка канала, визитка;
— fields — какие поля реально нужны этой задаче. Визитке нужны телефон и сайт, распродаже — цена и старая цена, шапке канала цена обычно не нужна. Только значения из списка;
— headlines — ровно три РАЗНЫХ по подходу варианта, заголовок 2-5 слов, вторая строка до 6 слов и может отсутствовать;
— пиши по-русски, без канцелярита;
— НИКОГДА не выдумывай цифры, цены, проценты, сроки, гарантии и характеристики: бери только то, что человек написал сам.`,
        },
        { role: "user", content: description.slice(0, 1500) },
      ],
    });
    const p = safeJson(res.text) as Partial<CreativePlan> | null;
    if (!p) return fallbackPlan(description);

    const creativeType = TYPE_IDS.includes(p.creativeType as CreativeTypeId)
      ? (p.creativeType as CreativeTypeId)
      : "banner";
    const fields = Array.isArray(p.fields)
      ? p.fields.filter((f): f is OptionalFieldId => FIELD_IDS.includes(f as OptionalFieldId))
      : [];
    const headlines = (Array.isArray(p.headlines) ? p.headlines : [])
      .filter((h) => typeof h?.headline === "string" && h.headline.trim().length > 1)
      .slice(0, 3)
      .map((h) => ({
        headline: h.headline.trim(),
        subheadline:
          typeof h.subheadline === "string" && h.subheadline.trim()
            ? h.subheadline.trim()
            : undefined,
      }));

    // Если модель ответила, но заголовков не дала — это тоже деградация:
    // чем подсунуть заготовку молча, честнее сказать «впишите сами».
    if (!headlines.length) return { ...fallbackPlan(description), creativeType, fields };

    return {
      creativeType,
      subject:
        (typeof p.subject === "string" && p.subject.trim()) || fallbackPlan(description).subject,
      benefit: typeof p.benefit === "string" && p.benefit.trim() ? p.benefit.trim() : undefined,
      fields: fields.length ? fields : ["benefit", "price", "site"],
      headlines,
    };
  } catch (e) {
    console.error("[banners] plan failed:", e);
    return fallbackPlan(description);
  }
}

/* --------------------------- заголовки (бесплатно) --------------------------- */

/**
 * Три варианта заголовка по заполненным полям. Отдельно от planCreative —
 * нужен, когда человек поправил форму и хочет свежие варианты. Бесплатно.
 */
export async function suggestHeadlines(offer: {
  subject: string;
  benefit?: string;
  price?: string;
  oldPrice?: string;
}): Promise<HeadlineOption[]> {
  const fallback: HeadlineOption[] = [
    { headline: offer.subject.trim() || "Ваше предложение", subheadline: offer.benefit?.trim() },
  ];
  try {
    const llm = getLLMProvider();
    const res = await llm.complete({
      task: "write-prompt",
      json: true,
      context: { intent: { productName: offer.subject } },
      messages: [
        {
          role: "system",
          content: `Ты — копирайтер рекламных креативов. Пишешь короткий текст для баннера, который ведёт на сайт.
Правила: заголовок 2-5 слов, бьёт в главную выгоду; вторая строка до 6 слов, уточняет, можно опустить;
по-русски, без канцелярита; НИКОГДА не выдумывай цифры, цены, сроки и гарантии — только данные пользователя;
не дублируй заголовок во второй строке; три варианта отличаются подходом, а не порядком слов.
Ответ строго JSON: {"options":[{"headline":"...","subheadline":"..."}]} ровно три штуки.`,
        },
        {
          role: "user",
          content: `Что рекламируем: ${offer.subject}
Главное преимущество: ${offer.benefit?.trim() || "-"}
Цена: ${offer.price?.trim() || "-"}
Старая цена: ${offer.oldPrice?.trim() || "-"}`,
        },
      ],
    });
    const parsed = safeJson(res.text) as { options?: HeadlineOption[] } | null;
    const options = (parsed?.options ?? [])
      .filter((o) => typeof o?.headline === "string" && o.headline.trim().length > 1)
      .slice(0, 3)
      .map((o) => ({
        headline: o.headline.trim(),
        subheadline:
          typeof o.subheadline === "string" && o.subheadline.trim()
            ? o.subheadline.trim()
            : undefined,
      }));
    return options.length ? options : fallback;
  } catch (e) {
    console.error("[banners] headline suggestion failed:", e);
    return fallback;
  }
}

/* ------------------------------ генерация ------------------------------ */

export type BannerBaseArgs = {
  creativeType: CreativeTypeId;
  format: string;
  look: BannerLook;
  subject: string;
  headline: string;
  subheadline?: string;
  price?: string;
  oldPrice?: string;
  cta?: string;
  phone?: string;
  site?: string;
  productImage?: string;
  logoCorner?: "top-left" | "top-right";
};

export type BannerSubmit =
  | { kind: "queued"; job: ImageJobHandle; width: number; height: number; prompt: string }
  | { kind: "done"; imageUrl: string; width: number; height: number; prompt: string };

/**
 * Ставит генерацию в очередь fal. Размер запрашивается ТОЧНЫЙ — gpt-image
 * принимает {width,height} и отдаёт ровно его, поэтому экспорту нечего
 * пересчитывать и нечего обрезать.
 */
export async function submitBannerBase(args: BannerBaseArgs): Promise<BannerSubmit> {
  const fmt = getFormat(args.creativeType, args.format);
  const width = snapTo16(fmt.width);
  const height = snapTo16(fmt.height);

  // Внятный отказ ДО резерва генов лучше, чем невнятная ошибка от модели после.
  const sizeProblem = checkSize(width, height);
  if (sizeProblem) throw new AppError(sizeProblem);

  const { prompt, negativePrompt } = buildBannerPrompt({
    creativeType: args.creativeType,
    format: args.format,
    look: args.look,
    subject: args.subject,
    headline: args.headline,
    subheadline: args.subheadline,
    price: args.price,
    oldPrice: args.oldPrice,
    cta: args.cta,
    phone: args.phone,
    site: args.site,
    hasProductImage: Boolean(args.productImage),
    logoCorner: args.logoCorner,
  });

  const provider = getBannerImageProvider();
  const common: T2IRequest = {
    prompt,
    negativePrompt,
    pixelSize: { width, height },
    count: 1,
  };

  if (args.productImage) {
    const req: I2IRequest = { ...common, referenceImageDataUrl: args.productImage };
    if (provider.supportsAsync && provider.submitImageToImage) {
      return { kind: "queued", job: await provider.submitImageToImage(req), width, height, prompt };
    }
    const res = await provider.imageToImage(req);
    const url = res.images[0]?.url;
    if (!url) throw new ProviderError("Не удалось создать креатив.", "empty i2i result");
    return { kind: "done", imageUrl: url, width, height, prompt };
  }

  if (provider.supportsAsync && provider.submitTextToImage) {
    return { kind: "queued", job: await provider.submitTextToImage(common), width, height, prompt };
  }
  const res = await provider.textToImage(common);
  const url = res.images[0]?.url;
  if (!url) throw new ProviderError("Не удалось создать креатив.", "empty t2i result");
  return { kind: "done", imageUrl: url, width, height, prompt };
}

export async function pollBannerJob(job: ImageJobHandle): Promise<ImageJobStatus> {
  const provider = getBannerImageProvider();
  if (!provider.pollJob) {
    return { status: "failed", error: "provider has no async polling" };
  }
  return provider.pollJob(job);
}
