import type { CreativeTypeId } from "./types";

/**
 * Типы креативов и их размеры.
 *
 * ДВА ЖЁСТКИХ ПРАВИЛА, проверенных живыми запросами к gpt-image 2026-09-10 —
 * нарушишь, и человек получит не то, что выбрал:
 *
 * 1. Стороны кратны 16. Модель округляет их сама: заказали 1080×1080 — пришло
 *    1072×1072, заказали 1080×1920 — пришло 1072×1920.
 * 2. Пропорция строго от 1:3 до 3:1. Всё, что вытянутее, отклоняется с ошибкой
 *    «Requested image_size aspect ratio 3.20:1 exceeds the maximum supported
 *    3:1». Из-за этого обложка сообщества ВК (1590×400 = 3,97:1) НЕДОСТУПНА —
 *    и подсовывать вместо неё 3:1 молча нельзя.
 *
 * Проверены и приходят точь-в-точь: 1024×1024, 1280×720, 1008×1792,
 * 2560×1440, 1104×640.
 */
export type BannerFormat = {
  id: string;
  label: string;
  hint: string;
  width: number;
  height: number;
  /**
   * Раскладка под пропорцию — словами для модели. Без неё на широком кадре
   * gpt-image рисует композицию по центру и оставляет края пустыми
   * (проверено на 1200×400).
   */
  layout: string;
};

export type CreativeType = {
  id: CreativeTypeId;
  label: string;
  hint: string;
  /** чем этот кадр является по сути — уходит в промпт */
  intent: string;
  formats: BannerFormat[];
};

const WIDE_LAYOUT =
  "Wide horizontal composition: split the frame into two halves — the subject fills one side edge-to-edge, the text block is set large on the other side and vertically centred. Use the FULL width; never centre a small island of content with empty space at the left and right edges.";
const SQUARE_LAYOUT =
  "Square composition: the subject is the hero slightly off-centre, the text block occupies the upper third in large type. Balance mass across the frame — no large empty corners.";
const TALL_LAYOUT =
  "Tall vertical composition: stack the frame — text across the upper area, the subject large in the middle, breathing room below. Use the full height; never leave the top third empty.";

