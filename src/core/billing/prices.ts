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
  | "turnkey"
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
  /** «Карточка под ключ»: 7 изображений (по 7 ⚡ за успешное) + SEO-тексты (6 ⚡) */
  turnkey: 55,
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
  turnkey: "Карточка под ключ (7 изображений)",
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
  { id: "s100", sparks: 100, bonus: 0, priceRub: 100 },
  { id: "s500", sparks: 500, bonus: 25, priceRub: 500 },
  { id: "s1000", sparks: 1000, bonus: 100, priceRub: 1000 },
];
