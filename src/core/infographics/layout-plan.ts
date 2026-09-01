/**
 * Dynamic, per-photo layout plan.
 *
 * The whole problem with the old pipeline was that text positions were fixed
 * (top/bottom bands) regardless of the actual photo, so every card looked the
 * same. The layout plan replaces that: a vision model (or a deterministic
 * fallback) describes WHERE the product sits and WHERE text/benefits should go,
 * in NORMALIZED coordinates (0..1) so it scales to any export size.
 *
 * Cyrillic safety: the plan only carries GEOMETRY. Benefit copy is matched back
 * by `index` to the real strings in the brief, so the vision model never has a
 * chance to mangle Russian words — it only decides placement.
 *
 * This module is pure and client-safe (no server-only imports): both the server
 * (assembling the brief) and the canvas renderer use it.
 */

export type NormBox = { x: number; y: number; w: number; h: number };
export type NormPoint = { x: number; y: number };
export type TextAlign = "left" | "center" | "right";

export type LayoutTextBlock = {
  box: NormBox;
  align: TextAlign;
  /** font size as a fraction of card height (renderer multiplies by px height) */
  fontScale: number;
  maxLines: number;
  /** draw a soft legibility plate behind the text */
  plate: boolean;
};

export type LayoutHeadline = LayoutTextBlock & {
  side: "top" | "bottom" | "left" | "right" | "center";
};

export type LayoutBenefit = {
  index: number;
  box: NormBox;
  align: TextAlign;
  fontScale: number;
  plate: boolean;
  icon: boolean;
};

export type LayoutCallout = {
  index: number;
  /** point on the product the line points at */
  anchor: NormPoint;
  /** where the label sits */
  label: NormBox;
  /** optional elbow point for an angled connector */
  bend?: NormPoint;
  align: TextAlign;
  fontScale: number;
};

/**
 * Per-product art direction from the vision pass (adaptive-scene mode): what
 * environment/mood suits THIS product. Only geometry-free hints — the card copy
 * still comes from the brief, so Cyrillic safety is unaffected.
 */
export type ArtDirection = {
  /** short mood phrase, e.g. "premium tech", "cozy handmade" */
  mood?: string;
  /** up to 3 dominant product colors (hex or english names) for soft accents */
  productColors?: string[];
  /** 2-3 DIFFERENT specific environment ideas for this product (english) */
  scenes?: string[];
};

export type LayoutPlan = {
  version: 1;
  /** brightness of the BACKGROUND where text sits: "light" => dark text. */
  mode: "light" | "dark";
  product: NormBox;
  freeZones: NormBox[];
  safeMargins: { top: number; bottom: number; left: number; right: number };
  headline: LayoutHeadline;
  subheadline?: LayoutTextBlock;
  benefits: LayoutBenefit[];
  callouts: LayoutCallout[];
  source: "vision" | "fallback";
  notes?: string;
  art?: ArtDirection;
};

export type FallbackPlanParams = {
  benefitCount: number;
  hasSubheadline: boolean;
  headlinePosition?: "top" | "bottom";
  mode?: "light" | "dark";
};

/* ------------------------------ helpers ------------------------------ */

const num = (n: unknown, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n) ? n : fallback;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Clamp a box into the unit square, keeping a usable minimum size. */
export function clampBox(b: Partial<NormBox> | undefined): NormBox {
  let x = clamp01(num(b?.x, 0));
  let y = clamp01(num(b?.y, 0));
  let w = clamp01(num(b?.w, 0.1));
  let h = clamp01(num(b?.h, 0.1));
  w = Math.max(0.04, Math.min(w, 1));
  h = Math.max(0.02, Math.min(h, 1));
  if (x + w > 1) x = 1 - w;
  if (y + h > 1) y = 1 - h;
  x = clamp01(x);
  y = clamp01(y);
  return { x, y, w, h };
}

const clampScale = (n: unknown, lo: number, hi: number, def: number): number =>
  Math.max(lo, Math.min(hi, num(n, def)));

