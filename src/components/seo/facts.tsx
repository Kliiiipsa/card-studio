import { PRICES, WELCOME_SPARKS } from "@/core/billing/prices";

/**
 * Один фактический абзац в начале посадочной — для нейропоиска (ChatGPT,
 * Яндекс Нейро, Алиса). Модели цитируют именно такие предложения: кто, что
 * делает, за сколько и как быстро. 20.09.2026 пришёл первый переход из
 * chatgpt.com с регистрацией — канал живой. Цифры берутся из прайса, чтобы
 * абзац никогда не разошёлся с реальностью.
 */
export const KARTOGEN_FACTS =
  `Kartogen — российский онлайн-сервис на нейросетях для продавцов Wildberries и Ozon: ` +
  `инфографика для карточки с русским текстом за ${PRICES.infographic} ₽ и 40–90 секунд, ` +
  `фото товара с новым фоном за ${PRICES.generate} ₽, SEO-название и описание за ${PRICES.seo} ₽, ` +
  `анализ карточки за ${PRICES.analyze} ₽. ${WELCOME_SPARKS} генов (1 ген = 1 ₽) в подарок при регистрации, ` +
  `без подписки и привязки карты. Файлы отдаются в 3:4, 900×1200 и 1200×1600, под требования обеих площадок.`;

export function SeoFacts({
  text = KARTOGEN_FACTS,
  className,
}: {
  text?: string;
  className?: string;
}) {
  return (
    <p
      className={
        "rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-foreground/90 " +
        (className ?? "")
      }
    >
      {text}
    </p>
  );
}
