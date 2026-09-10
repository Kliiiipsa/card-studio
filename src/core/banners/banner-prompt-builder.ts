import { getCreativeType, getFormat } from "./formats";
import { orientationOf, pickVariants } from "./composition-variants";
import type { BannerLook, CreativeTypeId } from "./types";

/**
 * Промпт креатива для gpt-image (кириллицу он печатает сам).
 *
 * Ключевое устройство: раскладка, типографика, декор и место контактов НЕ
 * зашиты, а берутся из четырёх независимых пулов (composition-variants.ts).
 * Стартовая связка определяется предметом рекламы, каждая перегенерация
 * сдвигает сид. Первая версия имела по одному варианту на пропорцию — и все
 * креативы выходили на один шаблон «фото справа, текст слева».
 *
 * Логотип модели НЕ отдаём: она перерисует его по мотивам. Просим оставить под
 * него чистый угол, а сам знак кладём поверх точными пикселями.
 */

const LOOK_SPEC: Record<Exclude<BannerLook, "adaptive">, string> = {
  light:
    "Light, airy commercial look: clean bright ground in soft neutral or pastel tones, generous daylight, gentle gradients and soft shadows. Calm and premium, never washed out.",
  dark: "Dark premium look: deep near-black or rich dark ground, dramatic directional light sculpting the subject, subtle glow and reflections. High contrast, expensive and confident.",
  bright:
    "Bold vivid promo look: saturated confident colour ground with energetic contrast, crisp graphic shapes, punchy lighting. Attention-grabbing but tidy — never noisy.",
  premium:
    "Luxury look: deep charcoal or near-black ground with warm gold and champagne accents, thin elegant rules, soft specular highlights. Restrained, expensive, unhurried.",
  warm: "Warm human look: sand, terracotta and cream tones, soft late-afternoon light, natural textures like wood, linen and paper. Friendly and grounded.",
  tech: "Technological look: cool blue and graphite ground, glass and metal surfaces, crisp rim light and subtle glow, clean geometric accents. Precise and modern.",
};

/**
 * «Адаптивный стиль»: оформление выбирает модель под предмет рекламы. Рамки
 * задаём мы, иначе получим случайность вместо решения.
 */
const ADAPTIVE_SPEC =
  "ART DIRECTION IS YOURS: choose the palette, the lighting and the ground that genuinely fit THIS subject and its audience — a dental clinic, a tractor rental and a perfume each deserve a different world. " +
  "Commit to ONE clear idea rather than hedging: pick a dominant colour, one accent that fights it, and hold them across the frame. " +
  "Avoid the safe default of a grey studio backdrop unless the subject truly calls for one.";

export type BannerPromptArgs = {
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
  hasProductImage: boolean;
  logoCorner?: "top-left" | "top-right";
  /** растёт на каждой перегенерации → следующая связка вариантов */
  variantSeed?: number;
  /** ручной выбор композиции из списка, если человек его сделал */
  compositionId?: string;
};

