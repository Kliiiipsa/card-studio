/**
 * Пулы вариантов оформления креатива.
 *
 * ЗАЧЕМ. В первой версии я зашил ОДНУ раскладку на пропорцию («раздели кадр
 * пополам: объект справа, текст слева») и одну типографику. В результате все
 * креативы выходили на один шаблон — владелец это сразу увидел на своих тестах
 * 2026-09-10. Ровно та же болезнь была у инфографики и лечилась тем же
 * приёмом (см. infographics/composition-variants.ts): пул архетипов, стартовый
 * выбирается по хешу предмета рекламы, а каждая перегенерация сдвигает сид.
 *
 * Четыре независимых пула — композиция, типографика, декор и место контактов.
 * Сиды у них разные, поэтому сочетания не повторяются кучно: два креатива про
 * разное почти никогда не совпадут целиком.
 *
 * Pure module — безопасен и на сервере, и на клиенте.
 */

export type Orientation = "wide" | "square" | "tall";

export type Variant = { id: string; describe: string };

/**
 * Русские названия композиций для списка в интерфейсе. Держим отдельной картой,
 * а не полем варианта: `describe` — это текст промпта для модели, и мешать его
 * с подписью для человека значит однажды случайно отправить одно вместо другого.
 */
export const COMPOSITION_LABELS: Record<string, string> = {
  "split-text-left": "Текст слева, фото справа",
  "split-text-right": "Фото слева, текст справа",
  "full-bleed-overlay": "Фото во весь кадр, текст поверх",
  "center-stage": "Объект по центру, заголовок сверху",
  "colour-field": "Объект на цветном поле",
  "collage-cards": "Коллаж из наклонённых панелей",
  "collage-stack": "Коллаж стопкой",
  "bottom-bar": "Цветная полоса снизу",
  "diagonal-split": "Диагональный раскол",
  "text-top": "Текст сверху, объект снизу",
  "text-top-stack": "Текст сверху стопкой",
  "text-bottom": "Объект сверху, текст снизу",
  "corner-card": "Карточка с текстом в углу",
  "side-split": "Вертикальный раскол пополам",
  "mid-band": "Цветная полоса по середине",
};

export function orientationOf(width: number, height: number): Orientation {
  const r = width / height;
  if (r > 1.2) return "wide";
  if (r < 0.85) return "tall";
  return "square";
}

/* ----------------------------- композиция ----------------------------- */

const WIDE: Variant[] = [
  {
    id: "split-text-left",
    describe:
      "Split the frame vertically: the subject fills the RIGHT side edge-to-edge, the text block occupies the LEFT side and is vertically centred.",
  },
  {
    id: "split-text-right",
    describe:
      "Split the frame vertically: the subject fills the LEFT side edge-to-edge, the text block occupies the RIGHT side, right-aligned and vertically centred.",
  },
  {
    id: "full-bleed-overlay",
    describe:
      "The photograph fills the ENTIRE frame edge to edge. The text sits directly on top of it, over a soft darkened gradient on one side that keeps it readable. No panel, no box — the type lives inside the photo.",
  },
  {
    id: "center-stage",
    describe:
      "The subject stands large in the CENTRE of the frame. The headline arcs across the upper area above it, spanning most of the width, and the smaller lines sit low. Symmetrical and confident.",
  },
  {
    id: "colour-field",
    describe:
      "The subject is cut out and placed over a flat or softly graduated COLOUR FIELD rather than a photographic scene. The oversized headline sits behind and slightly overlaps the subject, so type and object interlock.",
  },
  {
    id: "collage-cards",
    describe:
      "Collage composition: two or three rectangular panels with rounded corners and soft drop shadows, slightly tilted at different angles, holding views of the subject. The headline overlaps the panels. Lively and designed, like a poster, not a plain photo.",
  },
  {
    id: "bottom-bar",
    describe:
      "The photograph occupies the upper two-thirds. A solid accent-coloured bar runs across the BOTTOM third and holds the headline in reversed (knocked-out) type.",
  },
  {
    id: "diagonal-split",
    describe:
      "A bold diagonal edge divides the frame: a solid colour area on one side carries the text, the photograph fills the other. The diagonal should feel deliberate and graphic.",
  },
];

