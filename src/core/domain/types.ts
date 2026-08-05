import type { CardTypeId } from "./card-types";
import type { StyleId } from "./styles";
import type { AspectRatioId } from "./export-presets";

export interface ProductInfo {
  name: string;
  category: string;
  price?: string;
  audience: string;
  benefits: string[];
  pains: string[];
}

export const EMPTY_PRODUCT: ProductInfo = {
  name: "",
  category: "",
  price: "",
  audience: "",
  benefits: [],
  pains: [],
};

/** A reference / uploaded image stored as a data URL for the MVP. */
export interface StoredImage {
  id: string;
  dataUrl: string;
  width?: number;
  height?: number;
  createdAt: number;
}

export interface GenerationParams {
  /** card type id or photo scenario id (generator switched to scenarios) */
  cardType: CardTypeId | string;
  style: StyleId;
  aspectRatio: AspectRatioId;
  userPrompt: string;
  negativePrompt: string;
  /** structured prompt actually sent to the image model */
  finalPrompt?: string;
  /** image-to-image strength (0..1) — lower = product preserved more strongly */
  referenceStrength?: number;
  referenceImageId?: string;
}

export interface Generation {
  id: string;
  projectId: string;
  mode: "text-to-image" | "image-to-image";
  params: GenerationParams;
  images: StoredImage[];
  score?: CardScore;
  createdAt: number;
}

export interface Project {
  id: string;
  title: string;
  product: ProductInfo;
  uploads: StoredImage[];
  preferredStyle?: StyleId;
  createdAt: number;
  updatedAt: number;
}

/** ---- AI result shapes (mirrored by Zod schemas in core/ai/schemas.ts) ---- */

export interface CardIdea {
  cardType: CardTypeId | string;
  title: string;
  angle: string;
  headline: string;
  keyPoints: string[];
}

export interface CardScore {
  cover: number;
  infographics: number;
  text: number;
  composition: number;
  trust: number;
  sellingPower: number;
  total: number;
  comment?: string;
}

export interface AnalysisProblem {
  issue: string;
  severity: "high" | "medium" | "low";
  fix: string;
}

export interface TextRewrite {
  /** the exact text currently on the card; "" when the element is missing */
  current: string;
  better: string;
}

export interface AnalysisReport {
  /** grounding: what the model actually sees on the card */
  observed: { product: string; existingText: string[]; composition: string };
  diagnosis: string;
  mainProblem: string;
  whatWorks: string[];
  /** prioritized, deduplicated problems, each with a concrete fix */
  problems: AnalysisProblem[];
  /** ready-to-use copy */
  headlineIdeas: string[];
  benefitTexts: string[];
  textRewrites: TextRewrite[];
  visualTips: string[];
  thumbnailTest: { readable: boolean; verdict: string };
  riskFlags: string[];
  newCardIdeas: CardIdea[];
  scores: CardScore;
  /** one short sentence per score axis explaining the number */
  scoreReasons: Record<string, string>;
}

export interface StructuredImagePrompt {
  product: string;
  marketplace: string;
  cardType: string;
  targetAudience: string;
  mainBenefit: string;
  visualStyle: string;
  composition: string;
  background: string;
  lighting: string;
  typographyArea: string;
  colorPalette: string;
  premiumDetails: string;
  restrictions: string;
  negativePrompt: string;
  /** flattened single-string prompt ready for the image model */
  rendered: string;
}
