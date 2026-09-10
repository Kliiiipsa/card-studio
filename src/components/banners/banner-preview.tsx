"use client";
import * as React from "react";
import { downloadBlob } from "@/core/rendering/export";
import type { BannerLogo } from "@/core/banners/types";

/**
 * Готовый креатив = кадр модели + настоящий логотип поверх.
 *
 * Весь ТЕКСТ печёт модель — цену, кнопку, телефон, домен. Канвас здесь нужен
 * только ради логотипа: фирменный знак модель не копирует, а перерисовывает по
 * мотивам, поэтому его кладём точными пикселями пользователя.
 *
 * Холст в НАСТОЯЩЕМ размере кадра, на экране показывается через CSS: то, что
 * человек видит, и то, что он скачает, — один и тот же холст.
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

export type BannerPreviewProps = {
  imageUrl: string;
  width: number;
  height: number;
  logo?: BannerLogo | null;
};

/** Доля кадра, которую занимает логотип, и отступ от края. */
const LOGO_SHARE = 0.16;
const LOGO_MARGIN = 0.045;

async function paint(canvas: HTMLCanvasElement, props: BannerPreviewProps): Promise<void> {
  const { imageUrl, width, height, logo } = props;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = width;
  canvas.height = height;

  const img = await loadImage(imageUrl);
  // Кадр приходит ровно в заказанном размере, но если провайдер когда-нибудь
  // отдаст другой — вписываем по центру, а не растягиваем: искажённый товар
  // хуже полей.
  const scale = Math.max(width / img.width, height / img.height);
  ctx.drawImage(
    img,
    (width - img.width * scale) / 2,
    (height - img.height * scale) / 2,
    img.width * scale,
    img.height * scale,
  );

  if (!logo?.image) return;
  try {
    const mark = await loadImage(logo.image);
    const box = Math.min(width, height) * LOGO_SHARE;
    const k = Math.min(box / mark.width, box / mark.height);
    const lw = mark.width * k;
    const lh = mark.height * k;
    const margin = Math.min(width, height) * LOGO_MARGIN;
    const x = logo.corner === "top-right" ? width - margin - lw : margin;
    ctx.drawImage(mark, x, margin, lw, lh);
  } catch {
    /* битый логотип не должен ронять весь креатив */
  }
}

export type BannerPreviewHandle = {
  download: () => Promise<void>;
  /** готовый кадр как data URL — уходит на сервер вместо файла без логотипа */
  toDataUrl: () => string | null;
};

export const BannerPreview = React.forwardRef<BannerPreviewHandle, BannerPreviewProps>(
  function BannerPreview({ imageUrl, width, height, logo }, ref) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
      let cancelled = false;
      void (async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        try {
          await paint(canvas, { imageUrl, width, height, logo });
          if (!cancelled) setError(null);
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось нарисовать кадр");
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [imageUrl, width, height, logo]);

    React.useImperativeHandle(
      ref,
      () => ({
        download: async () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
          if (blob) downloadBlob(blob, `kartogen-${width}x${height}.png`);
        },
        toDataUrl: () => {
          try {
            return canvasRef.current?.toDataURL("image/png") ?? null;
          } catch {
            return null;
          }
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