/** Deterministic stack of benefit cards in the band opposite the headline. */
function stackBenefits(count: number, headlineTop: boolean, margin: number): LayoutBenefit[] {
  const n = Math.max(0, Math.min(6, count));
  if (!n) return [];
  const h = 0.058;
  const gap = 0.016;
  const w = 1 - margin * 2;
  const totalH = n * h + (n - 1) * gap;
  // headline at top -> benefits sit at the bottom, and vice-versa
  const startY = headlineTop ? 0.95 - totalH : 0.06;
  const out: LayoutBenefit[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      index: i,
      box: { x: margin, y: startY + i * (h + gap), w, h },
      align: "left",
      fontScale: 0.028,
      plate: true,
      icon: true,
    });
  }
  return out;
}

/**
 * Deterministic plan that reproduces the previous good behaviour (centered
 * product, headline band, benefits stacked in the opposite band). Used when no
 * product photo is available, when the vision call fails, or on the client when
 * re-assembling a brief without re-running analysis.
 */
export function fallbackLayoutPlan(p: FallbackPlanParams): LayoutPlan {
  const margin = 0.05;
  const headlineTop = (p.headlinePosition ?? "top") === "top";
  const mode = p.mode ?? "light";
  const headBandY = headlineTop ? 0.05 : 0.82;

  const headline: LayoutHeadline = {
    box: { x: margin, y: headBandY, w: 1 - margin * 2, h: 0.12 },
    align: "left",
    fontScale: 0.06,
    maxLines: 2,
    plate: false,
    side: headlineTop ? "top" : "bottom",
  };

  const subheadline: LayoutTextBlock | undefined = p.hasSubheadline
    ? {
        box: { x: margin, y: headBandY + 0.12, w: 1 - margin * 2, h: 0.05 },
        align: "left",
        fontScale: 0.026,
        maxLines: 1,
        plate: false,
      }
    : undefined;

  return {
    version: 1,
    mode,
    product: { x: 0.18, y: 0.18, w: 0.64, h: 0.62 },
    freeZones: [
      { x: margin, y: 0.03, w: 1 - margin * 2, h: 0.16 },
      { x: margin, y: 0.8, w: 1 - margin * 2, h: 0.17 },
    ],
    safeMargins: { top: 0.04, bottom: 0.04, left: margin, right: margin },
    headline,
    subheadline,
    benefits: stackBenefits(p.benefitCount, headlineTop, margin),
    callouts: [],
    source: "fallback",
  };
}

/** Clamp vision art direction to safe sizes; drop it entirely when empty. */
function sanitizeArt(raw: ArtDirection | undefined): ArtDirection | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const str = (v: unknown, max: number): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
  const mood = str(raw.mood, 80);
  const productColors = Array.isArray(raw.productColors)
    ? raw.productColors
        .map((c) => str(c, 24))
        .filter((c): c is string => !!c)
        .slice(0, 3)
    : undefined;
  const scenes = Array.isArray(raw.scenes)
    ? raw.scenes
        .map((s) => str(s, 200))
        .filter((s): s is string => !!s)
        .slice(0, 3)
    : undefined;
  if (!mood && !productColors?.length && !scenes?.length) return undefined;
  return {
    mood,
    productColors: productColors?.length ? productColors : undefined,
    scenes: scenes?.length ? scenes : undefined,
  };
}

/**
 * Turn a raw (zod-parsed) vision plan into a complete, render-safe plan:
 * clamp every coordinate, guarantee benefit boxes for exactly `benefitCount`
 * items, drop a subheadline the brief doesn't have, and keep free zones sane.
 */
