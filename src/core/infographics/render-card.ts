"use client";
import type { ExportPreset, ExportFormat } from "@/core/domain/export-presets";
import { downloadBlob } from "@/core/rendering/export";
import type { InfographicBrief } from "./types";
import { analyzeComposition } from "./composition";
import { buildTokens, hexToRgba } from "./design-tokens";
import { benefitLayoutFor, fallbackLayoutPlan, type NormBox } from "./layout-plan";

const REF_W = 900;

function loadImage(src: string): Promise<HTMLImageElement> {
  const resolved = /^https?:\/\//.test(src)
    ? `/api/proxy-image?url=${encodeURIComponent(src)}`
    : src;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось загрузить изображение."));
    img.src = resolved;
  });
}

/** Wait for web fonts so Cyrillic text is measured/drawn with the right metrics. */
async function fontsReady(): Promise<void> {
  try {
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    /* fonts API unavailable — proceed with system metrics */
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Wrap text into up to maxLines lines that fit maxWidth; returns the lines. */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      if (lines.length === maxLines - 1) {
        // последняя доступная строка забирает ВЕСЬ остаток: если не влезет —
        // ниже честно поставим многоточие (раньше хвост слов молча пропадал)
        line = words.slice(i).join(" ");
        break;
      }
      line = word;
    } else {
      line = test;
    }
  }
  let last = line;
  if (ctx.measureText(last).width > maxWidth) {
    while (last.length > 1 && ctx.measureText(last + "…").width > maxWidth)
      last = last.slice(0, -1);
    last += "…";
  }
  if (last) lines.push(last);
  return lines.slice(0, maxLines);
}

/**
 * Подобрать размер шрифта, при котором текст помещается в ширину за maxLines
 * строк БЕЗ обрезки. Идём вниз от желаемого размера к минимальному; если и на
 * минимальном не влезает — разрешаем на строку больше (до hardMaxLines), и
 * только после этого соглашаемся на многоточие.
 *
 * Причина (2026-09-14, тапочки): vision прислал заголовок в одну строку при
 * 0.07 высоты и три плашки по 25 % ширины — холст честно обрезал «Домашние
 * тапочки для детей» до «Домашние», а плашки до «Мягкий плюш…». Раскладка от
 * модели — подсказка, а не закон: текст обязан читаться целиком.
 */
function fitLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  opts: {
    startSize: number;
    minSize: number;
    maxLines: number;
    hardMaxLines: number;
    font: (size: number) => string;
  },
): { size: number; lines: string[] } {
  // обрезка бывает двух видов: многоточие в строке и молча выброшенные слова
  // (wrapLines отдаёт первые maxLines строк, хвост пропадает без следа)
  const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const total = wordCount(text);
  const truncated = (lines: string[]) =>
    lines.some((l) => l.endsWith("…")) || wordCount(lines.join(" ").replace(/…/g, "")) < total;
  const tryAt = (size: number, maxLines: number) => {
    ctx.font = opts.font(size);
    return wrapLines(ctx, text, maxWidth, maxLines);
  };
  for (let maxLines = opts.maxLines; maxLines <= opts.hardMaxLines; maxLines++) {
    for (let size = opts.startSize; size >= opts.minSize; size = Math.floor(size * 0.93)) {
      const lines = tryAt(size, maxLines);
      if (!truncated(lines)) return { size, lines };
    }
  }
  const size = opts.minSize;
  return { size, lines: tryAt(size, opts.hardMaxLines) };
}

