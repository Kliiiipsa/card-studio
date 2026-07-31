import type { InfographicInput, InfographicStyle, InfographicType, StyleProfile } from "./types";
import { STYLE_PRESETS, LAYOUT_BY_TYPE, resolveStyle } from "./layout-presets";
import { placementOf, type LayoutPlan, type NormBox } from "./layout-plan";

/** Describe the planned product side + clean text zones, in plain words for Flux. */
function describeZones(plan: LayoutPlan): string {
  const pct = (n: number) => Math.round(n * 100);
  const zone = (z: NormBox) => `x ${pct(z.x)}–${pct(z.x + z.w)}%, y ${pct(z.y)}–${pct(z.y + z.h)}%`;
  const product = `keep the product in the ${placementOf(plan.product)} area (${zone(plan.product)})`;
  const clean = plan.freeZones.length
    ? `keep these regions clean and empty for later text overlay: ${plan.freeZones
        .map(zone)
        .join("; ")}`
    : "leave generous empty space for future text overlay";
  return `${product}; ${clean}`;
}

/**
 * Image models cannot render Cyrillic reliably (they produce gibberish
 * pseudo-text), so the model generates ONLY a clean visual base — no text,
 * logos, badges or icons. The real text (title, benefits, callouts) is added
 * afterwards as a proper-font canvas overlay.
 */
const NEGATIVE =
  "text, letters, words, typography, logo, watermark, badge, label, icon, infographic, " +
  "misspelled text, distorted product, changed color, changed shape, extra objects, " +
  "low quality, blurry";

/**
 * Build the English image prompt for a CLEAN visual base. When a `styleProfile`
 * is provided (reference-based), its visual language / background / lighting
 * drive the look — but the PRODUCT stays the user's, and NO text/logo from the
 * reference is reproduced. Empty space is reserved for the text overlay.
 */
