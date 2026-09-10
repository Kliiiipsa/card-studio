import { getBannerFormat } from "./formats";
import type { BannerFormatId, BannerLook } from "./types";

/**
 * Промпт рекламного баннера для gpt-image (он запекает кириллицу сам).
 *
 * От промпта инфографики отличается тремя вещами:
 *  1. Это РЕКЛАМА, а не слайд карточки: сцена постановочная, энергия промо.
 *  2. Раскладка диктуется под пропорцию — иначе на широком кадре модель рисует
 *     маленький остров по центру и оставляет края пустыми (проверено).
 *  3. Внизу резервируется спокойная полоса: туда сайт положит цену, кнопку,
 *     адрес и логотип. Модель их НЕ рисует — иначе получим две кнопки.
 */

const LOOK_SPEC: Record<BannerLook, string> = {
  light:
    "Light, airy commercial look: clean bright backdrop in soft neutral or pastel tones, generous daylight, gentle gradients and soft shadows. Calm and premium, never washed out.",
  dark: "Dark premium look: deep near-black or rich dark backdrop, dramatic directional light sculpting the product, subtle glow and reflections. High contrast, expensive and confident.",
  bright:
    "Bold vivid promo look: saturated confident color backdrop with energetic contrast, crisp graphic shapes, punchy lighting. Attention-grabbing but tidy — never noisy or cluttered.",
};

/**
 * Доля кадра снизу, которую держим чистой под накладку. Совпадает с
 * BAND_SHARE в overlay.ts — если менять, менять в обоих местах.
 */
const RESERVED_BOTTOM = "bottom fifth";

export function buildBannerPrompt(args: {
  productName: string;
  headline: string;
  subheadline?: string;
  look: BannerLook;
  format: BannerFormatId;
  hasProductImage: boolean;
  /** внизу будет накладка сайта — просим оставить место */
  reserveBand: boolean;
}): { prompt: string; negativePrompt: string } {
  const fmt = getBannerFormat(args.format);
  const product = args.productName.trim() || "the product";

  const base = args.hasProductImage
    ? `Using the provided product photo, create a FINISHED advertising banner for ${product}. This is a promotional ad creative that drives a click to a website — not a marketplace product card. Keep the product photorealistic and unchanged: same shape, colour, material, finish, proportions and any branding visible on it.`
    : `Create a FINISHED advertising banner for ${product}. This is a promotional ad creative that drives a click to a website — not a marketplace product card.`;

  // Для рекламы сцена собирается заново: в отличие от инфографики, где фон
  // клиента бережём, здесь постановочный кадр и есть продукт услуги.
  const scene = args.hasProductImage
    ? "Rebuild the environment around the product into a purposeful advertising scene that suits this specific product — a believable surface, gentle depth, restrained props that support the story. Keep it photographic and dimensional; do not place the product on a flat empty backdrop, and do not default to a generic white studio with a potted plant."
    : "Build a purposeful advertising scene that suits this specific product — believable surfaces, gentle depth, restrained supporting props, photographic and dimensional.";

  // Проверено живой генерацией 2026-09-10: общей просьбы «оставь низ чистым»
  // модели мало — товар всё равно спускался в полосу. Поэтому граница названа
  // как линия, а композиция — как «всё выше неё».
  const reserved = args.reserveBand
    ? `IMPORTANT — reserved strip: the ${RESERVED_BOTTOM} of the frame is a caption zone. Compose so that the product, the headline and every meaningful detail sit ENTIRELY ABOVE that line; shift and scale the composition upward if needed. Inside the strip keep only the plain background surface — quiet, evenly lit, free of text, objects, graphics and product parts.`
    : "";

  const prompt = [
    base,
    `Format: ${fmt.label} (${fmt.width}×${fmt.height}).`,
    fmt.layout,
    LOOK_SPEC[args.look],
    scene,
    "Render the following RUSSIAN text directly inside the image as designed advertising typography — integrated into the composition, not pasted on as a flat sticker:",
    `• Headline (dominant): «${args.headline.trim()}»`,
    args.subheadline
      ? `• Second line (clearly smaller, lighter): «${args.subheadline.trim()}»`
      : "",
    "POSTER-GRADE TYPOGRAPHY: the headline is the loudest element of the banner — very large, heavy bold sans-serif, set in 2–3 size steps with the key word largest. It must stay high-contrast and readable at a glance, including at small preview size.",
    "Letterforms keep NATURAL, optically correct proportions — never stretch, squeeze, condense or expand letters to fill space. Scale comes from font SIZE only; if a word does not fit, make it smaller or break the line.",
    "Correct Russian spelling is MANDATORY — no gibberish, no invented or duplicated words.",
    reserved,
    // Главная защита от «двух кнопок»: список разрешённого текста закрыт.
    "Use ONLY the Russian text listed above. Do not add any other words, and specifically do not draw a call-to-action button, a price tag, a discount badge, a website address, a logo, a QR code or any brand mark — those are added afterwards by the layout system.",
    "Do not invent numbers, prices, percentages, sizes, ratings, guarantees or specifications of any kind.",
    "The result must look like a professional advertising creative: cohesive, confident, and clearly built around one product and one message.",
  ]
    .filter(Boolean)
    .join(" ");

  const negativePrompt =
    "call-to-action button, price tag, discount badge, website address, logo, watermark, QR code, " +
    "misspelled text, gibberish letters, duplicated words, stretched letters, distorted product, " +
    "changed product color, extra objects, cluttered layout, low quality, blurry";

  return { prompt, negativePrompt };
}
