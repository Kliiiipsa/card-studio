"use client";
import * as React from "react";
import { downloadBlob } from "@/core/rendering/export";
import {
  overlayLayout,
  OVERLAY_COLORS,
  hasOverlayContent,
  SCRIM_RAMP,
} from "@/core/banners/overlay";
import type { BannerLook, BannerOverlay } from "@/core/banners/types";

/**
 * Превью баннера = картинка модели + накладной слой сайта.
 *
 * Рисуем в canvas в НАСТОЯЩЕМ размере кадра, а на экране показываем через CSS.
 * Поэтому то, что человек видит, и то, что он скачает, — один и тот же холст:
 * экспорт ничего не пересчитывает, не обрезает и не растягивает.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  // S3-адреса тянем через свой прокси, иначе canvas «пачкается» и toBlob падает
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

async function fontsReady(): Promise<void> {
  try {
    if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
  } catch {
    /* нет Font Loading API — считаем системными метриками */
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
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

const FONT = '"Segoe UI", -apple-system, system-ui, Roboto, "Helvetica Neue", Arial, sans-serif';

export type BannerPreviewProps = {
  imageUrl: string;
  width: number;
  height: number;
  look: BannerLook;
  overlay: BannerOverlay;
};

/**
 * Рисует кадр целиком. Вынесено из компонента, чтобы одна и та же функция
 * готовила и превью, и файл на скачивание — расхождения между ними быть не может.
 */