const SQUARE: Variant[] = [
  {
    id: "text-top",
    describe:
      "The text block occupies the upper third across the full width; the subject sits large below it, filling the lower two-thirds.",
  },
  {
    id: "text-bottom",
    describe:
      "The subject fills the upper two-thirds; the text block sits across the bottom third, left-aligned.",
  },
  {
    id: "full-bleed-overlay",
    describe:
      "The photograph fills the ENTIRE square. The text sits on top of it over a soft gradient scrim — no panel, the type lives inside the photo.",
  },
  {
    id: "corner-card",
    describe:
      "The photograph fills the whole square. The text sits inside a rounded card with a soft shadow, tucked into one corner and occupying about a third of the frame.",
  },
  {
    id: "colour-field",
    describe:
      "The subject is cut out and placed over a flat or softly graduated COLOUR FIELD instead of a photographic scene. The oversized headline sits behind and slightly overlaps the subject.",
  },
  {
    id: "collage-cards",
    describe:
      "Collage composition: two or three rounded panels with soft shadows, slightly tilted, holding views of the subject; the headline overlaps them. Designed like a poster, not a plain photo.",
  },
  {
    id: "side-split",
    describe:
      "Vertical split down the middle: the subject on one half edge-to-edge, the text block on the other, vertically centred.",
  },
];

const TALL: Variant[] = [
  {
    id: "text-top-stack",
    describe:
      "Stack the frame: the text block across the upper area, the subject large in the middle, calm space below.",
  },
  {
    id: "text-bottom",
    describe:
      "The subject fills the upper two-thirds; the text block sits low, across the bottom area.",
  },
  {
    id: "full-bleed-overlay",
    describe:
      "The photograph fills the ENTIRE tall frame. The text sits on top over a soft gradient scrim — no panel, the type lives inside the photo.",
  },
  {
    id: "mid-band",
    describe:
      "A horizontal accent-coloured band crosses the MIDDLE of the frame carrying the headline in reversed type; the subject appears above and continues below the band.",
  },
  {
    id: "corner-card",
    describe:
      "The photograph fills the whole frame; the text sits inside a rounded card with a soft shadow near the top or bottom edge.",
  },
  {
    id: "collage-stack",
    describe:
      "Collage: two or three rounded panels with soft shadows, slightly tilted, stacked down the frame with views of the subject; the headline overlaps them.",
  },
];

const BY_ORIENTATION: Record<Orientation, Variant[]> = {
  wide: WIDE,
  square: SQUARE,
  tall: TALL,
};

/* ----------------------------- типографика ----------------------------- */

const TYPOGRAPHY: Variant[] = [
  {
    id: "size-steps",
    describe:
      "Break the headline into 2–3 size steps, the key word largest; give that word an accent colour so the eye lands on it first.",
  },
  {
    id: "all-caps-block",
    describe:
      "Set the whole headline in heavy ALL CAPS as one tight block with narrow leading, a single colour, lines flush to a common edge. Power comes from mass, not from colour.",
  },
  {
    id: "outlined-word",
    describe:
      "Set the headline in one weight, but render ONE key word as hollow outlined letters against the solid ones — the contrast of filled and outlined carries the design.",
  },
  {
    id: "plate-word",
    describe:
      "Set the headline in a heavy sans, and place ONE key word inside a solid accent-coloured plate with rounded corners, reversed out in the background colour.",
  },
  {
    id: "editorial-serif",
    describe:
      "Set the headline in an elegant high-contrast SERIF at large size, paired with a small widely-letterspaced uppercase sans caption. Restrained and editorial.",
  },
  {
    id: "underline-accent",
    describe:
      "Set the headline in a clean heavy sans on one or two lines, and anchor it with a short thick accent-coloured rule directly beneath.",
  },
  {
    id: "stacked-mixed-weight",
    describe:
      "Stack the headline words on separate lines with alternating weights — light, then very heavy — keeping the left edge aligned so the block reads as one shape.",
  },
];

