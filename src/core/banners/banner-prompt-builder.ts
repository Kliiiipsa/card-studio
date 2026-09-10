import { getCreativeType, getFormat } from "./formats";
import type { BannerLook, CreativeTypeId } from "./types";

/**
 * Промпт креатива для gpt-image (кириллицу он печатает сам).
 *
 * Отличия от промпта инфографики:
 *  1. Это РЕКЛАМА, а не слайд карточки: постановочная сцена, энергия промо.
 *  2. Раскладка диктуется под пропорцию — иначе на широком кадре модель рисует
 *     маленький остров по центру и оставляет края пустыми (проверено).
 *  3. Весь текст, включая цену, кнопку, телефон и домен, печёт модель. Проверено
 *     на «+7 495 123-45-67» и «kartogen.ru» — выходит буква в букву, и выглядит
 *     это несравнимо лучше канвасной полосы.
 *  4. Логотип модели НЕ отдаём: она перерисует его по мотивам. Просим оставить
 *     под него чистый угол, а сам знак кладём поверх точными пикселями.
 */

const LOOK_SPEC: Record<Exclude<BannerLook, "adaptive">, string> = {
  light:
    "Light, airy commercial look: clean bright backdrop in soft neutral or pastel tones, generous daylight, gentle gradients and soft shadows. Calm and premium, never washed out.",
  dark: "Dark premium look: deep near-black or rich dark backdrop, dramatic directional light sculpting the subject, subtle glow and reflections. High contrast, expensive and confident.",
  bright:
    "Bold vivid promo look: saturated confident colour backdrop with energetic contrast, crisp graphic shapes, punchy lighting. Attention-grabbing but tidy — never noisy or cluttered.",
  premium:
    "Luxury look: deep charcoal or near-black ground with warm gold and champagne accents, thin elegant rules, soft specular highlights. Restrained, expensive, unhurried.",
  warm: "Warm human look: sand, terracotta and cream tones, soft late-afternoon light, natural textures like wood, linen and paper. Friendly and grounded.",
  tech: "Technological look: cool blue and graphite ground, glass and metal surfaces, crisp rim light and subtle glow, clean geometric accents. Precise and modern.",
};

/**
 * «Адаптивный стиль»: оформление не задано, модель выбирает его сама под
 * предмет рекламы. Тот же приём, что с адаптивными сценами в инфографике —
 * решение принимает модель, но рамки задаём мы, иначе получим случайность.
 */
const ADAPTIVE_SPEC =
  "ART DIRECTION IS YOURS: choose the palette, the lighting and the backdrop that genuinely fit THIS subject and its audience — a dental clinic, a tractor rental and a perfume each deserve a different world. " +
  "Commit to ONE clear idea rather than hedging: pick a dominant colour, one accent that fights it, and stick to them across the frame. " +
  "Decide deliberately whether to keep the photo's own environment or rebuild it, and say it with the light: real direction, real shadows, real depth. " +
  "Avoid the safe default of a grey studio backdrop unless the subject truly calls for one.";

/** Общая для всех типов спецификация подачи текста — то, ради чего всё затевалось. */
const TYPOGRAPHY_SPEC = [
  "POSTER-GRADE TYPOGRAPHY: the headline is the loudest element — very large, heavy bold sans-serif, set in 2–3 size steps with the key word largest. Give ONE word of the headline an accent colour or a different weight so the eye lands on it first.",
  "Letterforms keep NATURAL, optically correct proportions — never stretch, squeeze, condense or expand letters to fill space. Scale comes from font SIZE only; if a word does not fit, make it smaller or break the line.",
  "Correct Russian spelling is MANDATORY — no gibberish, no invented or duplicated words.",
].join(" ");

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
  /** сверху ляжет настоящий логотип — просим оставить угол чистым */
  logoCorner?: "top-left" | "top-right";
};

export function buildBannerPrompt(args: BannerPromptArgs): {
  prompt: string;
  negativePrompt: string;
} {
  const type = getCreativeType(args.creativeType);
  const fmt = getFormat(args.creativeType, args.format);
  const subject = args.subject.trim() || "the subject";

  const base = args.hasProductImage
    ? `Using the provided photo, create a FINISHED ${type.intent} for ${subject}. Keep the photographed subject photorealistic and unchanged: same shape, colour, material, finish, proportions and any branding visible on it.`
    : `Create a FINISHED ${type.intent} for ${subject}.`;

  // Для рекламы сцена собирается заново — в отличие от инфографики, где фон
  // клиента бережём: постановочный кадр здесь и есть продукт услуги.
  const scene = args.hasProductImage
    ? "Rebuild the environment around the subject into a purposeful advertising scene that suits it — a believable surface, gentle depth, restrained props that support the story. Keep it photographic and dimensional; do not place the subject on a flat empty backdrop, and do not default to a generic white studio with a potted plant."
    : "Build a purposeful advertising scene that suits this specific subject — believable surfaces, gentle depth, restrained supporting props, photographic and dimensional.";

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
  if (args.phone?.trim()) {
    texts.push(`• A phone number, exactly: «${args.phone.trim()}»`);
  }
  if (args.site?.trim()) {
    texts.push(`• A website address, exactly: «${args.site.trim()}»`);
  }

  const exactness =
    args.phone?.trim() || args.site?.trim() || args.price?.trim()
      ? "Every digit and every latin character must be rendered EXACTLY as written above, letter for letter — a wrong phone number or a wrong website address makes the whole creative useless."
      : "";

  // Логотип кладём поверх сами: модель фирменный знак не копирует, а
  // перерисовывает по мотивам, и «почти похоже» здесь не годится.
  const logoRoom = args.logoCorner
    ? `Leave the ${args.logoCorner === "top-left" ? "top-left" : "top-right"} corner calm and free of text and detail — a real logo will be placed there afterwards. Do NOT draw a logo, emblem, monogram or brand mark anywhere in the image.`
    : "Do NOT draw any logo, emblem, monogram, brand mark or QR code.";

  const prompt = [
    base,
    `Format: ${fmt.label} (${fmt.width}×${fmt.height}).`,
    fmt.layout,
    args.look === "adaptive" ? ADAPTIVE_SPEC : LOOK_SPEC[args.look],
    scene,
    "Render the following RUSSIAN text directly inside the image as designed advertising typography — integrated into the composition, not pasted on as flat stickers:",
    ...texts,
    TYPOGRAPHY_SPEC,
    exactness,
    "Arrange the secondary elements — price, button, phone, website — as a deliberate, tidy group with consistent alignment, clearly subordinate to the headline. They must not collide with the subject or with each other.",
    logoRoom,
    "Use ONLY the Russian text listed above. Do not add any other words, and do not invent numbers, prices, percentages, sizes, ratings, guarantees or specifications of any kind.",
    "The result must look like a professional advertising creative: cohesive, confident, and built around one subject and one message.",
  ]
    .filter(Boolean)
    .join(" ");

  const negativePrompt =
    "logo, emblem, brand mark, watermark, QR code, misspelled text, gibberish letters, " +
    "duplicated words, wrong digits, stretched letters, distorted subject, changed product colour, " +
    "extra objects, cluttered layout, text touching the frame edge, low quality, blurry";

  return { prompt, negativePrompt };
}
