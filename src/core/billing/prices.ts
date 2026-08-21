/**
 * «Искры» — внутренняя валюта студии. 1 искра = 1 ₽.
 * Pure module — safe for both client (price tags on buttons) and server.
 */
export const SPARK = "⚡";

/** every paid action in the app */
export type SparkAction =
  | "analyze"
  | "generate"
  | "infographic"
  | "video"
  | "turnkey"
  | "seo"
  | "ideas"
  | "write_prompt"
  | "improve_prompt"
  | "build_prompt"
  | "brief"
  | "autofill"
  | "extract_style";

/** price 0 = free (text-only Qwen actions cost us kopecks — user decision 2026-08-04) */
export const PRICES: Record<SparkAction, number> = {
  analyze: 5,
  generate: 7,
  infographic: 10,
  /**
   * 5-секундное видео товара из фото. Kling 2.5 Turbo Pro списывает $0.35
   * ≈ 29,4 ₽ по курсу 84 — самая тонкая маржа в прайсе. Цена 40 (решение
   * пользователя 2026-08-21 по расчёту юнит-экономики; было 38).
   */
  video: 40,
  /** «Карточка под ключ»: 7 изображений (по 7 ⚡ за успешное) + SEO-тексты (6 ⚡) */
  turnkey: 55,
  /** отдельная генерация SEO-текстов (название + описание + ключи) */
  seo: 1,
  ideas: 0,
  write_prompt: 0,
  improve_prompt: 0,
  build_prompt: 0,
  brief: 0,
  autofill: 0,
  extract_style: 0,
};

/** списание за каждое УСПЕШНОЕ изображение пакета «под ключ» */
export const TURNKEY_ITEM_PRICE = 7;
/** списание за SEO-блок пакета (7×7 + 6 = 55) */
export const TURNKEY_SEO_PRICE = 6;

export const ACTION_LABELS: Record<SparkAction, string> = {
  analyze: "Анализ карточки",
  generate: "Фото товара",
  infographic: "Инфографика",
  video: "Видео товара",
  turnkey: "Карточка под ключ (7 изображений)",
  seo: "SEO-тексты",
  ideas: "Идеи карточек",
  write_prompt: "Написание промпта",
  improve_prompt: "Улучшение промпта",
  build_prompt: "Сборка промпта",
  brief: "Бриф инфографики",
  autofill: "Заполнение по фото",
  extract_style: "Извлечение стиля",
};

/** starter balance granted once per account on signup */
export const WELCOME_SPARKS = 20;

export type TopupPackage = { id: string; sparks: number; bonus: number; priceRub: number };

export const TOPUP_PACKAGES: TopupPackage[] = [
  // Лестница бонусов 5 % → 7 % → 10 % (решение пользователя 2026-08-21).
  // Бонус — самая дорогая для нас статья: он снижает выручку с искры сильнее,
  // чем комиссия ЮKassa и налог вместе взятые, поэтому растёт умеренно.
  { id: "s200", sparks: 200, bonus: 10, priceRub: 200 },
  { id: "s500", sparks: 500, bonus: 35, priceRub: 500 },
  { id: "s1000", sparks: 1000, bonus: 100, priceRub: 1000 },
];

/**
 * Произвольная сумма: 1 ₽ = 1 искра, без бонуса (бонус — привилегия пакетов).
 * Минимум 10 ₽ = одна инфографика (решение пользователя 2026-08-18); верхняя
 * граница — здравый смысл и антифрод.
 */
export const CUSTOM_TOPUP = { id: "custom", minRub: 10, maxRub: 50_000 } as const;

/** Build a one-off "package" for an arbitrary amount (validated by the server too). */
export function customTopup(amountRub: number): TopupPackage | null {
  if (!Number.isInteger(amountRub)) return null;
  if (amountRub < CUSTOM_TOPUP.minRub || amountRub > CUSTOM_TOPUP.maxRub) return null;
  return { id: CUSTOM_TOPUP.id, sparks: amountRub, bonus: 0, priceRub: amountRub };
}
