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
export function scenarioDirectives(scenario?: string | null): string {
  switch (scenario) {
    case "studio":
      return (
        "The product itself stays exactly as in the photo (same item, colour, material, details). " +
        "The whole product fits inside the frame with clear margins on every side. " +
        "The original background is replaced by a clean seamless studio backdrop; the surface " +
        "under the product is spotless and empty, the product looks freshly cleaned. Only the " +
        "product remains in the frame: it is shown unplugged, any cords, cables and packaging " +
        "are tucked away out of frame."
      );
    case "background-swap":
      return (
        "The product itself stays exactly as in the photo (same item, colour, material, details, " +
        "proportions). Only the environment around it changes; the whole product stays inside " +
        "the frame with margins."
      );
    case "closeup":
      return "The product itself stays exactly as in the photo; the crop moves closer, the product does not change.";
    default:
      return "The product itself stays exactly as in the photo (same item, colour, material, details).";
  }
}
