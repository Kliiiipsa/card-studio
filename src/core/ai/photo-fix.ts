/**
 * «Фото товара» — пакет исправлений по разбору журнала генераций 2026-09-06.
 *
 * Что нашли (115 генераций по фото за месяц):
 *  - серверный «предохранитель» sanitizeImagePrompt резал промпт у 84 из 115,
 *    у 31 описание товара пропадало ПОЛНОСТЬЮ: регулярка /текст/ ловила
 *    «текстура» (50 раз) и «жизненный контекст» (14), а /заголов/ — нашу же
 *    фразу «пространство сверху для заголовка» (32). В модель уходило только
 *    «Сценарий фото: Студийный фон…», и человек получал не то, что видел в поле;
 *  - 29 промптов просили текст/преимущества на фото — раздел этого не делает,
 *    Seedream рисовал английскую кашу («Heavy-Duty Durability»);
 *  - в сценарии «Студийный фон» модель оставляла пыль, кабели и обрезала товар.
 *
 * Гейт: сейчас только админ; раскатка на всех = env PHOTO_FIX=all без правки
 * кода (тот же приём, что INFOGRAPHIC_ADAPTIVE).
 *
 * Pure-модуль: используется и на клиенте (форма), и на сервере (роут).
 */

export function photoFixEnabled(role?: string | null): boolean {
  return role === "admin" || process.env.PHOTO_FIX === "all";
}

/**
 * Вторая волна «Фото товара» (2026-09-08, разбор владельца): студийный фон
 * переосвещаем вместо «вырезал и залил белым», кнопка «Написать промпт»
 * становится «Подсказать задание» (инструкция, а не описание фото), под полем —
 * готовые задачи-кнопки. Гейт тот же приём: админ, потом PHOTO_V2=all.
 */
export function photoV2Enabled(role?: string | null): boolean {
  return role === "admin" || process.env.PHOTO_V2 === "all";
}

/** Зачем пришёл запрос генерации по фото — от этого зависит фильтрация. */
export type GeneratePurpose = "photo" | "improve";

/**
 * Пользователь просит текст/плашки/преимущества НА фото — это раздел
 * «Инфографика». Ловим по намерению, не по форме: «опиши преимущества»,
 * «сбоку написаны плюсы», «с текстом», «сделай карточку». Слова вроде
 * «текстура» и «контекст» сюда не попадают — границы слов через \p{L}.
 */
const TEXT_STRONG =
  /(?<!\p{L})(?:преимуществ|плюс(?:ы|ов)|инфограф|плашк|характеристик|с\s+текстом|опиши|слоган)/iu;
/** «напиши/добавь/размести/укажи … текст/надпись/цену/плашку» — просьба, а
 *  не описание товара («клюшка с надписями», «шампунь без надписей» — нет) */
const TEXT_VERB =
  /(?<!\p{L})(?:напи[сш]|добав|размест|укаж|встав|вывед|нанес|напечат|подпиш)\p{L}*(?:\s+\p{L}+){0,4}\s+(?:текст(?!ур)|надпис|заголов|цен[ауы]|скидк|акци|плашк|логотип|состав|размер)/iu;

export function wantsTextOnPhoto(prompt: string, note?: string): boolean {
  const t = `${prompt} ${note ?? ""}`;
  // наша же служебная фраза «место/треть/пространство под (для) заголовок» —
  // не намерение: промпт-райтер пишет её почти всегда
  const cleaned = t.replace(/(?:под|для)(?:\s+\p{L}+){0,2}\s+заголов\p{L}*/giu, "");
  return TEXT_STRONG.test(cleaned) || TEXT_VERB.test(cleaned);
}

/**
 * Конкретика для сценариев, где Seedream в режиме правки иначе оставляет фото
 * «как есть» (приставка с пылью и кабелем, аэрогриль обрезан по краям).
 * Позитивные формулировки — запрет модель читает как приглашение.
 */
