import type { RenderElement } from "@/core/rendering/types";
import type { LayoutPlan } from "./layout-plan";

export type InfographicType =
  | "benefits"
  | "materials"
  | "sizes"
  | "why_buy"
  | "comparison"
  | "package"
  | "trust";

export type InfographicStyle = "auto" | "minimal" | "premium" | "bright" | "soft" | "dark";

export type InfographicInput = {
  productName: string;
  category?: string;
  targetAudience?: string;
  benefits: string[];
  painPoints?: string[];
  userNote?: string;
  referenceImage?: string;
  type: InfographicType;
  style: InfographicStyle;
  marketplace: "wildberries";
  aspectRatio: "3:4" | "4:5";
};

export type InfographicBlock = {
  id: string;
  title: string;
  text?: string;
  iconHint?: string;
  priority: "primary" | "secondary";
};

export type InfographicLayout =
  | "product_center_blocks_around"
  | "product_left_blocks_right"
  | "product_right_blocks_left"
  | "product_top_blocks_bottom"
  | "clean_cover_with_benefits";

export type InfographicOverlayPlan = {
  width: number;
  height: number;
  elements: RenderElement[];
};

export type InfographicBrief = {
  id: string;
  type: InfographicType;
  style: InfographicStyle;
  headline: string;
  subheadline?: string;
  blocks: InfographicBlock[];
  layout: InfographicLayout;
  palette: string[];
  backgroundPrompt: string;
  imagePrompt: string;
  negativePrompt: string;
  overlayPlan: InfographicOverlayPlan;
  /** per-photo dynamic layout (vision-derived or deterministic fallback) */
  layoutPlan?: LayoutPlan;
  /** style transferred from a reference (library preset or uploaded reference) */
  styleProfile?: StyleProfile;
  warnings: string[];
};

/* ------------------------- Reference style transfer ------------------------ */

export type CardStyleKind = "integrated-soft" | "premium-editorial" | "marketplace-clean";

/**
 * The visual "style" extracted from a reference infographic. It defines HOW the
 * card looks (palette, cards, layout, rhythm) — never the reference's product,
 * text or logo. Applied to the user's own product to create an original card.
 */
export type StyleProfile = {
  id: string;
  name: string;
  source: "library" | "reference";
  /** English descriptors fed into the image prompt for the clean base */
  visualLanguage: string;
  background: string;
  lighting: string;
  /** base background brightness of the reference */
  mode: "light" | "dark";
  palette: {
    background: string;
    surface: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
  };
  cardStyle: CardStyleKind;
  density: "low" | "medium" | "high";
  /** card corner radius at the 900px reference width */
  radius: number;
  headlinePosition: "top" | "bottom";
  accentElements: string[];
  /** English description of the reference's headline treatment (scale, weight,
   *  case, color, effects) — extracted from uploaded references only */
  typography?: string;
};

/** Result of /autofill — AI suggestions from the product photo. */
export type AutofillResult = {
  detectedProduct: string;
  suggestedCategory: string;
  suggestedBenefits: string[];
  suggestedPainPoints: string[];
  warnings: string[];
};

/** What /generate returns; the client composes the final card on canvas. */
export type InfographicGenerateResult = {
  baseImageUrl: string;
  overlayPlan: InfographicOverlayPlan;
  brief: InfographicBrief;
  /** true when the model already rendered the text into the base (gpt-image) —
   *  the canvas overlay is then skipped so we don't double the text. */
  textBaked: boolean;
};

export const INFOGRAPHIC_TYPES: {
  id: InfographicType;
  label: string;
  enabled: boolean;
}[] = [
  { id: "benefits", label: "Преимущества товара", enabled: true },
  { id: "materials", label: "Состав / материалы", enabled: true },
  { id: "sizes", label: "Размеры", enabled: true },
  { id: "why_buy", label: "Почему стоит купить", enabled: true },
  { id: "comparison", label: "Сравнение", enabled: false },
  { id: "package", label: "Комплектация", enabled: false },
  { id: "trust", label: "Доверие / гарантия", enabled: false },
];

export const INFOGRAPHIC_STYLES: { id: InfographicStyle; label: string }[] = [
  { id: "auto", label: "Авто" },
  { id: "minimal", label: "Минималистичный" },
  { id: "premium", label: "Премиальный" },
  { id: "bright", label: "Яркий" },
  { id: "soft", label: "Нежный" },
  { id: "dark", label: "Тёмный" },
];