async function paint(canvas: HTMLCanvasElement, props: BannerPreviewProps): Promise<void> {
  const { imageUrl, width, height, look, overlay } = props;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = width;
  canvas.height = height;

  const [img] = await Promise.all([loadImage(imageUrl), fontsReady()]);

  // Картинка модели приходит ровно в заказанном размере, но если провайдер
  // когда-нибудь отдаст другой — вписываем по центру с сохранением пропорций,
  // а не растягиваем: искажённый товар хуже полей.
  const scale = Math.max(width / img.width, height / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);

  if (!hasOverlayContent(overlay)) return;

  const L = overlayLayout(width, height);
  const C = OVERLAY_COLORS[look];
  const price = overlay.price?.trim();
  const oldPrice = overlay.oldPrice?.trim();
  const cta = overlay.cta?.trim();
  const site = overlay.site?.trim();

  const drawsBand = Boolean(price || cta || site);
  if (drawsBand) {
    // Градиент, а не ровная плашка: модель не всегда полностью освобождает низ,
    // и жёсткий край срезал бы товар. Начинаем чуть выше полосы, к SCRIM_RAMP
    // выходим на полную плотность — дальше сплошной фон под текст.
    const start = L.band.y - L.band.h * 0.25;
    const grad = ctx.createLinearGradient(0, start, 0, height);
    const rampAt = (L.band.y - start + L.band.h * SCRIM_RAMP) / (height - start);
    grad.addColorStop(0, C.scrimTop);
    grad.addColorStop(Math.min(0.99, rampAt), C.scrim);
    grad.addColorStop(1, C.scrim);
    ctx.fillStyle = grad;
    ctx.fillRect(0, start, width, height - start);
  }

  const midY = L.band.y + L.band.h / 2;
  let ctaRight = L.band.w - L.padding;

  // Кнопка — справа: главный элемент действия, ширина по тексту
  if (cta) {
    ctx.font = `600 ${L.ctaSize}px ${FONT}`;
    const textW = ctx.measureText(cta).width;
    const padX = L.ctaHeight * 0.55;
    const btnW = textW + padX * 2;
    const btnX = L.band.w - L.padding - btnW;
    const btnY = midY - L.ctaHeight / 2;
    ctx.fillStyle = C.ctaBg;
    roundRect(ctx, btnX, btnY, btnW, L.ctaHeight, L.ctaRadius);
    ctx.fill();
    ctx.fillStyle = C.ctaText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cta, btnX + btnW / 2, midY + L.ctaSize * 0.04);
    ctaRight = btnX;
  }

  // Слева — цена, под ней адрес сайта. Если цены нет, адрес встаёт на её место.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const leftX = L.padding;
  const maxLeftW = Math.max(0, ctaRight - leftX - L.padding);

  if (price) {
    // Цена и адрес — один блок: центрируем ПАРУ по середине полосы, иначе
    // адрес свисает к самому краю кадра и почти не читается.
    const gap = L.siteSize * 0.55;
    const stackH = site ? L.priceSize + gap + L.siteSize : L.priceSize;
    const priceY = midY - stackH / 2 + L.priceSize;
    ctx.font = `700 ${L.priceSize}px ${FONT}`;
    ctx.fillStyle = C.text;
    ctx.fillText(price, leftX, priceY, maxLeftW);
    if (oldPrice) {
      const priceW = Math.min(ctx.measureText(price).width, maxLeftW);
      ctx.font = `400 ${L.oldPriceSize}px ${FONT}`;
      ctx.fillStyle = C.textMuted;
      const oldX = leftX + priceW + L.oldPriceSize * 0.6;
      ctx.fillText(oldPrice, oldX, priceY);
      // зачёркивание — по фактической ширине текста
      const oldW = ctx.measureText(oldPrice).width;
      ctx.strokeStyle = C.textMuted;
      ctx.lineWidth = Math.max(1, L.oldPriceSize * 0.08);
      ctx.beginPath();
      ctx.moveTo(oldX, priceY - L.oldPriceSize * 0.3);
      ctx.lineTo(oldX + oldW, priceY - L.oldPriceSize * 0.3);
      ctx.stroke();
    }
    if (site) {
      ctx.font = `600 ${L.siteSize}px ${FONT}`;
      ctx.fillStyle = C.textMuted;
      ctx.fillText(site, leftX, priceY + gap + L.siteSize, maxLeftW);
    }
  } else if (site) {
    ctx.font = `600 ${L.siteSize * 1.25}px ${FONT}`;
    ctx.fillStyle = C.text;
    ctx.textBaseline = "middle";
    ctx.fillText(site, leftX, midY, maxLeftW);
    ctx.textBaseline = "alphabetic";
  }

  // Логотип — левый верхний угол, на мягкой подложке, пропорции сохраняются
  if (overlay.logo) {
    try {
      const logo = await loadImage(overlay.logo);
      const k = Math.min(L.logo.w / logo.width, L.logo.h / logo.height);
      const lw = logo.width * k;
      const lh = logo.height * k;
      const pad = lh * 0.28;
      ctx.fillStyle = C.logoScrim;
      roundRect(ctx, L.logo.x - pad, L.logo.y - pad, lw + pad * 2, lh + pad * 2, L.logoRadius);
      ctx.fill();
      ctx.drawImage(logo, L.logo.x, L.logo.y, lw, lh);
    } catch {
      /* битый логотип не должен ронять весь баннер */
    }
  }
}

export type BannerPreviewHandle = { download: () => Promise<void> };

/**
 * Холст с готовым баннером. Скачивание вынесено наружу через ref, чтобы кнопка
 * жила рядом с остальными действиями страницы, а рисование осталось здесь.
 */
export const BannerPreview = React.forwardRef<BannerPreviewHandle, BannerPreviewProps>(
  function BannerPreview({ imageUrl, width, height, look, overlay }, ref) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
      let cancelled = false;
      void (async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        try {
          await paint(canvas, { imageUrl, width, height, look, overlay });
          if (!cancelled) setError(null);
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось нарисовать баннер");
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [imageUrl, width, height, look, overlay]);

    React.useImperativeHandle(
      ref,
      () => ({
        download: async () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
          if (blob) downloadBlob(blob, `banner-${width}x${height}.png`);
        },
      }),
      [width, height],
    );

    return (
      <div className="space-y-2">
        <canvas
          ref={canvasRef}
          className="mx-auto block h-auto max-h-[60vh] w-auto max-w-full rounded-lg border shadow-sm"
          style={{ aspectRatio: `${width} / ${height}` }}
        />
        {error ? <p className="text-center text-xs text-destructive">{error}</p> : null}
      </div>
    );
  },
);
