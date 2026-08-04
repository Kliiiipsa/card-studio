"use client";
import { useCallback } from "react";
import { useGeneratorStore, type GeneratedVariant } from "@/store/generator-store";
import { useProjectStore } from "@/store/project-store";
import { api } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { uid } from "@/lib/utils";
import { CARD_TYPE_MAP } from "@/core/domain/card-types";
import { styleModeGuidance } from "@/core/prompting/prompt-intent";
import type { Generation } from "@/core/domain/types";

/**
 * Generation pipeline.
 *
 * New product logic:
 *   1. `writePrompt()` — AI looks at the photo + product data and writes a ready
 *      Russian prompt into the field (the user can then edit it).
 *   2. `generate()` — generates the image straight from that prompt field
 *      (translated to English server-side). No hidden style/strategy overrides.
 */
export function useCardGeneration() {
  const gen = useGeneratorStore();
  const project = useProjectStore();

  /** "Написать промпт" — AI authors the prompt from photo + product data. */
  const writePrompt = useCallback(async () => {
    const s = useGeneratorStore.getState();
    gen.setField("status", "writing");
    gen.setField("error", null);
    try {
      const result = await api.writePrompt({
        product: s.product,
        cardType: s.cardType,
        styleMode: s.styleMode,
        userNote: s.userNote,
        referenceImageDataUrl: s.reference?.dataUrl,
      });
      gen.setField("userPrompt", result.generatedPrompt);
      if (result.negativePrompt) gen.setField("negativePrompt", result.negativePrompt);
      gen.setField("overlayHeadline", result.overlaySuggestion ?? "");
      gen.setField("status", "idle");
      toast.success("Промпт готов — отредактируйте при желании");
    } catch (e) {
      gen.setField("status", "idle");
      toast.error(e instanceof Error ? e.message : "Не удалось написать промпт");
    }
  }, [gen]);

  const generate = useCallback(
    async (opts?: { promptOverride?: string }) => {
      const s = useGeneratorStore.getState();
      try {
        gen.setField("error", null);

        const basePrompt = (opts?.promptOverride ?? s.userPrompt).trim();
        if (!basePrompt) {
          toast.error("Сначала нажмите «Написать промпт» или введите промпт вручную.");
          return;
        }

        // The type/style selects must matter even when the prompt was written
        // earlier (or by hand): their guidance is appended at generation time.
        const cardType = CARD_TYPE_MAP[s.cardType];
        const styleGuidance = s.styleMode !== "auto" ? styleModeGuidance(s.styleMode) : null;
        const suffix = [
          cardType && `Формат карточки: ${cardType.title}. Composition: ${cardType.promptHint}`,
          styleGuidance && `Стиль: ${styleGuidance}`,
        ]
          .filter(Boolean)
          .join(". ");
        const finalPrompt = suffix ? `${basePrompt}\n\n${suffix}.` : basePrompt;
        gen.setField("finalPrompt", finalPrompt);

        // Russian headline kept for the text overlay (not rendered by the model)
        const cardText =
          (s.overlayHeadline || s.product.benefits[0] || s.product.name || "")
            .trim()
            .slice(0, 60) || undefined;

        gen.setField("status", "generating");
        const result = s.reference
          ? await api.generateImage({
              prompt: finalPrompt,
              negativePrompt: s.negativePrompt,
              referenceImageDataUrl: s.reference.dataUrl,
              strength: s.referenceStrength,
              aspectRatio: s.aspectRatio,
              count: 1,
              cardText,
            })
          : await api.generateText({
              prompt: finalPrompt,
              negativePrompt: s.negativePrompt,
              aspectRatio: s.aspectRatio,
              count: 1,
              cardText,
            });

        const nowIso = new Date().toISOString();
        const variants: GeneratedVariant[] = result.images.map((img) => ({
          id: uid("var"),
          url: img.url,
          width: img.width,
          height: img.height,
          prompt: finalPrompt,
          cardText,
          cardType: s.cardType,
          style: s.style,
          createdAt: nowIso,
        }));
        gen.setVariants(variants);

        // Score the variant (best-effort; non-fatal)
        gen.setField("status", "scoring");
        let score;
        try {
          score = await api.score({
            imageDataUrl: variants[0].url,
            product: s.product,
            cardType: s.cardType,
          });
        } catch {
          // scoring is non-critical
        }

        if (project.current) {
          const record: Generation = {
            id: uid("gen"),
            projectId: project.current.id,
            mode: s.reference ? "image-to-image" : "text-to-image",
            params: {
              cardType: s.cardType,
              style: s.style,
              aspectRatio: s.aspectRatio,
              userPrompt: s.userPrompt,
              negativePrompt: s.negativePrompt,
              finalPrompt,
              referenceStrength: s.reference ? s.referenceStrength : undefined,
              referenceImageId: s.reference?.id,
            },
            images: variants.map((v) => ({
              id: v.id,
              dataUrl: v.url,
              width: v.width,
              height: v.height,
              createdAt: Date.now(),
            })),
            score,
            createdAt: Date.now(),
          };
          await project.addGeneration(record);
        }

        gen.setField("status", "done");
        toast.success("Карточка сгенерирована");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Ошибка генерации";
        gen.setField("error", msg);
        gen.setField("status", "error");
        toast.error(msg);
      }
    },
    [gen, project],
  );

  /** Secondary "Переписать / Сделать лучше" — improve the existing prompt text. */
  const improvePrompt = useCallback(async () => {
    const s = useGeneratorStore.getState();
    if (!s.userPrompt.trim()) {
      toast.error("Сначала напишите промпт.");
      return;
    }
    try {
      const { prompt } = await api.improvePrompt(s.userPrompt, s.cardType, s.style);
      gen.setField("userPrompt", prompt);
      toast.success("Промпт переписан");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось переписать промпт");
    }
  }, [gen]);

  return { writePrompt, generate, improvePrompt };
}