export function buildInfographicImagePrompt(
  input: InfographicInput,
  resolvedStyle: Exclude<InfographicStyle, "auto">,
  styleProfile?: StyleProfile,
  layoutPlan?: LayoutPlan,
): { imagePrompt: string; negativePrompt: string; backgroundPrompt: string } {
  const sp = STYLE_PRESETS[resolvedStyle];
  const layout = LAYOUT_BY_TYPE[input.type];
  const hasRef = !!input.referenceImage;

  // Composition comes from the per-photo layout plan when available, so Flux
  // leaves space exactly where the renderer will place text — instead of a
  // single static hint that produced the same look for every product.
  const composition = layoutPlan ? describeZones(layoutPlan) : layout.compositionHint;

  const visual = styleProfile?.visualLanguage ?? sp.visual;
  const background = styleProfile?.background ?? sp.background;
  const lighting = styleProfile?.lighting ?? sp.lighting;

  const base = hasRef
    ? "Create a clean premium marketplace product visual of the USER'S product based on the reference product photo. " +
      "Keep the user's product shape, color, material and proportions unchanged."
    : "Create a clean premium marketplace product visual of the described product.";

  // rich, explicit style signal so the base matches the reference look
  const styleDetails = styleProfile
    ? [
        `palette: ${Object.values(styleProfile.palette).join(", ")}`,
        `mood: ${styleProfile.mode} background`,
        styleProfile.accentElements.length
          ? `accent elements: ${styleProfile.accentElements.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("; ")
    : "";

  const imagePrompt = [
    base,
    styleProfile ? `Apply this visual STYLE only (not another product): ${visual}` : visual,
    background,
    `lighting: ${lighting}`,
    styleDetails ? `style details — ${styleDetails}` : "",
    `composition: ${composition}`,
    "leave generous empty space for future text overlay",
    "Do not render any text, letters, numbers, logos, badges, icons, labels, callouts or infographic elements.",
    "Do not copy any product, text or logo from the reference — only its style.",
    "marketplace product photography, high quality, sharp, realistic, undistorted product",
  ]
    .filter(Boolean)
    .join(". ");

  return { imagePrompt, negativePrompt: NEGATIVE, backgroundPrompt: background };
}

/* --------------------- baked-card (gpt-image) prompt --------------------- */

/** How each infographic TYPE presents its blocks inside the baked card. */
const TYPE_BAKED_SPEC: Record<
  InfographicType,
  { intent: string; blocks: (n: number, list: string) => string }
> = {
  benefits: {
    intent: "sell the product's key benefits at a glance",
    blocks: (n, list) => `${n} short benefit captions, each with a small minimalist line icon: ${list}`,
  },
  why_buy: {
    intent: "convince the shopper to buy — confident promo energy without clutter",
    blocks: (n, list) =>
      `${n} bold selling arguments with strong visual hierarchy — make the most important one noticeably larger or accent-colored: ${list}`,
  },
  materials: {
    intent: "communicate material quality and composition",
    blocks: (n, list) =>
      `${n} material/composition callouts, each connected to the relevant part of the product with a thin elegant pointer line: ${list}. If it fits naturally, add one subtle close-up texture detail`,
  },
  sizes: {
    intent: "help the buyer pick the right size quickly",
    blocks: (n, list) =>
      `a compact size/measurement panel: ${n} neatly aligned rows with thin dividers listing: ${list}. If natural for the product, add subtle measurement arrows along the product silhouette`,
  },
  comparison: {
    intent: "show why this product wins",
    blocks: (n, list) => `${n} short comparison points with small check icons: ${list}`,
  },
  package: {
    intent: "show what's included",
    blocks: (n, list) => `${n} included-item captions with small line icons: ${list}`,
  },
  trust: {
    intent: "reassure the buyer (quality, guarantee)",
    blocks: (n, list) => `${n} short trust badges with small line icons: ${list}`,
  },
};

const CARD_STYLE_WORDS: Record<NonNullable<StyleProfile["cardStyle"]>, string> = {
  "marketplace-clean": "captions sit on clean softly-rounded cards",
  "premium-editorial": "editorial typography with thin separator lines — no heavy card shapes",
  "integrated-soft": "captions blend softly into the scene without hard card shapes",
};

const DENSITY_WORDS: Record<StyleProfile["density"], string> = {
  low: "very airy composition, generous negative space, few large elements",
  medium: "balanced spacing and comfortable breathing room",
  high: "information-rich but tidy, compact spacing",
};

/** Verbalize the chosen style for the baked prompt. */
function describeBakedStyle(
  style: Exclude<InfographicStyle, "auto">,
  styleProfile: StyleProfile | undefined,
  restyleScene: boolean,
): string {
  if (!styleProfile) {
    const sp = STYLE_PRESETS[style];
    return [
      `Visual style: ${sp.visual}`,
      `Background: ${sp.background}`,
      `Lighting: ${sp.lighting}`,
      `Accent color: ${sp.palette[0]}`,
      restyleScene
        ? "Restyle the scene to match this style: replace the photo's original background and lighting; keep only the product/person unchanged."
        : "",
    ]
      .filter(Boolean)
      .join(". ");
  }
  const p = styleProfile.palette;
  return [
    `Visual style: ${styleProfile.visualLanguage}`,
    `Background: ${styleProfile.background}`,
    `Lighting: ${styleProfile.lighting}`,
    `Color palette — background ${p.background}, panels ${p.surface}, primary text ${p.textPrimary}, secondary text ${p.textSecondary}, accent ${p.accent}`,
    CARD_STYLE_WORDS[styleProfile.cardStyle],
    DENSITY_WORDS[styleProfile.density],
    styleProfile.accentElements.length
      ? `Signature details: ${styleProfile.accentElements.join(", ")}`
      : "",
    `Overall ${styleProfile.mode} tonality`,
    restyleScene
      ? "Restyle the scene to match this style: replace the photo's original background and lighting; keep only the product/person unchanged."
      : "",
  ]
    .filter(Boolean)
    .join(". ");
}

/** Union of boxes → where the caption group should live. */
function unionBox(boxes: NormBox[]): NormBox | null {
  if (!boxes.length) return null;
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Turn the per-photo vision plan into designer language for gpt-image, so the
 * composition adapts to each photo instead of repeating one static template.
 */
function describeBakedComposition(plan: LayoutPlan | undefined, type: InfographicType): string {
  if (!plan) return `Composition: ${LAYOUT_BY_TYPE[type].compositionHint}.`;
  const parts = [
    `the product occupies the ${placementOf(plan.product)} of the frame`,
    `place the headline at the ${plan.headline.side}, ${plan.headline.align}-aligned`,
  ];
  const captionsZone = unionBox(plan.benefits.map((b) => b.box));
  if (captionsZone) {
    parts.push(
      `arrange the caption group in the ${placementOf(captionsZone)} area, clear of the product`,
    );
  }
  return `Composition, adapted to THIS photo — ${parts.join("; ")}.`;
}

/**
 * Prompt for a FINISHED card with the Russian text BAKED IN by the model
 * (gpt-image renders Cyrillic natively). Used instead of the clean-base prompt
 * when the image provider can render text, so the typography is part of the
 * composition — not a flat canvas overlay. No canvas text is drawn afterwards.
 */
export function buildBakedCardPrompt(args: {
  productName: string;
  headline: string;
  subheadline?: string;
  benefits: string[];
  type: InfographicType;
  style: Exclude<InfographicStyle, "auto">;
  styleProfile?: StyleProfile;
  layoutPlan?: LayoutPlan;
  hasProductImage: boolean;
}): string {
  const { productName, headline, subheadline, benefits, type, style, styleProfile, layoutPlan } =
    args;
  const product = productName.trim() || "the product";
  const spec = TYPE_BAKED_SPEC[type];

  const base = args.hasProductImage
    ? `Using the provided product photo, create a FINISHED Wildberries marketplace infographic card for ${product}. Keep the product/person photorealistic — same identity, clothing, materials, colors and proportions.`
    : `Create a FINISHED Wildberries marketplace infographic card for ${product}.`;

  const benefitsList = benefits
    .map((b) => `«${b.trim()}»`)
    .filter((b) => b.length > 2)
    .join(", ");

  return [
    base,
    `Card purpose: ${spec.intent}.`,
    "Portrait 3:4 composition, product as the hero with tasteful clean space for text.",
    describeBakedStyle(style, styleProfile, args.hasProductImage) + ".",
    describeBakedComposition(layoutPlan, type),
    "Render the following RUSSIAN text directly inside the image as polished, modern marketplace typography — integrated into the layout, NOT as flat stickers, plastic pills or pasted badges:",
    `• Headline (large, bold): «${headline.trim()}»`,
    subheadline ? `• Subheadline (smaller, lighter): «${subheadline.trim()}»` : "",
    benefitsList ? `• ${spec.blocks(benefits.length, benefitsList)}` : "",
    "Typography rules: correct Russian spelling is MANDATORY — no gibberish, no invented or duplicated words, high legibility, elegant visual hierarchy and consistent alignment.",
    "Use ONLY the texts provided above — do not add any other words, numbers, percentages, sizes or invented specifications (no made-up fabric composition, no fake ratings).",
    "Do not cover the face or key product details with text. No watermark, no fake brand logos, no Wildberries logo.",
    "The result must look like a high-end, cohesive marketplace card — text feels designed into the scene, not pasted on top.",
  ]
    .filter(Boolean)
    .join(" ");
}

export { resolveStyle };
