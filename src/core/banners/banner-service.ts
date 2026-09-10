import "server-only";
import { getLLMProvider, getBannerImageProvider } from "@/core/ai/providers";
import type {
  ImageJobHandle,
  ImageJobStatus,
  I2IRequest,
  T2IRequest,
} from "@/core/ai/providers/types";
import { ProviderError } from "@/lib/errors";
import { buildBannerPrompt } from "./banner-prompt-builder";
import { getBannerFormat, snapTo16 } from "./formats";
import type { BannerFormatId, BannerLook, BannerOffer } from "./types";

/**
 * Раздел «Рекламные баннеры» под гейтом: пока его видит только админ.
 * Раскатка на всех — переменной BANNERS=all на проде (как PHOTO_V2 и NOTICES),
 * без выкладки кода.
 */
export function bannersEnabled(role?: string | null): boolean {
  return role === "admin" || process.env.BANNERS === "all";
}

/* --------------------------- заголовки (бесплатно) --------------------------- */

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

export type HeadlineOption = { headline: string; subheadline?: string };

/** Запасные варианты, если модель недоступна — человек всё равно должен ехать дальше. */
function fallbackHeadlines(offer: BannerOffer): HeadlineOption[] {
  const name = offer.productName.trim() || "Ваш товар";
  const benefit = offer.benefit?.trim();
  return [
    { headline: name, subheadline: benefit || undefined },
    benefit ? { headline: benefit, subheadline: name } : { headline: name },
    { headline: name, subheadline: offer.price?.trim() ? `от ${offer.price.trim()}` : undefined },
  ];
}

/**
 * Три варианта заголовка ДО генерации (решение владельца 2026-09-10): человек
 * утверждает текст заранее, потому что запечённый заголовок правится только
 * новой платной генерацией. Действие бесплатное — это текстовая модель.
 */
export async function suggestHeadlines(offer: BannerOffer): Promise<HeadlineOption[]> {
  try {
    const llm = getLLMProvider();
    const res = await llm.complete({
      task: "write-prompt",
      json: true,
      context: { intent: { productName: offer.productName } },
      messages: [
        {
          role: "system",
          content: `Ты — копирайтер рекламных баннеров. Пишешь короткий продающий текст для баннера, который ведёт на сайт.
Правила:
— заголовок 2-5 слов, бьёт в главную выгоду, читается за секунду;
— вторая строка (subheadline) до 6 слов, уточняет; можно опустить;
— пиши по-русски, без канцелярита, без восклицательных знаков подряд;
— НИКОГДА не выдумывай цифры, цены, проценты, сроки, гарантии и характеристики: используй только то, что дал пользователь;
— не повторяй одно и то же в заголовке и во второй строке;
— три варианта должны реально отличаться подходом, а не порядком слов.
Ответ строго JSON: {"options":[{"headline":"...","subheadline":"..."},…]} ровно три штуки.`,
        },
        {
          role: "user",
          content: `Товар: ${offer.productName}
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
    return options.length ? options : fallbackHeadlines(offer);
  } catch (e) {
    console.error("[banners] headline suggestion failed:", e);
    return fallbackHeadlines(offer);
  }
}

/* ------------------------------ генерация ------------------------------ */

export type BannerBaseArgs = {
  productName: string;
  headline: string;
  subheadline?: string;
  look: BannerLook;
  format: BannerFormatId;
  productImage?: string;
  /** внизу будет накладка сайта — резервируем спокойную полосу */
  reserveBand: boolean;
};

export type BannerSubmit =
  | { kind: "queued"; job: ImageJobHandle; width: number; height: number; prompt: string }
  | { kind: "done"; imageUrl: string; width: number; height: number; prompt: string };

/**
 * Ставит генерацию баннера в очередь fal (или выполняет сразу на синхронном
 * провайдере — mock в тестах). Размер запрашивается ТОЧНЫЙ: gpt-image принимает
 * {width,height}, поэтому экспорту потом нечего пересчитывать и нечего обрезать.
 */
export async function submitBannerBase(args: BannerBaseArgs): Promise<BannerSubmit> {
  const fmt = getBannerFormat(args.format);
  // формат уже кратен 16, snap — страховка на случай будущих правок таблицы
  const width = snapTo16(fmt.width);
  const height = snapTo16(fmt.height);

  const { prompt, negativePrompt } = buildBannerPrompt({
    productName: args.productName,
    headline: args.headline,
    subheadline: args.subheadline,
    look: args.look,
    format: args.format,
    hasProductImage: Boolean(args.productImage),
    reserveBand: args.reserveBand,
  });

  const provider = getBannerImageProvider();
  const common: T2IRequest = {
    prompt,
    negativePrompt,
    aspectRatio: fmt.ratio,
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
    if (!url) throw new ProviderError("Не удалось создать баннер.", "empty i2i result");
    return { kind: "done", imageUrl: url, width, height, prompt };
  }

  if (provider.supportsAsync && provider.submitTextToImage) {
    return { kind: "queued", job: await provider.submitTextToImage(common), width, height, prompt };
  }
  const res = await provider.textToImage(common);
  const url = res.images[0]?.url;
  if (!url) throw new ProviderError("Не удалось создать баннер.", "empty t2i result");
  return { kind: "done", imageUrl: url, width, height, prompt };
}

export async function pollBannerJob(job: ImageJobHandle): Promise<ImageJobStatus> {
  const provider = getBannerImageProvider();
  if (!provider.pollJob) {
    return { status: "failed", error: "provider has no async polling" };
  }
  return provider.pollJob(job);
}