/** Render the full cohesive infographic into a canvas, driven by the layout plan. */
async function renderToCanvas(
  baseSrc: string,
  width: number,
  height: number,
  brief: InfographicBrief,
): Promise<HTMLCanvasElement> {
  const [img] = await Promise.all([loadImage(baseSrc), fontsReady()]);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas не поддерживается.");

  // base image, cover-fit
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const scaleImg = Math.max(width / img.width, height / img.height);
  const iw = img.width * scaleImg;
  const ih = img.height * scaleImg;
  ctx.drawImage(img, (width - iw) / 2, (height - ih) / 2, iw, ih);

  const comp = analyzeComposition(img);
  const s = width / REF_W;

  // Per-photo layout plan decides WHERE everything goes; the transferred style
  // (library/reference) decides accent, card shape and radius. Colours/contrast
  // follow the plan's mode (background brightness of the text zone).
  const profile = brief.styleProfile;
  const plan =
    brief.layoutPlan ??
    fallbackLayoutPlan({
      benefitCount: brief.blocks.length,
      hasSubheadline: !!brief.subheadline,
      headlinePosition: profile?.headlinePosition,
      mode: profile?.mode,
    });

  const accentOverride = profile?.palette.accent ?? comp.accent;
  const mode = plan.mode;
  const t = buildTokens(brief.style as never, mode, accentOverride);
  const cardRadius = profile?.radius ?? t.radius.card;
  const cardKind = profile?.cardStyle ?? "integrated-soft";

  const px = (b: NormBox) => ({ x: b.x * width, y: b.y * height, w: b.w * width, h: b.h * height });
  const fs = (scale: number) => Math.round(scale * height);
  const alignX = (x: number, w: number, align: "left" | "center" | "right") =>
    align === "center" ? x + w / 2 : align === "right" ? x + w : x;

  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const drawPlate = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.save();
    ctx.fillStyle = mode === "light" ? "rgba(255,255,255,0.6)" : "rgba(10,12,16,0.5)";
    ctx.shadowColor = t.shadow.soft;
    ctx.shadowBlur = 18 * s;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.restore();
  };

  /* ---------------- headline + subheadline ---------------- */
  const hb = px(plan.headline.box);
  // сначала подбираем размер и строки, потом рисуем плашку под реальную высоту
  const headFont = (size: number) =>
    `${t.typography.fontWeight} ${size}px ${t.typography.fontFamily}`;
  const { size: hSize, lines: hLines } = fitLines(ctx, brief.headline, hb.w, {
    startSize: fs(plan.headline.fontScale),
    minSize: fs(0.036),
    maxLines: plan.headline.maxLines,
    hardMaxLines: 3,
    font: headFont,
  });
  ctx.font = headFont(hSize);
  const hLineH = hSize * 1.12;
  const hTextH = hLines.length * hLineH;
  if (plan.headline.plate) {
    drawPlate(hb.x - 14 * s, hb.y - 12 * s, hb.w + 28 * s, Math.max(hb.h, hTextH) + 24 * s, 18 * s);
  }

  const accentLineH = 6 * s;
  ctx.fillStyle = t.palette.accent;
  const accentX = plan.headline.align === "center" ? hb.x + hb.w / 2 - 32 * s : hb.x;
  roundRect(ctx, accentX, Math.max(2 * s, hb.y - 16 * s), 64 * s, accentLineH, accentLineH / 2);
  ctx.fill();
  ctx.textAlign = plan.headline.align;
  ctx.fillStyle = t.palette.textPrimary;
  ctx.save();
  ctx.shadowColor = mode === "light" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 8 * s;
  let hy = hb.y;
  const hx = alignX(hb.x, hb.w, plan.headline.align);
  for (const line of hLines) {
    ctx.fillText(line, hx, hy);
    hy += hLineH;
  }
  ctx.restore();
  ctx.textAlign = "left";

  if (brief.subheadline && plan.subheadline) {
    const sb = px(plan.subheadline.box);
    const subSize = fs(plan.subheadline.fontScale);
    ctx.font = `500 ${subSize}px ${t.typography.fontFamily}`;
    ctx.fillStyle = t.palette.textSecondary;
    ctx.textAlign = plan.subheadline.align;
    const subLine = wrapLines(ctx, brief.subheadline, sb.w, plan.subheadline.maxLines)[0] ?? "";
    ctx.save();
    ctx.shadowColor = mode === "light" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 6 * s;
    ctx.fillText(subLine, alignX(sb.x, sb.w, plan.subheadline.align), sb.y);
    ctx.restore();
    ctx.textAlign = "left";
  }

  /* ---------------- benefit cards ---------------- */
  const items = brief.blocks.map((b) => b.title).filter(Boolean);
  if (items.length) {
    const boxes = benefitLayoutFor(plan, items.length);
    const editorial = cardKind === "premium-editorial";
    const padX = t.spacing.blockPadding * s;

    const titleFont = (size: number) => `600 ${size}px ${t.typography.fontFamily}`;
    // Проход 1: геометрия каждой плашки и размер, при котором её текст влезает.
    const geo = items.map((title, i) => {
      const slot = boxes[i];
      const bx = px(slot.box);
      // Узкая плашка (три в ряд) — иконка съедает половину ширины, убираем её.
      const narrow = bx.w < width * 0.3;
      const hasIcon = !editorial && slot.icon && !narrow;
      const textX = editorial ? bx.x + 22 * s : bx.x + padX + (hasIcon ? 64 * s : 0);
      const maxW = Math.max(40 * s, bx.x + bx.w - textX - padX * 0.5);
      const fit = fitLines(ctx, title, maxW, {
        startSize: fs(slot.fontScale),
        minSize: fs(0.018),
        maxLines: 2,
        hardMaxLines: 3,
        font: titleFont,
      });
      return { title, slot, bx, hasIcon, textX, maxW, size: fit.size };
    });
    // Один кегль на все плашки (самый мелкий из подобранных): разнобой
    // 16/14/12 px на соседних плашках выглядит как ошибка вёрстки.
    const titleSize = Math.min(...geo.map((g) => g.size));

    for (let i = 0; i < geo.length; i++) {
      const { title, slot, bx, hasIcon, textX, maxW } = geo[i];
      ctx.font = titleFont(titleSize);
      const line = wrapLines(ctx, title, maxW, 3);
      // Плашка не ниже, чем нужно тексту: box от vision — подсказка, а не предел.
      const midY = bx.y + bx.h / 2;
      const needH = line.length * titleSize * 1.24 + padX * 1.2;
      if (needH > bx.h) {
        bx.y = midY - needH / 2;
        bx.h = needH;
      }

      if (editorial) {
        // editorial: no plate — a thin accent bar + text (premium, airy)
        ctx.fillStyle = t.palette.accent;
        roundRect(ctx, bx.x, midY - 18 * s, 5 * s, 36 * s, 3 * s);
        ctx.fill();
      } else {
        // frosted/clean card surface + soft shadow
        ctx.save();
        ctx.shadowColor = t.shadow.medium;
        ctx.shadowBlur = 22 * s;
        ctx.shadowOffsetY = 6 * s;
        ctx.fillStyle = t.palette.surface;
        roundRect(ctx, bx.x, bx.y, bx.w, bx.h, cardRadius * s);
        ctx.fill();
        ctx.restore();

        if (hasIcon) {
          // accent chip + dot
          ctx.fillStyle = hexToRgba(t.palette.accent, 0.18);
          roundRect(ctx, bx.x + padX - 4 * s, midY - 22 * s, 44 * s, 44 * s, 12 * s);
          ctx.fill();
          ctx.fillStyle = t.palette.accent;
          ctx.beginPath();
          ctx.arc(bx.x + padX + 18 * s, midY, 9 * s, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // title — строки по центру плашки по вертикали
      ctx.font = titleFont(titleSize);
      ctx.fillStyle = t.palette.textPrimary;
      ctx.textBaseline = "middle";
      const lineH = titleSize * 1.24;
      const firstY = midY - ((line.length - 1) * lineH) / 2;
      line.forEach((ln, k) => ctx.fillText(ln, textX, firstY + k * lineH));
      ctx.textBaseline = "top";
    }
  }

  return canvas;
}

/** Draw just the base image (cover-fit) — used when the text is baked in. */
async function renderBaseOnly(
  baseSrc: string,
  width: number,
  height: number,
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
  const iw = img.width * scale;
  const ih = img.height * scale;
  ctx.drawImage(img, (width - iw) / 2, (height - ih) / 2, iw, ih);
  return canvas;
}

/** Small preview data URL for the live canvas. */
export async function renderInfographicPreview(
  baseSrc: string,
  brief: InfographicBrief,
  previewWidth = 480,
): Promise<string> {
  const height = Math.round(previewWidth * (1200 / 900));
  const canvas = await renderToCanvas(baseSrc, previewWidth, height, brief);
  return canvas.toDataURL("image/png");
}

export async function exportInfographicCard(
  baseSrc: string,
  preset: ExportPreset,
  format: ExportFormat,
  brief: InfographicBrief,
  baseName = "wb-infographic",
  skipOverlay = false,
) {
  const canvas = skipOverlay
    ? await renderBaseOnly(baseSrc, preset.width, preset.height)
    : await renderToCanvas(baseSrc, preset.width, preset.height, brief);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Не удалось создать файл."))),
      format === "png" ? "image/png" : "image/jpeg",
      0.92,
    ),
  );
  downloadBlob(blob, `${baseName}-${preset.width}x${preset.height}.${format}`);
}
