import type { BannerFormatId } from "./types";

/**
 * Форматы баннера.
 *
 * ВСЕ размеры кратны 16 — это не украшательство. gpt-image-2 округляет стороны
 * до кратного 16 (проверено 2026-09-10: заказали 1080×1080 — пришло 1072×1072,
 * заказали 1080×1920 — пришло 1072×1920). Если положить сюда некратное число,
 * человек выберет один размер, а скачает другой, и не узнает об этом. Именно
 * такую молчаливую подмену мы и вычищаем, так что правило простое:
 * ширина и высота ОБЯЗАНЫ делиться на 16.
 *
 * Размеры ниже проверены живыми генерациями (1280×720 — точное попадание,
 * 1024×1024 и высота 1792 — тоже). Это универсальные пропорции, а НЕ «размеры
 * под Яндекс.Директ»: точные требования площадок надо сверять с их справкой,
 * и пока мы этого не сделали, обещать соответствие в интерфейсе нельзя.
 */
export type BannerFormat = {
  id: BannerFormatId;
  label: string;
  hint: string;
  width: number;
  height: number;
  ratio: string;
  /**
   * Раскладка под пропорцию — словами для модели. Без неё на широком кадре
   * gpt-image рисует композицию по центру, оставляя треть ширины слева и треть
   * справа пустыми (проверено на 1200×400). Пропорцию модель соблюдает честно,
   * а вот перестраивать композицию под неё сама не догадывается.
   */
  layout: string;
};

export const BANNER_FORMATS: BannerFormat[] = [
  {
    id: "square",
    label: "Квадрат 1:1",
    hint: "Лента соцсетей, универсальный вариант",
    width: 1024,
    height: 1024,
    ratio: "1:1",
    layout:
      "Square composition: the product is the hero slightly off-centre, the headline occupies the upper third in large type. Balance mass across the frame — no large empty corners.",
  },
  {
    id: "wide",
    label: "Горизонтальный 16:9",
    hint: "Шапка сайта, широкие рекламные места",
    width: 1280,
    height: 720,
    ratio: "16:9",
    layout:
      "Wide horizontal composition: split the frame into two halves — the product fills one side edge-to-edge, the headline is set large on the other side and is vertically centred. Use the FULL width; never centre a small island of content with empty space at the left and right edges.",
  },
  {
    id: "story",
    label: "Вертикальный 9:16",
    hint: "Сторис и вертикальные плейсменты",
    width: 1008,
    height: 1792,
    ratio: "9:16",
    layout:
      "Tall vertical composition: stack the frame — headline across the upper area, the product large in the middle, breathing room below. Use the full height; never leave the top third empty.",
  },
];

export function getBannerFormat(id: BannerFormatId): BannerFormat {
  return BANNER_FORMATS.find((f) => f.id === id) ?? BANNER_FORMATS[0];
}

/** Страховка: любой размер приводим к кратному 16, чтобы модель ничего не подменила молча. */
export function snapTo16(n: number): number {
  return Math.max(16, Math.round(n / 16) * 16);
}