export const CREATIVE_TYPES: CreativeType[] = [
  {
    id: "banner",
    label: "Рекламный баннер",
    hint: "Для сайта, Яндекс.Директа и рекламных мест",
    intent:
      "a promotional advertising banner that drives a click to a website — an ad creative, not a marketplace product card",
    formats: [
      {
        id: "square",
        label: "Квадрат 1:1",
        hint: "Универсальный, лента соцсетей",
        width: 1024,
        height: 1024,
        layout: SQUARE_LAYOUT,
      },
      {
        id: "wide",
        label: "Горизонтальный 16:9",
        hint: "Шапка сайта, широкие места",
        width: 1280,
        height: 720,
        layout: WIDE_LAYOUT,
      },
      {
        id: "story",
        label: "Вертикальный 9:16",
        hint: "Сторис и вертикальные места",
        width: 1008,
        height: 1792,
        layout: TALL_LAYOUT,
      },
    ],
  },
  {
    id: "social-post",
    label: "Пост для соцсетей",
    hint: "Картинка в ленту или сторис",
    intent:
      "a social media post image that stops the scroll — friendly and conversational, less hard-sell than a paid ad banner",
    formats: [
      {
        id: "post-square",
        label: "Квадрат 1:1",
        hint: "Классический пост",
        width: 1024,
        height: 1024,
        layout: SQUARE_LAYOUT,
      },
      {
        id: "post-portrait",
        label: "Вертикальный 4:5",
        hint: "Занимает больше экрана в ленте",
        width: 1024,
        height: 1280,
        layout: TALL_LAYOUT,
      },
      {
        id: "post-story",
        label: "Сторис 9:16",
        hint: "На весь экран телефона",
        width: 1008,
        height: 1792,
        layout: TALL_LAYOUT,
      },
    ],
  },
  {
    id: "profile-header",
    label: "Шапка профиля",
    hint: "Обложка канала или сообщества",
    intent:
      "a channel/profile cover image that presents the brand at a glance — calm and brand-forward, not a hard-sell ad",
    formats: [
      {
        id: "header-youtube",
        label: "YouTube 2560 × 1440",
        hint: "Официальный размер обложки канала",
        width: 2560,
        height: 1440,
        // У YouTube всё, кроме центральной полосы, обрезается на телефонах.
        // Проверено 2026-09-10: общей формулировки «средние 30 % высоты» модели
        // мало — заголовок вылезал выше полосы. Полосу называем в пикселях.
        layout:
          "Wide 16:9 cover. CRITICAL SAFE AREA: the frame is 2560×1440, but on phones only a centred rectangle of 1546×423 pixels stays visible — that is the middle 60% of the width and just the middle 29% of the height, roughly from y=509 to y=932. EVERY piece of text, the logo area and the subject's face must fit ENTIRELY inside that centred rectangle; scale the whole text block down if needed. Outside it put background only — it will be cropped away.",
      },
      {
        id: "header-wide",
        label: "Широкая 3:1 (1536 × 512)",
        hint: "Шапка сайта и большинство обложек",
        width: 1536,
        height: 512,
        layout:
          "Very wide 3:1 banner strip. Spread the composition across the FULL width: subject on one side, text on the other, both vertically centred. Never leave the left and right thirds empty.",
      },
    ],
  },
  {
    id: "business-card",
    label: "Визитка",
    hint: "Под печать, 90 × 50 мм",
    intent:
      "one side of a printed business card — restrained and professional, contact details are the point, not a sales pitch",
    formats: [
      {
        id: "card-landscape",
        label: "Горизонтальная",
        hint: "1104 × 640 — 90 × 50 мм с полями под подрезку",
        width: 1104,
        height: 640,
        layout:
          "Business card layout: a calm, uncluttered surface. Keep ALL text and marks well inside the frame — at least 6% margin from every edge, because the printer trims the outer border. Restrained composition, generous empty space, no busy scene. Do NOT draw a decorative border or frame running along the edges: the printer trims 2 mm unevenly and a border comes out crooked.",
      },
      {
        id: "card-portrait",
        label: "Вертикальная",
        hint: "640 × 1104 — тот же размер, повёрнутый",
        width: 640,
        height: 1104,
        layout:
          "Vertical business card layout: a calm, uncluttered surface, elements stacked. Keep ALL text and marks at least 6% away from every edge — the printer trims the outer border. Restrained, generous empty space. Do NOT draw a decorative border or frame running along the edges: the printer trims 2 mm unevenly and a border comes out crooked.",
      },
    ],
  },
];

export function getCreativeType(id: CreativeTypeId): CreativeType {
  return CREATIVE_TYPES.find((t) => t.id === id) ?? CREATIVE_TYPES[0];
}

export function getFormat(typeId: CreativeTypeId, formatId: string): BannerFormat {
  const type = getCreativeType(typeId);
  return type.formats.find((f) => f.id === formatId) ?? type.formats[0];
}

/** Все форматы разом — для проверок и для сервера. */
export const ALL_FORMAT_IDS = CREATIVE_TYPES.flatMap((t) => t.formats.map((f) => f.id));

/** Страховка на случай правки таблицы: приводим сторону к кратному 16. */
export function snapTo16(n: number): number {
  return Math.max(16, Math.round(n / 16) * 16);
}

/** Предел gpt-image по вытянутости кадра. */
export const MAX_ASPECT = 3;

/**
 * Проверка размера перед отправкой. Лучше внятный отказ здесь, чем невнятная
 * ошибка от модели после того, как гены уже зарезервированы.
 */
export function checkSize(width: number, height: number): string | null {
  if (width % 16 || height % 16) {
    return `Размер ${width}×${height} не кратен 16 — модель округлит его и вернёт не тот кадр.`;
  }
  const ratio = Math.max(width / height, height / width);
  if (ratio > MAX_ASPECT + 1e-6) {
    return `Пропорция ${ratio.toFixed(2)}:1 слишком вытянутая — модель принимает от 1:3 до 3:1.`;
  }
  return null;
}
