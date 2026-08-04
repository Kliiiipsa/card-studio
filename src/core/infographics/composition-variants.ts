import type { InfographicType } from "./types";

/**
 * Named composition archetypes for the BAKED (gpt-image) card. This is what
 * breaks the "every card is headline-top + three chips at the bottom" template:
 * each product deterministically starts on its own variant (hash of the product
 * name), and every "Перегенерировать основу" click advances the seed to the
 * next compatible variant.
 *
 * Pure module — safe on server and client.
 */
export type ProductSide = "left" | "right" | "center";

export type CompositionVariant = {
  id: string;
  /** exclude when the product occupies the same side the text needs */
  avoidWhenProductAt?: ProductSide[];
  /** restrict to types where the archetype reads well; undefined = all */
  suits?: InfographicType[];
  /** English composition brief for gpt-image; n = number of captions */
  describe: (n: number) => string;
};

export const COMPOSITION_VARIANTS: CompositionVariant[] = [
  {
    id: "left-rail",
    avoidWhenProductAt: ["left"],
    describe: (n) =>
      `Headline large at the top-left. The ${n} captions run as a clean vertical rail down the LEFT edge, one under another, aligned to a common left axis. The product fills the right two-thirds of the frame.`,
  },
  {
    id: "right-rail",
    avoidWhenProductAt: ["right"],
    describe: (n) =>
      `Headline large at the top-right, right-aligned. The ${n} captions run as a clean vertical rail down the RIGHT edge. The product fills the left two-thirds of the frame.`,
  },
  {
    id: "bottom-band",
    describe: (n) =>
      `Headline at the top. The ${n} captions sit in ONE elegant horizontal band across the bottom, evenly spaced. Product dominates the middle of the frame.`,
  },
  {
    id: "top-stack",
    suits: ["benefits", "why_buy", "sizes"],
    describe: (n) =>
      `Headline at the very top with the ${n} captions directly beneath it as a compact aligned group; the product occupies the lower two-thirds of the frame, large and confident.`,
  },
  {
    id: "staggered",
    suits: ["benefits", "why_buy"],
    describe: (n) =>
      `Editorial asymmetric layout: headline at the top, and the ${n} captions staggered at DIFFERENT heights on alternating sides of the product, following its silhouette — dynamic but tidy, nothing overlaps the product.`,
  },
  {
    id: "side-panel",
    describe: (n) =>
      `A vertical tinted panel (about one third of the width, in the style's surface color) runs down one side and holds the headline and all ${n} captions top-to-bottom; the product fills the remaining frame, slightly overlapping the panel edge for depth.`,
  },
  {
    id: "callout-lines",
    suits: ["benefits", "why_buy", "materials"],
    describe: (n) =>
      `Headline at the top. Each of the ${n} captions connects to the relevant part of the product with a thin elegant pointer line — captions distributed around the product on both sides, well separated.`,
  },
];

/** Stable tiny hash so each product name lands on its own starting variant. */
export function hashSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function pickCompositionVariant(args: {
  seed: number;
  type: InfographicType;
  productSide: ProductSide;
}): CompositionVariant {
  const pool = COMPOSITION_VARIANTS.filter(
    (v) =>
      !(v.avoidWhenProductAt ?? []).includes(args.productSide) &&
      (!v.suits || v.suits.includes(args.type)),
  );
  const list = pool.length ? pool : COMPOSITION_VARIANTS;
  return list[Math.abs(args.seed) % list.length];
}
