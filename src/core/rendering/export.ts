"use client";
import type { ExportPreset, ExportFormat } from "@/core/domain/export-presets";
import { buildDefaultElements, type CardOverlay, type RenderElement } from "./types";
import { drawOverlay, drawElements } from "./canvas-renderer";

export type ExportVariant = { id: string; url: string };

function loadImage(src: string): Promise<HTMLImageElement> {
  // route remote images through a same-origin proxy so the canvas isn't tainted
  const resolved = /^https?:\/\//.test(src)
    ? `/api/proxy-image?url=${encodeURIComponent(src)}`
    : src;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось загрузить изображение для экспорта."));
    img.src = resolved;
  });
}

function mime(format: ExportFormat) {
  return format === "png" ? "image/png" : "image/jpeg";
}

/** Compose base image (object-fit: cover) + optional text overlay into a canvas. */
async function renderToCanvas(
  src: string,
  preset: ExportPreset,
  overlay?: CardOverlay,
): Promise<HTMLCanvasElement> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = preset.width;
  canvas.height = preset.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas не поддерживается.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, preset.width, preset.height);

  const scale = Math.max(preset.width / img.width, preset.height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (preset.width - w) / 2, (preset.height - h) / 2, w, h);

  if (overlay && (overlay.headline || overlay.subtitle || (overlay.benefits?.length ?? 0) > 0)) {
    const elements = buildDefaultElements(overlay, preset);
    drawOverlay(ctx, elements, overlay, preset.width, preset.height);
  }

  return canvas;
}

export async function renderCardToBlob(
  src: string,
  preset: ExportPreset,
  format: ExportFormat,
  overlay?: CardOverlay,
): Promise<Blob> {
  const canvas = await renderToCanvas(src, preset, overlay);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось создать файл."))),
      mime(format),
      0.92,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportCard(
  src: string,
  preset: ExportPreset,
  format: ExportFormat,
  opts?: { overlay?: CardOverlay; baseName?: string },
) {
  const blob = await renderCardToBlob(src, preset, format, opts?.overlay);
  const base = opts?.baseName ?? "wb-card";
  downloadBlob(blob, `${base}-${preset.width}x${preset.height}.${format}`);
}

/**
 * Экспорт в РОДНОМ разрешении изображения, без кропа — для «Как у исходного
 * фото». Картинка уже сгенерирована в пропорциях оригинала, поэтому просто
 * рисуем её 1:1 и отдаём. Наложение текста тут не нужно (режим «Обычное фото»).
 */
export async function exportCardNatural(
  src: string,
  format: ExportFormat,
  opts?: { baseName?: string },
) {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas не поддерживается.");
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Не удалось создать файл."))),
      mime(format),
      0.92,
    ),
  );
  const base = opts?.baseName ?? "kartogen-photo";
  downloadBlob(blob, `${base}-${canvas.width}x${canvas.height}.${format}`);
}

/**
 * Export EVERY generated variant across EVERY preset, with clear filenames:
 *   wb-card-variant-1-900x1200.png, wb-card-variant-2-1200x1600.png, ...
 */
/* -------------------------------------------------------------------------- */
/*  Infographics: compose base image + explicit overlay plan                  */
/* -------------------------------------------------------------------------- */

export type OverlayPlan = { width: number; height: number; elements: RenderElement[] };

function scaleElements(plan: OverlayPlan, w: number, h: number): RenderElement[] {
  const sx = w / plan.width;
  const sy = h / plan.height;
  return plan.elements.map((el) => ({
    ...el,
    x: el.x * sx,
    y: el.y * sy,
    width: el.width * sx,
    height: el.height * sy,
    fontSize: el.fontSize ? el.fontSize * sx : el.fontSize,
  }));
}

async function renderPlanToCanvas(
  baseSrc: string,
  width: number,
  height: number,
  plan: OverlayPlan,
): Promise<HTMLCanvasElement> {
  const img = await loadImage(baseSrc);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas не поддерживается.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const scale = Math.max(width / img.width, height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);

  drawElements(ctx, scaleElements(plan, width, height));
  return canvas;
}

/** Live-preview data URL (small) for the infographics canvas. */
export async function renderPlanToDataUrl(
  baseSrc: string,
  plan: OverlayPlan,
  previewWidth = 480,
): Promise<string> {
  const previewHeight = Math.round((previewWidth * plan.height) / plan.width);
  const canvas = await renderPlanToCanvas(baseSrc, previewWidth, previewHeight, plan);
  return canvas.toDataURL("image/png");
}

export async function exportInfographic(
  baseSrc: string,
  preset: ExportPreset,
  format: ExportFormat,
  plan: OverlayPlan,
  baseName = "wb-infographic",
) {
  const canvas = await renderPlanToCanvas(baseSrc, preset.width, preset.height, plan);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Не удалось создать файл."))),
      mime(format),
      0.92,
    ),
  );
  downloadBlob(blob, `${baseName}-${preset.width}x${preset.height}.${format}`);
}

export async function exportAllVariants(
  variants: ExportVariant[],
  presets: ExportPreset[],
  format: ExportFormat,
  opts?: { overlay?: CardOverlay; baseName?: string },
) {
  const base = opts?.baseName ?? "wb-card";
  for (let i = 0; i < variants.length; i++) {
    for (const preset of presets) {
      // eslint-disable-next-line no-await-in-loop
      const blob = await renderCardToBlob(variants[i].url, preset, format, opts?.overlay);
      downloadBlob(blob, `${base}-variant-${i + 1}-${preset.width}x${preset.height}.${format}`);
    }
  }
}
