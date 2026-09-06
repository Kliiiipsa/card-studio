import type { StyleId } from "@/core/domain/styles";
import { CARD_TYPE_MAP } from "@/core/domain/card-types";
import { PHOTO_SCENARIO_MAP } from "@/core/domain/photo-scenarios";

export type GenerationMode = "text-to-image" | "image-to-image";
export type StyleMode = "auto" | "minimal" | "premium" | "bold" | "lifestyle";

/** Everything the prompt pipeline needs to author a card prompt. */
export type PromptIntent = {
  productName?: string;
  category?: string;
  benefits?: string[];
  painPoints?: string[];
  targetAudience?: string;
  userNote?: string;
  cardType?: string;
  styleMode?: StyleMode;
  generationMode: GenerationMode;
  /** не писать бренд/модель в промпт: image-модель рисует их кривой надписью
   *  («Wessgauff» на аэрогриле в A/B 2026-09-06) */
  noBrand?: boolean;
};

/** Result of the prompt pipeline. `generatedPrompt` is Russian (user-editable). */
export type PromptResult = {
  generatedPrompt: string;
  negativePrompt: string;
  overlaySuggestion?: string;
  visualDirection: string;
};

/** Map a compact style mode to a concrete style id (for the deterministic fallback). */
export function styleModeToStyleId(mode?: StyleMode): StyleId {
  switch (mode) {
    case "minimal":
      return "premium-minimal";
    case "premium":
      return "luxury-dark";
    case "bold":
      return "bold-commercial";
    case "lifestyle":
      return "soft-lifestyle";
    case "auto":
    default:
      return "premium-minimal";
  }
}

/** Human-readable style guidance (Russian) used inside the LLM instructions. */
export function styleModeGuidance(mode?: StyleMode): string {
  switch (mode) {
    case "minimal":
      return "минимализм, много воздуха, чистый светлый фон";
    case "premium":
      return "премиальный дорогой вид, благородная палитра, мягкий студийный свет";
    case "bold":
      return "яркий, заметный, сочный акцентный цвет, уверенный контраст";
    case "lifestyle":
      return "мягкий жизненный контекст, естественный свет, аспирационное настроение";
    case "auto":
    default:
      return "стиль подбери сам под категорию товара и его аудиторию";
  }
}

/** Verbalize a card type for the LLM (Russian label + purpose) — the raw id was ignored. */
export function cardTypeGuidance(cardTypeId?: string): string | null {
  if (!cardTypeId) return null;
  const s = PHOTO_SCENARIO_MAP[cardTypeId];
  if (s) return `${s.title} — ${s.guidance}`;
  const t = CARD_TYPE_MAP[cardTypeId as keyof typeof CARD_TYPE_MAP];
  return t ? `${t.title} — ${t.description}` : cardTypeId;
}
