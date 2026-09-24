/**
 * «Гены» — внутренняя валюта студии (от Kartogen). 1 ген = 1 ₽.
 * Переименовано из «искр» 2026-08-25 (совпадение с валютой конкурента);
 * внутренние идентификаторы (sparks, billing_tx) сознательно не тронуты —
 * переименование только клиентское.
 * Pure module — safe for both client (price tags on buttons) and server.
 */
export const SPARK = "🧬";

/** Склонение: 1 ген, 2 гена, 5 генов, 11 генов, 21 ген. */
export function genWord(n: number): string {
  const tail = Math.abs(n) % 100;
  const d = tail % 10;
  if (tail >= 11 && tail <= 14) return "генов";
  if (d === 1) return "ген";
  if (d >= 2 && d <= 4) return "гена";
  return "генов";
}

/** «5 генов» — число вместе с правильно склонённым словом. */
export function gens(n: number): string {
  return `${n} ${genWord(n)}`;
}

/** every paid action in the app */
export type SparkAction =
  | "analyze"
  | "compare"
  | "generate"
  | "infographic"
  | "banner"
  | "video"
  | "turnkey"
  | "seo"
  | "ideas"
  | "write_prompt"
  | "improve_prompt"
  | "build_prompt"
  | "brief"
  | "autofill"
  | "extract_style";

/** price 0 = free (text-only Qwen actions cost us kopecks — user decision 2026-08-04) */
export const PRICES: Record<SparkAction, number> = {
  /** 5 → 3 (2026-08-25): анализ стал входной точкой, глубокий вердикт — в «Сравнении» */
  analyze: 3,
  /** «Сравнение карточек»: моя vs конкурент, вердикт кто выигрывает и почему */
  compare: 5,
  /** 7 → 8 и 10 → 12 (2026-08-26): компенсация курса fal 84 → 98 ₽/$ */
  generate: 8,
  infographic: 12,
  /**
   * «Рекламные креативы» (баннер, пост, шапка канала, визитка): одна генерация
   * gpt-image, как у инфографики (себестоимость ~5,3 ₽), но кадр рекламный —
   * постановочная сцена и весь текст, включая контакты, запекается моделью.
   * Цена 15 — решение владельца 2026-09-10.
   */
  banner: 15,
  /**
   * 5-секундное видео товара из фото. Kling 2.5 Turbo Pro списывает $0.35;
   * при курсе пополнения fal 98 ₽/$ себестоимость ≈ 34,3 ₽ — цена 40 уходила
   * в минус. Цена 60 (решение пользователя 2026-08-25; было 38 → 40).
   */
  video: 60,
  /** «Карточка под ключ»: 7 изображений (по 7 🧬 за успешное) + SEO-тексты (6 🧬) */
  turnkey: 55,
  /** отдельная генерация SEO-текстов (название + описание + ключи); 1 → 3 (2026-08-25) */
  seo: 3,
  ideas: 0,
  write_prompt: 0,
  improve_prompt: 0,
  build_prompt: 0,
  brief: 0,
  autofill: 0,
  extract_style: 0,
};

/** списание за каждое УСПЕШНОЕ изображение пакета «под ключ» */
export const TURNKEY_ITEM_PRICE = 7;
/** списание за SEO-блок пакета (7×7 + 6 = 55) */
export const TURNKEY_SEO_PRICE = 6;

export const ACTION_LABELS: Record<SparkAction, string> = {
  analyze: "Анализ карточки",
  compare: "Сравнение карточек",
  generate: "Фото товара",
  infographic: "Инфографика",
  banner: "Рекламный креатив",
  video: "Видео товара",
  turnkey: "Карточка под ключ (7 изображений)",
  seo: "SEO-тексты",
  ideas: "Идеи карточек",
  write_prompt: "Написание промпта",
  improve_prompt: "Улучшение промпта",
  build_prompt: "Сборка промпта",
  brief: "Бриф инфографики",
  autofill: "Заполнение по фото",
  extract_style: "Извлечение стиля",
};

/** Курс пополнения fal.ai (₽ за $), 2026-08-25. Для аналитики затрат в «Отчётах». */
export const RUB_PER_USD = 98;

/**
 * Оценка нашей себестоимости fal за один ген (₽). Гены тратят на разные услуги
 * с разной ценой fal: худший случай — всё уйдёт на видео, типичный — на
 * инфографику. Нужно, чтобы оценить обязательства перед пользователями.
 * (себестоимость услуги ÷ её цена в генах, курс 98 ₽/$)
 */
