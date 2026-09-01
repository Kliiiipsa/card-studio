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
  // «staggered» (плашки на разных высотах) и «side-panel» (сплошная панель в
  // треть ширины) убраны 2026-09-01 по фидбеку владельца: gpt-image раздувал
  // панель до полэкрана, а разноуровневые плашки читались как «разлетелись».
  {
    id: "split-columns",
    suits: ["benefits", "why_buy"],
    describe: (n) =>
      `Headline at the top. The ${n} captions are split into two SHORT aligned columns flanking the product — one on the left, one on the right, their tops aligned at the SAME height, equal vertical spacing within each column. Calm, symmetric and tidy; no caption floats at a random height.`,
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
