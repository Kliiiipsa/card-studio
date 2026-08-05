"use client";
import { create } from "zustand";
import type { PhotoScenarioId } from "@/core/domain/photo-scenarios";
import type { StyleId } from "@/core/domain/styles";
import type { AspectRatioId } from "@/core/domain/export-presets";
import type { CardScore, ProductInfo, StoredImage } from "@/core/domain/types";
import { EMPTY_PRODUCT } from "@/core/domain/types";

export interface GeneratedVariant {
  id: string;
  url: string;
  width?: number;
  height?: number;
  /** prompt that produced this variant */
  prompt?: string;
  /** Russian headline meant to be overlaid on the card */
  cardText?: string;
  cardType?: string;
  style?: string;
  createdAt?: string;
}

export type GenStatus =
  | "idle"
  | "writing"
  | "building"
  | "generating"
  | "scoring"
  | "done"
  | "error";

/** Compact, user-friendly style modes (replace the long style list in the UI). */
export type StyleMode = "auto" | "minimal" | "premium" | "bold" | "lifestyle";

interface GeneratorState {
  product: ProductInfo;
  cardType: PhotoScenarioId;
  style: StyleId;
  styleMode: StyleMode;
  aspectRatio: AspectRatioId;
  /** optional free-text "what I want" note */
  userNote: string;
  userPrompt: string;
  negativePrompt: string;
  finalPrompt: string;
  /** short Russian headline suggested for the text overlay */
  overlayHeadline: string;

  reference: StoredImage | null;
  referenceStrength: number;

  variants: GeneratedVariant[];
  selectedVariantId: string | null;
  status: GenStatus;
  error: string | null;
  /** score of the latest generation (best-effort, may stay null) */
  lastScore: CardScore | null;

  setProduct: (patch: Partial<ProductInfo>) => void;
  setField: <K extends keyof GeneratorState>(key: K, value: GeneratorState[K]) => void;
  setReference: (img: StoredImage | null) => void;
  setVariants: (v: GeneratedVariant[]) => void;
  selectVariant: (id: string) => void;
  reset: () => void;
}

export const DEFAULT_NEGATIVE =
  "низкое качество, размыто, дешёвый дизайн, искажённый товар, случайный текст, лишние объекты, водяной знак";

export const useGeneratorStore = create<GeneratorState>((set) => ({
  product: { ...EMPTY_PRODUCT },
  cardType: "studio",
  style: "premium-minimal",
  styleMode: "auto",
  aspectRatio: "3:4",
  userNote: "",
  userPrompt: "",
  negativePrompt: DEFAULT_NEGATIVE,
  finalPrompt: "",
  overlayHeadline: "",

  reference: null,
  referenceStrength: 0.45,

  variants: [],
  selectedVariantId: null,
  status: "idle",
  error: null,
  lastScore: null,

  setProduct: (patch) => set((s) => ({ product: { ...s.product, ...patch } })),
  setField: (key, value) => set({ [key]: value } as Partial<GeneratorState>),
  setReference: (img) => set({ reference: img }),
  setVariants: (v) => set({ variants: v, selectedVariantId: v[0]?.id ?? null }),
  selectVariant: (id) => set({ selectedVariantId: id }),
  reset: () =>
    set({
      variants: [],
      selectedVariantId: null,
      status: "idle",
      error: null,
      finalPrompt: "",
    }),
}));
