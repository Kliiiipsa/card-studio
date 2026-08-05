/**
 * «Фото товара» scenarios. The section generates CLEAN product photos (no
 * text — that's the Инфографика section), so the vocabulary is photographic
 * tasks, not card layouts. Replaces the old 12 card types in the generator UI
 * (the domain CARD_TYPES stay — analysis/ideas still use them).
 */
export type PhotoScenarioId =
  | "studio"
  | "background-swap"
  | "lifestyle"
  | "closeup"
  | "flatlay"
  | "festive";

export interface PhotoScenario {
  id: PhotoScenarioId;
  title: string;
  description: string;
  /** English composition hint appended to the image prompt */
  promptHint: string;
  /** Russian guidance for the prompt-writing LLM */
  guidance: string;
}

export const PHOTO_SCENARIOS: PhotoScenario[] = [
  {
    id: "studio",
    title: "Студийный фон",
    description: "Чистый премиальный фон, мягкий свет",
    promptHint:
      "premium studio product shot, clean seamless background, soft realistic shadows, product perfectly lit",
    guidance: "студийная предметная съёмка: чистый фон, мягкий свет, товар — единственный герой",
  },
  {
    id: "background-swap",
    title: "Смена фона",
    description: "Тот же товар — новый фон и атмосфера",
    promptHint:
      "keep the product exactly as is, replace the background with a new fitting environment, natural light matching",
    guidance:
      "заменить фон вокруг товара на новый, подходящий категории; сам товар не менять ни в чём",
  },
  {
    id: "lifestyle",
    title: "Lifestyle-сцена",
    description: "Товар в реальной жизни и интерьере",
    promptHint:
      "lifestyle scene, product used in a realistic premium environment, natural light, aspirational mood, soft depth of field",
    guidance: "живая сцена использования товара: естественный свет, реальный интерьер, настроение",
  },
  {
    id: "closeup",
    title: "Крупный план",
    description: "Детали, фактура и качество вблизи",
    promptHint:
      "macro close-up product shot, visible material texture and craftsmanship details, shallow depth of field",
    guidance: "крупный план: фактура материала, швы, детали качества",
  },
  {
    id: "flatlay",
    title: "Раскладка (flat lay)",
    description: "Вид сверху, аккуратная композиция",
    promptHint:
      "flat lay top-down composition, product neatly arranged with a few relevant props, balanced negative space",
    guidance: "раскладка сверху: товар и несколько уместных предметов-компаньонов, много воздуха",
  },
  {
    id: "festive",
    title: "Праздничная подача",
    description: "Подарочное настроение, акции и сезоны",
    promptHint:
      "festive gift-style presentation, celebratory props and warm accents around the product, joyful premium mood",
    guidance: "праздничная подача: подарочная атмосфера, уместный декор, тёплые акценты",
  },
];

export const PHOTO_SCENARIO_MAP: Record<string, PhotoScenario> = Object.fromEntries(
  PHOTO_SCENARIOS.map((s) => [s.id, s]),
);
