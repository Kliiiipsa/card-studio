import { z } from "zod";

export const autofillSchema = z.object({
  imageDataUrl: z.string().min(1),
  productName: z.string().max(200).optional(),
  category: z.string().max(120).optional(),
});

export const infographicInputSchema = z.object({
  productName: z.string().min(1, "Укажите название товара").max(200),
  category: z.string().max(120).optional(),
  targetAudience: z.string().max(300).optional(),
  benefits: z.array(z.string().max(200)).max(12).default([]),
  painPoints: z.array(z.string().max(200)).max(12).optional(),
  userNote: z.string().max(1000).optional(),
  referenceImage: z.string().optional(),
  type: z
    .enum(["benefits", "materials", "sizes", "why_buy", "comparison", "package", "trust"])
    .default("benefits"),
  style: z.enum(["auto", "minimal", "premium", "bright", "soft", "dark"]).default("auto"),
  marketplace: z.literal("wildberries").default("wildberries"),
  aspectRatio: z.enum(["3:4", "4:5"]).default("3:4"),
});

export const styleProfileSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    source: z.enum(["library", "reference"]),
    visualLanguage: z.string(),
    background: z.string(),
    lighting: z.string(),
    mode: z.enum(["light", "dark"]),
    palette: z.object({
      background: z.string(),
      surface: z.string(),
      textPrimary: z.string(),
      textSecondary: z.string(),
      accent: z.string(),
    }),
    cardStyle: z.enum(["integrated-soft", "premium-editorial", "marketplace-clean"]),
    density: z.enum(["low", "medium", "high"]),
    radius: z.number(),
    headlinePosition: z.enum(["top", "bottom"]),
    accentElements: z.array(z.string()).default([]),
  })
  .passthrough();

export const briefRequestSchema = infographicInputSchema.extend({
  styleProfile: styleProfileSchema.optional(),
});

export const extractStyleSchema = z.object({
  referenceImageDataUrl: z.string().min(1),
});

const overlayPlanSchema = z.object({
  width: z.number(),
  height: z.number(),
  elements: z.array(z.record(z.any())),
});

/* --------------------------- dynamic layout plan --------------------------- */

const boxZ = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
const pointZ = z.object({ x: z.number(), y: z.number() });
const alignZ = z.enum(["left", "center", "right"]);

const textBlockZ = z.object({
  box: boxZ,
  align: alignZ.default("left"),
  fontScale: z.number().default(0.05),
  maxLines: z.number().int().default(2),
  plate: z.boolean().default(false),
});

const benefitZ = z.object({
  index: z.number().int(),
  box: boxZ,
  align: alignZ.default("left"),
  fontScale: z.number().default(0.028),
  plate: z.boolean().default(true),
  icon: z.boolean().default(true),
});

const calloutZ = z.object({
  index: z.number().int().default(0),
  anchor: pointZ,
  label: boxZ,
  bend: pointZ.optional(),
  align: alignZ.default("left"),
  fontScale: z.number().default(0.024),
});

export const layoutPlanSchema = z
  .object({
    version: z.literal(1).default(1),
    mode: z.enum(["light", "dark"]).default("light"),
    product: boxZ.default({ x: 0.18, y: 0.18, w: 0.64, h: 0.62 }),
    freeZones: z.array(boxZ).default([]),
    safeMargins: z
      .object({ top: z.number(), bottom: z.number(), left: z.number(), right: z.number() })
      .default({ top: 0.04, bottom: 0.04, left: 0.05, right: 0.05 }),
    headline: textBlockZ.extend({
      side: z.enum(["top", "bottom", "left", "right", "center"]).default("top"),
    }),
    subheadline: textBlockZ.optional(),
    benefits: z.array(benefitZ).default([]),
    callouts: z.array(calloutZ).default([]),
    source: z.enum(["vision", "fallback"]).default("vision"),
    notes: z.string().optional(),
  })
  .passthrough();

export const infographicBriefSchema = z.object({
  id: z.string(),
  type: z.string(),
  style: z.string(),
  headline: z.string(),
  subheadline: z.string().optional(),
  blocks: z.array(z.record(z.any())),
  layout: z.string(),
  palette: z.array(z.string()),
  backgroundPrompt: z.string(),
  imagePrompt: z.string().min(1),
  negativePrompt: z.string(),
  overlayPlan: overlayPlanSchema,
  layoutPlan: layoutPlanSchema.optional(),
  warnings: z.array(z.string()).default([]),
});

export const infographicGenerateSchema = z.object({
  brief: infographicBriefSchema,
  /** user's product photo */
  productImage: z.string().optional(),
  /** style reference image (drives the look) */
  styleReferenceImage: z.string().optional(),
  productName: z.string().max(200).optional(),
  aspectRatio: z.enum(["3:4", "4:5"]).optional(),
  /** skip the async gpt-image job and render a clean Flux base synchronously —
   *  the client sets this after a queued job fails (e.g. content moderation). */
  forceFallback: z.boolean().optional(),
});

/** Handle to an in-flight fal queue job, echoed back to /generate/status. */
export const imageJobHandleSchema = z.object({
  provider: z.string(),
  statusUrl: z.string().url(),
  responseUrl: z.string().url(),
});

export const infographicStatusSchema = z.object({
  job: imageJobHandleSchema,
});
