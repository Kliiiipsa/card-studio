import { z } from "zod";

export const productInfoSchema = z.object({
  name: z.string().min(1, "Укажите название товара").max(200),
  category: z.string().max(120).default(""),
  price: z.string().max(40).optional().default(""),
  audience: z.string().max(300).default(""),
  benefits: z.array(z.string().max(200)).max(20).default([]),
  pains: z.array(z.string().max(200)).max(20).default([]),
});

export const cardScoreSchema = z.object({
  cover: z.number().min(0).max(100),
  infographics: z.number().min(0).max(100),
  text: z.number().min(0).max(100),
  composition: z.number().min(0).max(100),
  trust: z.number().min(0).max(100),
  sellingPower: z.number().min(0).max(100),
  total: z.number().min(0).max(100),
  comment: z.string().optional(),
});

export const cardIdeaSchema = z.object({
  cardType: z.string(),
  title: z.string(),
  angle: z.string(),
  headline: z.string(),
  keyPoints: z.array(z.string()).default([]),
});

export const analysisProblemSchema = z.object({
  issue: z.string(),
  severity: z.enum(["high", "medium", "low"]).default("medium"),
  fix: z.string().default(""),
});

export const textRewriteSchema = z.object({
  /** the exact text currently on the card; "" when the element is missing */
  current: z.string().default(""),
  better: z.string(),
});

export const analysisReportSchema = z.object({
  /** grounding: what the model actually sees — all advice must follow from it */
  observed: z
    .object({
      product: z.string().default(""),
      existingText: z.array(z.string()).default([]),
      composition: z.string().default(""),
    })
    .default({ product: "", existingText: [], composition: "" }),
  diagnosis: z.string(),
  mainProblem: z.string(),
  whatWorks: z.array(z.string()).default([]),
  /** prioritized, deduplicated problems, each with a concrete fix */
  problems: z.array(analysisProblemSchema).default([]),
  /** ready-to-use copy */
  headlineIdeas: z.array(z.string()).default([]),
  benefitTexts: z.array(z.string()).default([]),
  textRewrites: z.array(textRewriteSchema).default([]),
  visualTips: z.array(z.string()).default([]),
  /** readability at WB search-grid thumbnail size (~200px) */
  thumbnailTest: z
    .object({ readable: z.boolean().default(false), verdict: z.string().default("") })
    .default({ readable: false, verdict: "" }),
  /** claims risky for WB moderation (medical promises, unprovable "best" etc.) */
  riskFlags: z.array(z.string()).default([]),
  newCardIdeas: z.array(cardIdeaSchema).default([]),
  scores: cardScoreSchema,
  /** one short sentence per score axis explaining the number */
  scoreReasons: z.record(z.string()).default({}),
});

export const structuredPromptSchema = z.object({
  product: z.string(),
  marketplace: z.string(),
  cardType: z.string(),
  targetAudience: z.string(),
  mainBenefit: z.string(),
  visualStyle: z.string(),
  composition: z.string(),
  background: z.string(),
  lighting: z.string(),
  typographyArea: z.string(),
  colorPalette: z.string(),
  premiumDetails: z.string(),
  restrictions: z.string(),
  negativePrompt: z.string(),
});

/** ---------- API request schemas ---------- */

/** Loose product for analysis/scoring — every field optional, empty allowed. */
export const looseProductSchema = z
  .object({
    name: z.string().max(200),
    category: z.string().max(120),
    price: z.string().max(40),
    audience: z.string().max(300),
    benefits: z.array(z.string().max(200)).max(20),
    pains: z.array(z.string().max(200)).max(20),
  })
  .partial();

export const analyzeRequestSchema = z.object({
  imageDataUrl: z.string().min(1),
  product: looseProductSchema.optional(),
  /** what worries the seller (low CTR, no conversions…) — focuses the analysis */
  concern: z.string().max(300).optional(),
});