/* -------------------------------- декор -------------------------------- */

const DECOR: Variant[] = [
  {
    id: "clean",
    describe:
      "No decorative graphics at all: the strength comes from the photograph, the type and the empty space.",
  },
  {
    id: "accent-shapes",
    describe:
      "Add a few restrained geometric accents in the accent colour — a thick rule, a corner bracket, a soft circle behind the subject — echoing the palette without crowding.",
  },
  {
    id: "soft-glow",
    describe:
      "Add soft atmospheric accents: a gentle glow behind the subject, faint bokeh or light streaks that support the mood.",
  },
  {
    id: "badges",
    describe:
      "Add one or two small rounded badges in the accent colour carrying VERY short labels taken only from the text provided — never invent new words for them.",
  },
  {
    id: "paper-layers",
    describe:
      "Build the background from two or three layered shapes with soft shadows, like cut paper, so the composition gains depth.",
  },
  {
    id: "brush-accent",
    describe:
      "Add one expressive hand-drawn accent — a brush stroke, a circled word or a curved arrow — used exactly once, as the single playful detail.",
  },
];

/* ---------------------------- место контактов ---------------------------- */

/**
 * ГДЕ стоят второстепенные элементы. `{items}` подставляется списком тех, что
 * реально заданы.
 *
 * Раньше здесь было перечисление «price, button, phone and website» вписанное
 * в текст. Модель читала слово «button» и рисовала кнопку даже тогда, когда
 * человек её не заказывал — в тесте 2026-09-10 из четырёх кадров три получили
 * выдуманную кнопку (пустую, со стрелкой и с курсором). Это ровно то самое
 * «не выдумывай», которое мы запрещаем в остальном промпте.
 */
const CONTACT_PLACEMENT: Variant[] = [
  {
    id: "under-text",
    describe: "Group {items} directly beneath the headline block, aligned to the same edge.",
  },
  {
    id: "bottom-strip",
    describe:
      "Lay {items} out along the BOTTOM of the frame as one horizontal row, evenly spaced and vertically aligned.",
  },
  {
    id: "opposite-corner",
    describe: "Keep {items} together as one small tidy group in a corner away from the headline.",
  },
];

/* ------------------------------- выборка ------------------------------- */

/** Стабильный маленький хеш: у каждого предмета рекламы свой стартовый вариант. */
export function hashSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

export type CreativeVariants = {
  composition: Variant;
  typography: Variant;
  decor: Variant;
  contacts: Variant;
};

/**
 * Смещения сида у пулов разные и взаимно простые с их длинами — иначе при
 * сдвиге на единицу все четыре пула проворачивались бы синхронно и «другая
 * композиция» давала бы предсказуемо ту же связку.
 */
export function pickVariants(args: {
  subject: string;
  orientation: Orientation;
  /** растёт на каждой перегенерации — следующая связка */
  variantSeed: number;
  /** ручной выбор композиции (id), если человек его сделал */
  compositionId?: string;
}): CreativeVariants {
  const base = hashSeed(args.subject) + args.variantSeed;
  const pool = BY_ORIENTATION[args.orientation];
  const composition =
    (args.compositionId && pool.find((v) => v.id === args.compositionId)) || pick(pool, base);
  return {
    composition,
    typography: pick(TYPOGRAPHY, base * 7 + 3),
    decor: pick(DECOR, base * 13 + 5),
    contacts: pick(CONTACT_PLACEMENT, base * 5 + 1),
  };
}

/** Список композиций под пропорцию — для ручного выбора в интерфейсе. */
export function compositionsFor(orientation: Orientation): Variant[] {
  return BY_ORIENTATION[orientation];
}
