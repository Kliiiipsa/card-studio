"use client";
import { useCallback } from "react";
import { useGeneratorStore, type GeneratedVariant } from "@/store/generator-store";
import { api } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { uid } from "@/lib/utils";
import { PHOTO_SCENARIO_MAP } from "@/core/domain/photo-scenarios";
import { styleModeGuidance } from "@/core/prompting/prompt-intent";

/** Реальные пиксельные размеры изображения из data URL (для «Как у исходного»). */
function imageNaturalSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("не удалось прочитать размеры изображения"));
    img.src = dataUrl;
  });
}

/**
 * Превращает выбранную пропорцию в то, что уходит модели. Для «original» берём
 * реальные пропорции загруженного референса (строка "W:H"); без референса или
 * при ошибке — безопасный дефолт 3:4.
 */
async function resolveAspect(aspect: string, refDataUrl?: string): Promise<string> {
  if (aspect !== "original") return aspect;
  if (!refDataUrl) return "3:4";
  try {
    const { w, h } = await imageNaturalSize(refDataUrl);
    if (w > 0 && h > 0) return `${w}:${h}`;
  } catch {
    // не смогли прочитать — падать не будем, отдадим дефолт
  }
  return "3:4";
}

/** "W:H" → число w/h, либо null. */
function ratioNum(aspect: string): number | null {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect);
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  return w > 0 && h > 0 ? w / h : null;
}

/**
 * Обрезать (cover) референс под нужную пропорцию ПЕРЕД отправкой.
 * Зачем: в режиме правки фото (image-to-image) модель возвращает результат в
 * форме ВХОДНОГО изображения и игнорирует запрошенный размер. Поэтому, чтобы
 * «1:1» реально дал квадрат, сами приводим фото к этой пропорции. Для «Как у
 * исходного» обрезка не вызывается — форма сохраняется.
 */
function cropToAspect(dataUrl: string, aspect: string): Promise<string> {
  const ar = ratioNum(aspect);
  return new Promise((resolve) => {
    if (!ar) return resolve(dataUrl);
    const img = new Image();
    img.onload = () => {
      const srcAr = img.naturalWidth / img.naturalHeight;
      if (!Number.isFinite(srcAr) || Math.abs(srcAr - ar) < 0.01) return resolve(dataUrl);
      const LONG = 1600;
      const outW = ar >= 1 ? LONG : Math.round(LONG * ar);
      const outH = ar >= 1 ? Math.round(LONG / ar) : LONG;
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      const s = Math.max(outW / img.naturalWidth, outH / img.naturalHeight);
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      ctx.drawImage(img, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

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
        // «Обычное фото»: без маркетплейсовых сценария и стиля — промпт как есть.
        const freeMode = s.genMode === "free";
        const scenario = freeMode ? null : PHOTO_SCENARIO_MAP[s.cardType];
        const styleGuidance =
          !freeMode && s.styleMode !== "auto" ? styleModeGuidance(s.styleMode) : null;
        const suffix = [
          scenario && `Сценарий фото: ${scenario.title}. Composition: ${scenario.promptHint}`,
          styleGuidance && `Стиль: ${styleGuidance}`,
        ]
          .filter(Boolean)
          .join(". ");
        const finalPrompt = suffix ? `${basePrompt}\n\n${suffix}.` : basePrompt;
        gen.setField("finalPrompt", finalPrompt);

        // Русский заголовок живёт ТОЛЬКО в оверлее экспорта (канвас). В модель
        // его не передаём вовсе: даже «зарезервируй место под заголовок о …»
        // работал как приглашение НАРИСОВАТЬ текст (жалоба 2026-08-25, щётка
        // с плашкой «Идеальная чистота авто») — а раздел обещает чистое фото.
        const cardText =
          (s.overlayHeadline || s.product.benefits[0] || s.product.name || "")
            .trim()
            .slice(0, 60) || undefined;

        gen.setField("status", "generating");
        // «Как у исходного фото» → реальные пропорции референса; иначе как выбрано
        const effAspect = await resolveAspect(s.aspectRatio, s.reference?.dataUrl);
        // i2i возвращает результат в форме входа → чтобы выбранный размер реально
        // применился, приводим референс к нужной пропорции (кроме «original»)
        const refUrl =
          s.reference && s.aspectRatio !== "original"
            ? await cropToAspect(s.reference.dataUrl, s.aspectRatio)
            : s.reference?.dataUrl;
        const result = s.reference
          ? await api.generateImage({
              prompt: finalPrompt,
              negativePrompt: s.negativePrompt,
              referenceImageDataUrl: refUrl as string,
              strength: s.referenceStrength,
              aspectRatio: effAspect,
              count: 1,
            })
          : await api.generateText({
              prompt: finalPrompt,
              negativePrompt: s.negativePrompt,
              aspectRatio: effAspect,
              count: 1,
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

        // Score the variant (best-effort; non-fatal). Оценка меряет карточку
        // маркетплейса — обычному фото она не нужна и только путает.
        if (!freeMode) {
          gen.setField("status", "scoring");
          try {
            const score = await api.score({
              imageDataUrl: variants[0].url,
              product: s.product,
              cardType: s.cardType,
            });
            gen.setField("lastScore", score);
          } catch {
            // scoring is non-critical
            gen.setField("lastScore", null);
          }
        } else {
          gen.setField("lastScore", null);
        }

        gen.setField("status", "done");
        toast.success("Фото готово");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Ошибка генерации";
        gen.setField("error", msg);
        gen.setField("status", "error");
        toast.error(msg);
      }
    },
    [gen],
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