export function scenarioDirectives(
  scenario?: string | null,
  opts?: { v2?: boolean; productHint?: string },
): string {
  switch (scenario) {
    // Сценарий по умолчанию: ничего сверх просьбы человека не трогаем.
    case "as-is":
      return `${KEEP} The background, lighting and setting stay as in the photo; only what the request asks for changes.`;
    // A/B 2026-09-06: «only the product remains» убирал модель с платья, а
    // «cords tucked away» рисовал шнур в углу (запрет = приглашение). Человек
    // на фото остаётся; про шнуры молчим — «пустая поверхность» их и так убирает.
    case "studio":
      if (opts?.v2) return studioV2(opts.productHint);
      return (
        `${KEEP} The whole product fits inside the frame with clear margins on every side. ` +
        "The original background is replaced by a clean seamless studio backdrop; the surface " +
        "under the product is spotless and empty, the product looks freshly cleaned."
      );
    case "background-swap":
      return `${KEEP} Only the environment around it changes; the whole product stays inside the frame with margins.`;
    case "closeup":
      return `${KEEP} The crop moves closer, the product does not change.`;
    default:
      return KEEP;
  }
}

/**
 * «Студийный фон» v2. Старая версия читалась моделью буквально — «замени фон»:
 * объект обводился и заливался плоским белым, свет на нём оставался от исходной
 * съёмки, тени исчезали → «вырезка». Здесь просим то, что делает студия:
 * переосветить объект под новый фон, дать контактную тень, а фон — не плоский
 * белый, а светло-серый градиент (он прячет шов). Хвост по типу товара — только
 * про свет и постановку, ракурс не трогаем: он у товара уже есть на фото.
 */
function studioV2(productHint?: string): string {
  const base =
    `${KEEP} The whole product fits inside the frame with clear margins on every side. ` +
    "The setting becomes a professional photo studio: the product is lit anew by soft, even " +
    "studio light that matches the new backdrop, with a soft natural contact shadow under it. " +
    "The backdrop is seamless light-grey studio paper with a gentle gradient, slightly darker " +
    "toward the floor; the surface under the product is spotless and empty.";
  return `${base} ${studioTail(productHint)}`;
}

/** Постановка по типу товара (ключевые слова из названия/категории/промпта). */
function studioTail(hint?: string): string {
  const h = (hint ?? "").toLowerCase();
  if (/одежд|плать|куртк|пальт|костюм|рубаш|брюк|джинс|футболк|худи|свитер|юбк|шорт|комбинезон|бель|пиджак|жилет|блуз|кардиган|плащ|пуховик|штан/.test(h)) {
    return (
      "Fashion e-commerce look: even frontal light with no harsh shadows on the face or fabric, " +
      "the full outfit visible head to toe, the floor and backdrop merge into one even grey."
    );
  }
  if (/обув|кроссов|ботин|туфл|сапог|кед|сандал|босонож|тапоч|лофер/.test(h)) {
    return "The shoes rest on the floor with a crisp contact shadow, the texture of the material is visible.";
  }
  if (/космет|крем|шампун|парфюм|духи|сыворот|маск|гель|лосьон|помад|тушь|уход|бальзам/.test(h)) {
    return "Beauty-shot lighting: a soft warm key light with a gentle highlight on the packaging and a faint reflection on the surface.";
  }
  if (/еда|продукт|чай|кофе|шоколад|конфет|орех|мёд|мед\b|снек|напит|специ|каш|печень/.test(h)) {
    return "Warm appetising light, the packaging reads crisp, a soft reflection on the surface.";
  }
  return "The product's own materials and finish read clearly under the studio light, with a soft shadow anchoring it to the surface.";
}

/**
 * Общая часть: товар (и человек, если он есть на фото) не меняется; надписи
 * на товаре — только те, что видны на фото (бренд из промпта иначе рисуется
 * крупной кривой надписью: «Wessgauff» на аэрогриле в A/B).
 */
const KEEP =
  "The product itself, and the person wearing or holding it if there is one, stay exactly as " +
  "in the photo (same item, colour, material, details, proportions). Markings and lettering on " +
  "the product are copied exactly from the photo, nothing new is written on it.";