export function buildBannerPrompt(args: BannerPromptArgs): {
  prompt: string;
  negativePrompt: string;
  /** какие варианты выпали — пишем в журнал, чтобы понимать разбор жалоб */
  variants: { composition: string; typography: string; decor: string; contacts: string };
} {
  const type = getCreativeType(args.creativeType);
  const fmt = getFormat(args.creativeType, args.format);
  const subject = args.subject.trim() || "the subject";

  const orientation = orientationOf(fmt.width, fmt.height);
  const v = pickVariants({
    subject,
    orientation,
    variantSeed: args.variantSeed ?? 0,
    compositionId: args.compositionId,
  });

  const base = args.hasProductImage
    ? `Using the provided photo, create a FINISHED ${type.intent} for ${subject}. Keep the photographed subject photorealistic and unchanged: same shape, colour, material, finish, proportions and any branding visible on it.`
    : `Create a FINISHED ${type.intent} for ${subject}.`;

  // Для рекламы сцена собирается заново — в отличие от инфографики, где фон
  // клиента бережём: постановочный кадр здесь и есть продукт услуги.
  const scene = args.hasProductImage
    ? "Rebuild the environment around the subject into a purposeful advertising scene that suits it. Keep the subject photographic and dimensional; do not place it on a flat empty backdrop, and do not default to a generic white studio with a potted plant."
    : "Build a purposeful advertising scene that suits this specific subject — believable surfaces, gentle depth, restrained supporting props.";

  /**
   * Закрытый список текстов. Он же защита от «двух кнопок»: если не перечислить
   * всё явно и не запретить остальное, модель дорисует свой ценник и свой домен.
   */
  const texts: string[] = [`• Headline (dominant): «${args.headline.trim()}»`];
  if (args.subheadline?.trim()) {
    texts.push(`• Second line (clearly smaller, lighter): «${args.subheadline.trim()}»`);
  }
  if (args.price?.trim()) {
    texts.push(
      args.oldPrice?.trim()
        ? `• Price block: the new price «${args.price.trim()}» set large, with the old price «${args.oldPrice.trim()}» beside it in smaller type, struck through`
        : `• Price, set large and confident: «${args.price.trim()}»`,
    );
  }
  if (args.cta?.trim()) {
    texts.push(
      `• A rounded call-to-action button, clearly a button, with exactly this label: «${args.cta.trim()}»`,
    );
  }
  if (args.phone?.trim()) texts.push(`• A phone number, exactly: «${args.phone.trim()}»`);
  if (args.site?.trim()) texts.push(`• A website address, exactly: «${args.site.trim()}»`);

  /**
   * Перечисляем ТОЛЬКО реально заданные элементы. Если написать в промпте
   * «расположи цену, кнопку, телефон и сайт» когда кнопки нет, модель кнопку
   * дорисует — проверено 2026-09-10: три кадра из четырёх получили выдуманную
   * кнопку (пустую, со стрелкой, с курсором).
   */
  const secondaryItems = [
    args.price?.trim() ? "the price" : "",
    args.cta?.trim() ? "the button" : "",
    args.phone?.trim() ? "the phone number" : "",
    args.site?.trim() ? "the website address" : "",
  ].filter(Boolean);
  const itemsList =
    secondaryItems.length > 1
      ? `${secondaryItems.slice(0, -1).join(", ")} and ${secondaryItems[secondaryItems.length - 1]}`
      : (secondaryItems[0] ?? "");

  const exactness =
    args.phone?.trim() || args.site?.trim() || args.price?.trim()
      ? "Every digit and every latin character must be rendered EXACTLY as written above, letter for letter — a wrong phone number or website address makes the whole creative useless."
      : "";

  // Логотип кладём поверх сами: модель фирменный знак не копирует, а
  // перерисовывает по мотивам, и «почти похоже» здесь не годится.
  const logoRoom = args.logoCorner
    ? `Leave the ${args.logoCorner === "top-left" ? "top-left" : "top-right"} corner calm and free of text and detail — a real logo will be placed there afterwards. Do NOT draw a logo, emblem, monogram or brand mark anywhere in the image.`
    : "Do NOT draw any logo, emblem, monogram, brand mark or QR code.";

  const prompt = [
    base,
    `Format: ${fmt.label} (${fmt.width}×${fmt.height}).`,
    // Композиция из пула — главное, что делает креативы непохожими друг на друга
    `COMPOSITION: ${v.composition.describe}`,
    "Use the whole frame: no dead margins, no small island of content floating in empty space.",
    // Жёсткие требования формата идут ПОСЛЕ композиции и перебивают её
    fmt.constraint ? `FORMAT REQUIREMENT (overrides the composition above): ${fmt.constraint}` : "",
    args.look === "adaptive" ? ADAPTIVE_SPEC : LOOK_SPEC[args.look],
    scene,
    `DECORATION: ${v.decor.describe}`,
    "Render the following RUSSIAN text directly inside the image as designed advertising typography — integrated into the composition, not pasted on as flat stickers:",
    ...texts,
    `HEADLINE TREATMENT: ${v.typography.describe}`,
    "Letterforms keep NATURAL, optically correct proportions — never stretch, squeeze, condense or expand letters to fill space. Scale comes from font SIZE only; if a word does not fit, make it smaller or break the line.",
    "The headline must stay high-contrast and readable at a glance, including at small preview size.",
    "Correct Russian spelling is MANDATORY — no gibberish, no invented or duplicated words.",
    exactness,
    itemsList
      ? `SECONDARY ELEMENTS: ${v.contacts.describe.replace("{items}", itemsList)} They stay clearly subordinate to the headline and must not collide with the subject or with each other.`
      : "",
    // Кнопка появляется ТОЛЬКО если её заказали. Без этой строки модель
    // дорисовывала пустую кнопку со стрелкой «для красоты».
    args.cta?.trim()
      ? ""
      : "There is NO call-to-action button in this creative: do not draw any button, pill, arrow badge or clickable-looking shape.",
    logoRoom,
    "Use ONLY the Russian text listed above. Do not add any other words, and do not invent numbers, prices, percentages, sizes, ratings, guarantees or specifications of any kind.",
    "The result must look like a professional advertising creative designed by a human: cohesive, confident, and built around one subject and one message.",
  ]
    .filter(Boolean)
    .join(" ");

  const negativePrompt =
    "logo, emblem, brand mark, watermark, QR code, misspelled text, gibberish letters, " +
    "duplicated words, wrong digits, stretched letters, distorted subject, changed product colour, " +
    "extra objects, cluttered layout, text touching the frame edge, low quality, blurry";

  return {
    prompt,
    negativePrompt,
    variants: {
      composition: v.composition.id,
      typography: v.typography.id,
      decor: v.decor.id,
      contacts: v.contacts.id,
    },
  };
}
