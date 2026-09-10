import type { BannerLook } from "./types";

/**
 * Геометрия накладного слоя (цена, кнопка, адрес, логотип).
 *
 * Всё считается от реального размера кадра, поэтому одна и та же раскладка
 * работает и на квадрате, и на сторис — и совпадает с той чистой полосой,
 * которую мы просим модель оставить внизу (см. banner-prompt-builder).
 *
 * Pure module: и превью на клиенте, и экспорт рисуют по одним и тем же числам,
 * так что скачанный файл выглядит ровно как превью.
 */

export type Box = { x: number; y: number; w: number; h: number };

export type OverlayLayout = {
  /** нижняя полоса под накладку — та самая, что модель держит спокойной */
  band: Box;
  padding: number;
  priceSize: number;
  oldPriceSize: number;
  siteSize: number;
  ctaHeight: number;
  ctaSize: number;
  ctaRadius: number;
  logo: Box;
  logoRadius: number;
};

/** Доля короткой стороны, которую занимает нижняя полоса. */
const BAND_SHARE = 0.2;
const BAND_MIN = 90;
const BAND_MAX = 260;

export function overlayLayout(width: number, height: number): OverlayLayout {
  const short = Math.min(width, height);
  const band = Math.round(Math.min(BAND_MAX, Math.max(BAND_MIN, short * BAND_SHARE)));
  const padding = Math.round(band * 0.22);
  return {
    band: { x: 0, y: height - band, w: width, h: band },
    padding,
    priceSize: Math.round(band * 0.38),
    oldPriceSize: Math.round(band * 0.2),
    siteSize: Math.round(band * 0.18),
    ctaHeight: Math.round(band * 0.5),
    ctaSize: Math.round(band * 0.2),
    ctaRadius: Math.round(band * 0.25),
    logo: {
      x: padding,
      y: padding,
      w: Math.round(width * 0.22),
      h: Math.round(height * 0.075),
    },
    logoRadius: Math.round(short * 0.012),
  };
}

export type OverlayColors = {
  /**
   * Подложка полосы. Рисуется градиентом от `scrimTop` (прозрачный) к `scrim`
   * (плотный): модель не всегда полностью освобождает низ кадра — товар
   * заходит в полосу, — и ровная плашка режет его как ножом. Градиент делает
   * переход намеренным, а не аварийным.
   */
  scrimTop: string;
  scrim: string;
  text: string;
  textMuted: string;
  /** заливка кнопки */
  ctaBg: string;
  ctaText: string;
  /** подложка под логотип */
  logoScrim: string;
};

/** Доля высоты полосы, на которой градиент выходит на полную плотность. */
export const SCRIM_RAMP = 0.4;

/**
 * Цвета накладки по выбранному оформлению. Тот же смысл, что `mode` в
 * инфографике: light = светлая подложка и тёмный текст.
 */
export const OVERLAY_COLORS: Record<BannerLook, OverlayColors> = {
  light: {
    scrimTop: "rgba(255,255,255,0)",
    scrim: "rgba(255,255,255,0.95)",
    text: "#111827",
    textMuted: "#6b7280",
    ctaBg: "#111827",
    ctaText: "#ffffff",
    logoScrim: "rgba(255,255,255,0.85)",
  },
  dark: {
    scrimTop: "rgba(10,12,18,0)",
    scrim: "rgba(10,12,18,0.93)",
    text: "#f8fafc",
    textMuted: "#9aa5b8",
    ctaBg: "#f8fafc",
    ctaText: "#0b0e14",
    logoScrim: "rgba(10,12,18,0.7)",
  },
  bright: {
    scrimTop: "rgba(255,255,255,0)",
    scrim: "rgba(255,255,255,0.95)",
    text: "#111827",
    textMuted: "#6b7280",
    ctaBg: "#e11d48",
    ctaText: "#ffffff",
    logoScrim: "rgba(255,255,255,0.85)",
  },
};

/** Есть ли вообще что рисовать поверх картинки. */
export function hasOverlayContent(o: {
  price?: string;
  oldPrice?: string;
  cta?: string;
  site?: string;
  logo?: string;
}): boolean {
  return Boolean(o.price?.trim() || o.cta?.trim() || o.site?.trim() || o.logo);
}
