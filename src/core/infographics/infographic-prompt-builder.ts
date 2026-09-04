import type { InfographicInput, InfographicStyle, InfographicType, StyleProfile } from "./types";
import { STYLE_PRESETS, LAYOUT_BY_TYPE, resolveStyle } from "./layout-presets";
import { placementOf, type LayoutPlan, type NormBox } from "./layout-plan";
import { hashSeed, pickCompositionVariant, type ProductSide } from "./composition-variants";

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
  // restyle — модель пересобирает фон под стиль; keep — фон берётся из фото
  // пользователя, стиль применяется ТОЛЬКО к графике; asis — генерация с нуля
  // (фото нет), фон описывается стилем
  scene: "restyle" | "keep" | "asis",
): string {
  if (scene === "keep") {
    // «Сохранять фон» (решение пользователя 2026-08-26): фон/сцена/свет — из
    // фото; стиль влияет лишь на плашки, заголовок и акценты, не на окружение.
    const accent = styleProfile?.palette.accent ?? STYLE_PRESETS[style].palette[0];
    const parts = [
      "The style below applies ONLY to the graphic layer (headline, benefit plates, accent shapes) — NOT to the photo, its background, scene or lighting",
      `Accent color ${accent}`,
    ];
    if (styleProfile) {
      parts.push(`panels ${styleProfile.palette.surface}`, CARD_STYLE_WORDS[styleProfile.cardStyle]);
    }
    return parts.filter(Boolean).join(". ");
  }
  const restyleScene = scene === "restyle";
  if (!styleProfile) {
    const sp = STYLE_PRESETS[style];
    return [
      `Visual style: ${sp.visual}`,
      `Background: ${sp.background}`,
      `Lighting: ${sp.lighting}`,
      `Accent color: ${sp.palette[0]}`,
      restyleScene
        ? "Rebuild the background and lighting to match this style, but keep the scene photographic and dimensional — subtle depth, soft shadows, believable environment, never a flat empty backdrop. Keep the product/person unchanged."
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

/** Which side of the frame the product occupies, from the vision plan. */
function productSideOf(plan: LayoutPlan | undefined): ProductSide {
  if (!plan) return "center";
  const place = placementOf(plan.product);
  if (place.includes("left")) return "left";
  if (place.includes("right")) return "right";
  return "center";
}

/**
 * Composition = a named archetype from the variant pool (deterministic per
 * product, advanced by the regenerate seed) + the photo-specific product
 * placement from the vision plan. This is what keeps different products —
 * and successive regenerations — from repeating one static template.
 */
function describeBakedComposition(args: {
  plan: LayoutPlan | undefined;
  type: InfographicType;
  benefitCount: number;
  productName: string;
  variantSeed: number;
}): string {
  const side = productSideOf(args.plan);
  const variant = pickCompositionVariant({
    seed: hashSeed(args.productName) + args.variantSeed,
    type: args.type,
    productSide: side,
  });
  const photoHint = args.plan
    ? ` In the source photo the product sits at the ${placementOf(args.plan.product)} — place text in the free space around it.`
    : "";
  return `Composition: ${variant.describe(Math.max(args.benefitCount, 1))}${photoHint}`;
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
  /** advanced on each regenerate so the next base tries another composition */
  variantSeed?: number;
  /** a user-uploaded style reference image is attached to this request */
  hasStyleReference?: boolean;
  /** сохранять фон загруженного фото (стиль — только на графику); по умолч. да */
  keepBackground?: boolean;
  /** who supplied the style reference: user upload vs auto-attached library exemplar */
  refKind?: "user" | "library";
  /** превью адаптивных сцен (админ/env): кнопка фона работает со стилями, сцена — под товар */
  adaptive?: boolean;
}): string {
  const { productName, headline, subheadline, benefits, type, style, styleProfile, layoutPlan } =
    args;
  const product = productName.trim() || "the product";
  const spec = TYPE_BAKED_SPEC[type];
  const adaptive = !!args.adaptive;
  // A user-uploaded reference is the design authority: our generic poster
  // typography and the composition variant pool step aside so the card lands
  // in the reference's style family (similar, never a replica).
  // Also true when the reference IMAGE is attached without an extracted profile —
  // the picture must still win over our generic composition/typography rules.
  // ADAPTIVE: библиотечный экземпляр — НЕ авторитет композиции (иначе все
  // карточки повторяют раскладку и фон одного образца); он даёт только палитру,
  // плашки и типографику, а композиция идёт из пула вариантов + vision-плана.
  const userReference = styleProfile?.source === "reference" || args.refKind === "user";
  const referenceDriven = adaptive
    ? userReference
    : styleProfile?.source === "reference" || !!args.hasStyleReference;

  // Режим сцены: с референсом всегда рестайл (перенос стиля подразумевает новый
  // фон); иначе при наличии фото и включённом keepBackground — бережём фон;
  // без фото — генерация с нуля.
  // ADAPTIVE: выбор пользователя «Как на фото» уважается ВСЕГДА, даже со стилем
  // или референсом — стиль тогда применяется только к графическому слою.
  const keepBg = args.keepBackground !== false; // по умолчанию true
  const sceneMode: "restyle" | "keep" | "asis" = !args.hasProductImage
    ? "asis"
    : adaptive
      ? keepBg
        ? "keep"
        : "restyle"
      : keepBg && !referenceDriven
        ? "keep"
        : "restyle";

  // Адаптивная сцена под товар: vision предлагает 2–3 варианта окружения, выбор
  // детерминирован по товару и сдвигается variantSeed на каждом регенерейте.
  // НЕ применяется при пользовательском референсе — там перенос окружения из
  // референса и есть желаемое поведение.
  const artScenes =
    adaptive && sceneMode === "restyle" && !userReference
      ? (layoutPlan?.art?.scenes ?? [])
      : [];
  const adaptiveScene = artScenes.length
    ? artScenes[(hashSeed(product) + (args.variantSeed ?? 0)) % artScenes.length]
    : undefined;
  const artMood = adaptive ? layoutPlan?.art?.mood : undefined;
  const artColorsNote =
    adaptive && layoutPlan?.art?.productColors?.length
      ? ` Let small accents subtly echo the product's own colors (${layoutPlan.art.productColors.join(", ")}).`
      : "";

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
    describeBakedStyle(style, styleProfile, sceneMode) + ".",
    referenceDriven
      ? `Composition: follow the style reference's composition and layout rhythm.${
          layoutPlan
            ? ` In the source photo the product sits at the ${placementOf(layoutPlan.product)} — place text in the free space around it.`
            : ""
        }`
      : describeBakedComposition({
          plan: layoutPlan,
          type,
          benefitCount: benefits.length,
          productName: product,
          variantSeed: args.variantSeed ?? 0,
        }),
    sceneMode === "keep"
      ? "Keep the EXACT background, scene, surface and lighting of the provided product photo — do NOT invent, replace or restyle the environment. Only overlay the graphic layer (headline, benefit plates, accents) on top of the otherwise untouched photo."
      : adaptiveScene
        ? `Environment for this card: ${adaptiveScene}.${artMood ? ` Mood: ${artMood}.` : ""} Build the background around this idea — it OVERRIDES any generic background description above. Keep it photorealistic, with believable surfaces, natural depth and soft shadows.${artColorsNote} Do NOT copy the style reference photo's environment, background, furniture, plants or props, and do NOT default to a generic white studio with a potted plant.`
        : adaptive && !userReference
          ? "Ground the product in a believable real-world environment that fits THIS specific product's nature and typical use (real surface, subtle context props, natural depth) — vary the setting between generations, do NOT default to a generic white studio with a potted plant, and do NOT copy the style reference photo's environment, furniture or props."
          : "If it suits the product and style, ground the product in a believable real-world environment (real surface, subtle context props, natural depth) instead of a flat empty backdrop.",
    "Render the following RUSSIAN text directly inside the image as polished, modern marketplace typography — integrated into the layout, NOT as flat stickers, plastic pills or pasted badges:",
    `• Headline (dominant): «${headline.trim()}»`,
    subheadline ? `• Subheadline (smaller, lighter): «${subheadline.trim()}»` : "",
    benefitsList ? `• ${spec.blocks(benefits.length, benefitsList)}` : "",
    referenceDriven
      ? "TYPOGRAPHY: mirror the reference's typographic treatment — headline scale, weight, placement, letter case, plates and decorative effects — recreated with the RUSSIAN texts provided above. The goal is a card in the SAME style family as the reference: clearly similar, never a pixel-perfect replica." +
        (styleProfile?.typography ? ` Reference typography: ${styleProfile.typography}.` : "")
      : "POSTER-GRADE TYPOGRAPHY: the headline is the main visual element of the card — set it VERY large in a heavy bold sans-serif, like a magazine cover or promo poster. Break the headline into 2–3 size steps: the key product word largest, secondary words clearly smaller. If the HEADLINE or SUBHEADLINE itself contains a number or measurement, it may be highlighted in a compact accent plate — but never lift a number out of a caption into a separate badge.",
    "Letterforms must keep NATURAL, optically correct proportions — never artificially stretch, squeeze, condense or expand the letters to fill space. Scale comes from font SIZE only; if a word doesn't fit, make it smaller or break the line, don't distort it. Letter width and spacing stay uniform within each line.",
    "The headline must stay high-contrast and readable against its background even at thumbnail size.",
    "Typography rules: correct Russian spelling is MANDATORY — no gibberish, no invented or duplicated words, high legibility, elegant visual hierarchy and consistent alignment.",
    "Use ONLY the texts provided above — do not add any other words, numbers, percentages, sizes or invented specifications (no made-up fabric composition, no fake ratings).",
    "Every fact appears on the card EXACTLY ONCE: never show the same number, measurement or claim in two places (e.g. as an accent badge near the headline AND again as a caption plate).",
    "Do not cover the face or key product details with text. No watermark, no fake brand logos, no Wildberries logo.",
    "The result must look like a high-end, cohesive marketplace card — text feels designed into the scene, not pasted on top.",
  ]
    .filter(Boolean)
    .join(" ");
}

export { resolveStyle };
