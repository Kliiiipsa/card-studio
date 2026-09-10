/**
 * Обрезка логотипа до его настоящих границ.
 *
 * Зачем: люди приносят логотип не «как надо», а как скачался. Три частых случая:
 *  1. честный PNG с прозрачностью — режем по альфе;
 *  2. знак на сплошной заливке (белой или цветной) — режем по ней;
 *  3. САМЫЙ вредный: «шахматка» прозрачности, запечённая в пиксели. Человек
 *     скачал превью из редактора, и клетчатый фон стал частью картинки.
 *     Именно этот случай был в примере владельца (буква «К»).
 *
 * Решать это нейросетью незачем: границы знака вычисляются точно и бесплатно.
 * Общий приём один — собрать цвета фона из рамки по краю кадра и найти рамку
 * тех пикселей, которые к фону не относятся. Так все три случая закрываются
 * одним кодом: прозрачность даёт один «цвет» фона, заливка — тоже один,
 * шахматка — два.
 *
 * Pure module: работает над обычным ImageData, поэтому одинаково годится и в
 * браузере, и в тестах.
 */

export type Rgba = { r: number; g: number; b: number; a: number };

export type TrimResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** обрезка реально что-то отрезала (иначе не трогаем картинку) */
  trimmed: boolean;
  /** что распознали как фон — для объяснения в интерфейсе и в логах */
  reason: "alpha" | "solid" | "checker" | "none";
};

/** Максимум цветовых кластеров фона: 1 — заливка, 2 — шахматка. Больше — не фон. */
const MAX_BG_CLUSTERS = 2;
/** Допуск на канал: JPEG-артефакты и мягкие края не должны ломать распознавание. */
const TOLERANCE = 18;
/** Пиксель считается прозрачным (и однозначно фоном) ниже этой альфы. */
const ALPHA_FLOOR = 16;

function near(a: Rgba, b: Rgba, tol = TOLERANCE): boolean {
  return Math.abs(a.r - b.r) <= tol && Math.abs(a.g - b.g) <= tol && Math.abs(a.b - b.b) <= tol;
}

function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number): Rgba {
  const i = (y * width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

/**
 * Цвета фона по рамке шириной 1 пиксель. Если по краю больше двух разных
 * цветов, значит там уже картинка, а не подложка — обрезать нельзя.
 */
function backgroundClusters(data: Uint8ClampedArray, width: number, height: number): Rgba[] | null {
  const clusters: { color: Rgba; count: number }[] = [];
  const consider = (p: Rgba) => {
    if (p.a < ALPHA_FLOOR) return; // прозрачное обрабатываем отдельно
    const hit = clusters.find((c) => near(c.color, p));
    if (hit) hit.count++;
    else clusters.push({ color: p, count: 1 });
  };
  for (let x = 0; x < width; x++) {
    consider(pixelAt(data, width, x, 0));
    consider(pixelAt(data, width, x, height - 1));
  }
  for (let y = 0; y < height; y++) {
    consider(pixelAt(data, width, 0, y));
    consider(pixelAt(data, width, width > 0 ? width - 1 : 0, y));
  }
  if (!clusters.length) return []; // рамка целиком прозрачная
  // Мелкие кластеры — это сглаживание на стыке клеток, а не отдельный цвет.
  const total = clusters.reduce((s, c) => s + c.count, 0);
  const solid = clusters.filter((c) => c.count / total >= 0.05);
  if (solid.length > MAX_BG_CLUSTERS) return null;
  return solid.map((c) => c.color);
}

/**
 * Границы знака. Возвращает исходный кадр целиком, если обрезать нечего или
 * нельзя — вызывающий код тогда просто не трогает логотип.
 */
export function findLogoBounds(image: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}): TrimResult {
  const { data, width, height } = image;
  const whole: TrimResult = { x: 0, y: 0, width, height, trimmed: false, reason: "none" };
  if (width < 8 || height < 8) return whole;

  const bg = backgroundClusters(data, width, height);
  if (bg === null) return whole; // по краю уже содержимое — не наше дело

  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < ALPHA_FLOOR) {
      hasAlpha = true;
      break;
    }
  }

  const isBackground = (p: Rgba): boolean => {
    if (p.a < ALPHA_FLOOR) return true;
    return bg.some((c) => near(c, p));
  };

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBackground(pixelAt(data, width, x, y))) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return whole; // ничего, кроме фона

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  // Обрезка меньше 2 % по обеим сторонам — шум, не стоит трогать файл
  const trimmed = w < width * 0.98 || h < height * 0.98;
  const reason: TrimResult["reason"] = hasAlpha
    ? "alpha"
    : bg.length >= 2
      ? "checker"
      : bg.length === 1
        ? "solid"
        : "none";
  return { x: minX, y: minY, width: w, height: h, trimmed, reason };
}

/** Человеческое объяснение того, что мы сделали с логотипом. */
export const TRIM_REASON_LABEL: Record<TrimResult["reason"], string> = {
  alpha: "обрезали по прозрачности",
  solid: "убрали одноцветный фон",
  checker: "убрали клетчатый фон-«прозрачность»",
  none: "оставили как есть",
};
