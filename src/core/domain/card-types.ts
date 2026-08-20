export type CardTypeId =
  | "cover"
  | "benefits"
  | "composition"
  | "size-chart"
  | "lifestyle"
  | "before-after"
  | "gift"
  | "premium"
  | "pain-solution"
  | "comparison"
  | "trust"
  | "bundle";

export interface CardType {
  id: CardTypeId;
  title: string;
  description: string;
  /** short hint that feeds the structured image prompt */
  promptHint: string;
}

export const CARD_TYPES: CardType[] = [
  {
    id: "cover",
    title: "Главная обложка",
    description: "Первая карточка, которая ловит взгляд в выдаче маркетплейса",
    promptHint:
      "premium cover image, product large and centered, clear empty zone for a short headline, instantly readable value",
  },
  {
    id: "benefits",
    title: "Преимущества товара",
    description: "Инфографика с 3–5 ключевыми выгодами",
    promptHint:
      "benefits infographic layout, 3-5 icon+text blocks, product as anchor, clean grid, readable typography zones",
  },
  {
    id: "composition",
    title: "Состав / материалы",
    description: "Из чего сделан товар, материалы и качество",
    promptHint:
      "material and composition card, close-up texture details, callouts pointing to materials, trustworthy editorial look",
  },
  {
    id: "size-chart",
    title: "Размерная сетка",
    description: "Понятная таблица размеров",
    promptHint:
      "size chart card, clean measurement table area, neutral background, product or silhouette reference, high legibility",
  },
  {
    id: "lifestyle",
    title: "Lifestyle",
    description: "Товар в реальной жизни и контексте использования",
    promptHint:
      "lifestyle scene, product used in a realistic premium environment, natural light, aspirational mood, soft depth of field",
  },
  {
    id: "before-after",
    title: "До / после",
    description: "Эффект от использования товара",
    promptHint:
      "before/after split layout, clear visual contrast between the two states, honest and clean, central divider",
  },
  {
    id: "gift",
    title: "Подарочный вариант",
    description: "Товар как подарок, упаковка, эмоция",
    promptHint:
      "gift presentation, elegant packaging, festive yet premium mood, ribbon/box accents, warm inviting palette",
  },
  {
    id: "premium",
    title: "Премиум-карточка",
    description: "Максимально дорогой визуал товара",
    promptHint:
      "ultra premium catalog visual, expensive minimalism, dramatic studio light, refined palette, high-end brand feel",
  },
  {
    id: "pain-solution",
    title: "Боль клиента → решение",
    description: "Проблема покупателя и как товар её решает",
    promptHint:
      "problem-to-solution narrative card, two-zone composition, the product positioned as the clear solution",
  },
  {
    id: "comparison",
    title: "Сравнение с обычным товаром",
    description: "Чем товар лучше дешёвых аналогов",
    promptHint:
      "comparison card, our product vs generic alternative, clear visual hierarchy favouring our product, tidy layout",
  },
  {
    id: "trust",
    title: "Доверие / гарантия",
    description: "Сертификаты, гарантия, отзывы",
    promptHint:
      "trust and guarantee card, badges/certificates area, calm reassuring palette, credible and clean composition",
  },
  {
    id: "bundle",
    title: "Комплектация",
    description: "Что входит в комплект",
    promptHint:
      "bundle/what's-in-the-box layout, all items neatly arranged, knolling style, balanced negative space for labels",
  },
];

export const CARD_TYPE_MAP: Record<CardTypeId, CardType> = Object.fromEntries(
  CARD_TYPES.map((c) => [c.id, c]),
) as Record<CardTypeId, CardType>;