export function sanitizeLayoutPlan(raw: LayoutPlan, params: FallbackPlanParams): LayoutPlan {
  const fallback = fallbackLayoutPlan(params);
  const margin = clamp01(num(raw.safeMargins?.left, 0.05)) || 0.05;
  const headlineTop = raw.headline?.side !== "bottom";

  // benefits: keep the vision box for each index we actually have copy for,
  // fall back to a clean stacked box otherwise.
  const byIndex = new Map<number, LayoutBenefit>();
  for (const b of raw.benefits ?? []) {
    if (typeof b?.index === "number" && b.index >= 0) byIndex.set(b.index, b);
  }
  const stacked = stackBenefits(params.benefitCount, headlineTop, margin);
  const benefits: LayoutBenefit[] = stacked.map((stackBox, i) => {
    const v = byIndex.get(i);
    if (!v) return stackBox;
    return {
      index: i,
      box: clampBox(v.box),
      align: v.align ?? "left",
      fontScale: clampScale(v.fontScale, 0.016, 0.045, 0.028),
      plate: v.plate ?? true,
      icon: v.icon ?? true,
    };
  });

  const freeZones = (raw.freeZones ?? []).map(clampBox).filter((z) => z.w > 0.06 && z.h > 0.03);

  const headline: LayoutHeadline = {
    box: clampBox(raw.headline?.box),
    align: raw.headline?.align ?? "left",
    fontScale: clampScale(raw.headline?.fontScale, 0.04, 0.1, 0.06),
    maxLines: Math.max(1, Math.min(3, Math.round(num(raw.headline?.maxLines, 2)))),
    plate: raw.headline?.plate ?? false,
    side: raw.headline?.side ?? "top",
  };

  let subheadline: LayoutTextBlock | undefined;
  if (params.hasSubheadline) {
    const src = raw.subheadline ?? fallback.subheadline;
    if (src) {
      subheadline = {
        box: clampBox(src.box),
        align: src.align ?? "left",
        fontScale: clampScale(src.fontScale, 0.02, 0.04, 0.026),
        maxLines: 1,
        plate: src.plate ?? false,
      };
    }
  }

  const callouts: LayoutCallout[] = (raw.callouts ?? [])
    .filter((c) => c && c.anchor && c.label)
    .slice(0, 5)
    .map((c) => ({
      index: Math.max(0, Math.round(num(c.index, 0))),
      anchor: { x: clamp01(num(c.anchor.x, 0.5)), y: clamp01(num(c.anchor.y, 0.5)) },
      label: clampBox(c.label),
      bend: c.bend ? { x: clamp01(num(c.bend.x, 0.5)), y: clamp01(num(c.bend.y, 0.5)) } : undefined,
      align: c.align ?? "left",
      fontScale: clampScale(c.fontScale, 0.016, 0.04, 0.024),
    }));

  return {
    version: 1,
    mode: raw.mode === "dark" ? "dark" : "light",
    product: clampBox(raw.product),
    freeZones: freeZones.length ? freeZones : fallback.freeZones,
    safeMargins: {
      top: clamp01(num(raw.safeMargins?.top, 0.04)),
      bottom: clamp01(num(raw.safeMargins?.bottom, 0.04)),
      left: clamp01(num(raw.safeMargins?.left, 0.05)),
      right: clamp01(num(raw.safeMargins?.right, 0.05)),
    },
    headline,
    subheadline,
    benefits,
    callouts,
    source: "vision",
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 300) : undefined,
    art: sanitizeArt(raw.art),
  };
}

/**
 * Resolve exactly `count` benefit boxes for the renderer. If the user added
 * more blocks than the plan was built for, regenerate a clean uniform stack so
 * nothing overlaps.
 */
export function benefitLayoutFor(plan: LayoutPlan, count: number): LayoutBenefit[] {
  if (count <= plan.benefits.length) return plan.benefits.slice(0, count);
  const headlineTop = plan.headline.side !== "bottom";
  return stackBenefits(count, headlineTop, plan.safeMargins.left || 0.05);
}

/** Describe the human-readable side of a box for the Flux prompt. */
export function placementOf(box: NormBox): string {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const h = cx < 0.4 ? "left" : cx > 0.6 ? "right" : "center";
  const v = cy < 0.38 ? "top" : cy > 0.62 ? "bottom" : "middle";
  if (h === "center" && v === "middle") return "center";
  if (h === "center") return `${v} center`;
  if (v === "middle") return h;
  return `${v} ${h}`;
}