export const compareRequestSchema = z.object({
  /** карточка продавца */
  mineDataUrl: z.string().min(1),
  /** карточка конкурента */
  competitorDataUrl: z.string().min(1),
  product: looseProductSchema.optional(),
  /** что важно продавцу в этом сравнении */
  concern: z.string().max(300).optional(),
});

/** «Сравнение карточек»: обе оцениваются одной рубрикой + вердикт и план. */
export const comparisonReportSchema = z.object({
  /** заземление: что модель реально видит на каждой карточке */
  observed: z
    .object({ mine: z.string().default(""), competitor: z.string().default("") })
    .default({ mine: "", competitor: "" }),
  verdict: z.enum(["mine", "competitor", "tie"]),
  /** 2–3 предложения: кто выигрывает и почему, человеческим языком */
  verdictText: z.string(),
  scoreMine: cardScoreSchema,
  scoreCompetitor: cardScoreSchema,
  /** по одному короткому сравнению на ось рубрики */
  axisComments: z.record(z.string()).default({}),
  /** в чём моя карточка уже сильнее */
  advantages: z.array(z.string()).default([]),
  /** где конкурент выигрывает */
  weaknesses: z.array(z.string()).default([]),
  /** что перенять у конкурента — конкретные шаги */
  adopt: z.array(z.string()).default([]),
  /** кто заметнее в миниатюре ~200px и почему */
  thumbnailVerdict: z.string().default(""),
});

export type ComparisonReport = z.infer<typeof comparisonReportSchema>;

export const ideasRequestSchema = z.object({
  product: productInfoSchema,
});

export const improvePromptRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  cardType: z.string().optional(),
  style: z.string().optional(),
});

export const buildPromptRequestSchema = z.object({
  product: productInfoSchema,
  cardType: z.string(),
  style: z.string(),
  userPrompt: z.string().max(4000).optional().default(""),
});

export const generateTextRequestSchema = z.object({
  prompt: z.string().min(1).max(6000),
  negativePrompt: z.string().max(2000).optional().default(""),
  aspectRatio: z.string().default("3:4"),
  count: z.number().int().min(1).max(4).default(2),
  cardText: z.string().max(120).optional(),
});

export const generateImageRequestSchema = z.object({
  prompt: z.string().min(1).max(6000),
  negativePrompt: z.string().max(2000).optional().default(""),
  referenceImageDataUrl: z.string().min(1),
  strength: z.number().min(0).max(1).default(0.55),
  aspectRatio: z.string().default("3:4"),
  count: z.number().int().min(1).max(4).default(2),
  cardText: z.string().max(120).optional(),
  /** откуда запрос: "improve" — «Улучшить по советам» (советы фильтруем),
   *  "photo" — раздел «Фото товара» (промпт человека не трогаем) */
  purpose: z.enum(["photo", "improve"]).optional(),
  /** сценарий раздела «Фото товара» — сервер дописывает конкретику под него */
  scenario: z.string().max(40).optional(),
});

export const scoreRequestSchema = z.object({
  imageDataUrl: z.string().min(1),
  product: looseProductSchema.optional(),
  cardType: z.string().optional(),
});

export const writePromptRequestSchema = z.object({
  product: looseProductSchema.optional(),
  cardType: z.string().optional(),
  styleMode: z.string().optional(),
  userNote: z.string().max(1000).optional(),
  /** optional product photo (data URL) for vision-based prompt writing */
  referenceImageDataUrl: z.string().optional(),
});

export type WritePromptRequest = z.infer<typeof writePromptRequestSchema>;

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type IdeasRequest = z.infer<typeof ideasRequestSchema>;
export type ImprovePromptRequest = z.infer<typeof improvePromptRequestSchema>;
export type BuildPromptRequest = z.infer<typeof buildPromptRequestSchema>;
export type GenerateTextRequest = z.infer<typeof generateTextRequestSchema>;
export type GenerateImageRequest = z.infer<typeof generateImageRequestSchema>;
export type ScoreRequest = z.infer<typeof scoreRequestSchema>;