export const FAL_COST_PER_GENE = {
  worst: 0.58, // видео: ~34,6 ₽ / 60 генов
  typical: 0.45, // инфографика: ~5,3 ₽ / 12 генов
} as const;

/**
 * starter balance granted once per account on signup.
 * 20 → 25 (2026-09-09, решение владельца): хватает на две карточки вместо
 * одной, человек успевает попробовать и фото, и инфографику.
 * ВАЖНО: число упоминается в текстах на сайте, в llms.txt и в TG-боте —
 * подставляйте эту константу, а не цифру, иначе они разъедутся.
 */
export const WELCOME_SPARKS = 25;

/**
 * Реферальная программа (2026-09-24, схема владельца).
 *
 * ОБЕ награды платятся только с РЕАЛЬНЫХ ДЕНЕГ и ни одна — за регистрацию.
 * Это принципиально: за регистрацию мы уже даём WELCOME_SPARKS на каждый новый
 * ящик, и любая добавка к ней просто расширяет дыру для ферм из почтовых
 * адресов. Награду, которую нельзя получить без оплаты, накрутить невозможно —
 * а накрутка через настоящую оплату нам выгодна.
 *
 * База начисления — РУБЛИ, которые человек реально заплатил. Не гены на
 * балансе: пакетный бонус рублей не добавляет, промокод на бонусные гены
 * рублей не убавляет. Одно правило вместо списка исключений (см. referralGenes).
 *
 * Экономика при себестоимости гена ≈0,45 ₽ и выручке 91,5 % после комиссии
 * ЮKassa (3,5 %) и НПД (5 % с полной суммы): первое пополнение приглашённого на
 * 200 ₽ оставляет нам ≈68 ₽ из 183 ₽, каждое следующее ≈80 ₽. Программа стоит
 * 5–13 процентных пунктов маржи и только с приведённого клиента.
 */
export const REFERRAL = {
  /** пригласившему — с КАЖДОГО пополнения приглашённого, бессрочно */
  referrerPercent: 10,
  /**
   * приглашённому — к ПЕРВОМУ пополнению. Складывается с пакетным бонусом и
   * промокодом (решение владельца 2026-09-24: «применяется больший» выглядит
   * как обман и отталкивает сильнее, чем стоит сэкономленный бонус).
   */
  refereeFirstTopupPercent: 15,
} as const;

/**
 * Награда в генах от суммы оплаты. Округление ВНИЗ — в нашу пользу и без
 * копеечных дробей на балансе; нижняя граница в 1 ген недостижима при
 * CUSTOM_TOPUP.minRub = 10 ₽, но защищает от нулевой награды, если минимум
 * когда-нибудь опустят.
 */
export function referralGenes(paidRub: number, percent: number): number {
  if (!Number.isFinite(paidRub) || paidRub <= 0) return 0;
  return Math.max(1, Math.floor((paidRub * percent) / 100));
}

export type TopupPackage = { id: string; sparks: number; bonus: number; priceRub: number };

export const TOPUP_PACKAGES: TopupPackage[] = [
  // Лестница бонусов 5 % → 7 % → 10 % (решение пользователя 2026-08-21).
  // Бонус — самая дорогая для нас статья: он снижает выручку с гена сильнее,
  // чем комиссия ЮKassa и налог вместе взятые, поэтому растёт умеренно.
  { id: "s200", sparks: 200, bonus: 10, priceRub: 200 },
  { id: "s500", sparks: 500, bonus: 35, priceRub: 500 },
  { id: "s1000", sparks: 1000, bonus: 100, priceRub: 1000 },
  // 3000 + 500 (≈17 %, решение владельца 2026-09-22): пакет для тех, кто уже
  // тратит сотни генов в неделю; выручка с гена ≈ 0,78 ₽ после комиссии и налога
  { id: "s3000", sparks: 3000, bonus: 500, priceRub: 3000 },
];

/**
 * Произвольная сумма: 1 ₽ = 1 ген, без бонуса (бонус — привилегия пакетов).
 * Минимум 10 ₽ = одна инфографика (решение пользователя 2026-08-18); верхняя
 * граница — здравый смысл и антифрод.
 */
export const CUSTOM_TOPUP = { id: "custom", minRub: 10, maxRub: 50_000 } as const;

/** Build a one-off "package" for an arbitrary amount (validated by the server too). */
export function customTopup(amountRub: number): TopupPackage | null {
  if (!Number.isInteger(amountRub)) return null;
  if (amountRub < CUSTOM_TOPUP.minRub || amountRub > CUSTOM_TOPUP.maxRub) return null;
  return { id: CUSTOM_TOPUP.id, sparks: amountRub, bonus: 0, priceRub: amountRub };
}
