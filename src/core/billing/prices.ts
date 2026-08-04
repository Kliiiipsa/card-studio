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
  | "ideas"
  | "write_prompt"
  | "improve_prompt"
  | "build_prompt"
  | "brief"
  | "autofill"
  | "extract_style";

export const PRICES: Record<SparkAction, number> = {
  analyze: 5,
  generate: 7,
  infographic: 10,
  ideas: 1,
  write_prompt: 1,
  improve_prompt: 1,
  build_prompt: 1,
  brief: 1,
  autofill: 1,
  extract_style: 1,
};

export const ACTION_LABELS: Record<SparkAction, string> = {
  analyze: "Анализ карточки",
  generate: "Генерация карточки",
  infographic: "Инфографика",
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
