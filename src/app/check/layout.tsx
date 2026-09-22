import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteLinks } from "@/components/seo/site-links";
import { SeoFacts } from "@/components/seo/facts";
import { PRICES, WELCOME_SPARKS } from "@/core/billing/prices";

/**
 * Публичный лид-магнит (одобрен 2026-09-01, выведен на главную): индексируем —
 * страница ранжируется по «анализ/проверка карточки бесплатно» (позиции 3–6 в
 * Вебмастере на 20.09.2026) при 36 словах текста. Текст ниже — сервисный
 * компонент под инструментом: что проверяем, как читать балл, FAQ со схемой.
 * Сам инструмент — клиентский page.tsx, его не трогаем.
 */
export const metadata: Metadata = {
  title: "Бесплатный анализ карточки товара — Kartogen",
  description:
    "Загрузите фото карточки или товара — ИИ оценит её как покупатель на Wildberries и Ozon, поставит балл из 100 и подскажет, что мешает продажам. Бесплатно, без регистрации, за 20 секунд.",
  alternates: { canonical: "https://kartogen.ru/check" },
};

const CRITERIA: { title: string; text: string }[] = [
  {
    title: "Читаемость в миниатюре",
    text: "Карточку уменьшают до размера плитки в выдаче и смотрят, узнаётся ли товар и читается ли заголовок. Это первый фильтр покупателя: что не видно в миниатюре, не кликают.",
  },
  {
    title: "Заголовок и главная выгода",
    text: "Есть ли на первом слайде крупная товарная формула: что это и зачем. «Костюм» без выгоды и «Премиальное качество» без конкретики оба проигрывают «Костюм не мнётся: хлопок 80%».",
  },
  {
    title: "Плашки и факты",
    text: "Цифры сильнее прилагательных. Анализ считает, сколько на карточке измеримых фактов, объём, вес, состав, срок, и сколько пустых слов вроде «удобный» и «стильный».",
  },
  {
    title: "Композиция и фон",
    text: "Занимает ли товар достаточную долю кадра, не перекрыт ли текстом, не спорит ли фон с товаром, есть ли свободные зоны под плашки.",
  },
  {
    title: "Соответствие правилам площадки",
    text: "Цены, скидки, «хит продаж», чужие логотипы и водяные знаки на изображениях запрещены на Wildberries и Ozon. Анализ отмечает такие элементы до того, как их заметит модерация.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Анализ карточки правда бесплатный и без регистрации?",
    a: "Да. Общий балл, диагноз и главный совет показываются сразу после загрузки, регистрация не нужна. Полный разбор со всеми проблемами, вариантами заголовка и готовыми текстами плашек открывается после регистрации, и на него хватает подарочных генов.",
  },
  {
    q: "Что загружать: скриншот карточки или фото товара?",
    a: "Лучше скриншот первого слайда карточки с маркетплейса: тогда анализ оценивает то, что видит покупатель. Фото товара тоже подойдёт, но тогда оценка будет про снимок, а не про оформление, и совет будет о том, какую карточку из него собрать.",
  },
  {
    q: "Как оценивается карточка и что значит балл?",
    a: "Модель смотрит на карточку глазами покупателя в выдаче Wildberries и Ozon: узнаваемость товара в миниатюре, заголовок, факты на плашках, композиция и запрещённые элементы. Балл выше 75 значит, что карточка конкурентоспособна, 50–75 есть что исправить, ниже 50 карточку стоит переделать.",
  },
  {
    q: "Можно ли проверить карточку конкурента?",
    a: "Да, загрузите её скриншот. Это удобный способ понять, за счёт чего чужая карточка выигрывает: анализ покажет, какие факты и приёмы у неё есть, а у вашей нет.",
  },
  {
    q: "Что делать после анализа?",
    a: `В полном разборе есть кнопка «Собрать инфографику»: название, преимущества и предложенный заголовок переносятся в генератор, остаётся выбрать стиль. Новая карточка стоит ${PRICES.infographic} генов, при регистрации ${WELCOME_SPARKS} генов в подарок.`,
  },
  {
    q: "Чем анализ отличается от сервисов аналитики продаж?",
    a: "Аналитика продаж считает выручку, остатки и позиции в выдаче по данным площадки. Здесь оценивается само изображение: почему по карточке не кликают и что на ней поменять. Это дополняет аналитику, а не заменяет её.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function CheckLayout({ children }: { children: React.ReactNode }) {
  return (
    <main>
      {children}
      <JsonLd data={faqSchema} />
      <section className="mx-auto w-full max-w-2xl px-4 pb-12">
        <SeoFacts className="mb-8" />

        <h2 className="text-xl font-bold tracking-tight">Что проверяет анализ карточки товара</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Анализ смотрит на карточку так, как её видит покупатель в поисковой выдаче Wildberries и
          Ozon: сначала миниатюра среди десятков соседей, потом первый слайд целиком. Оценка
          складывается из пяти критериев.
        </p>
        <ol className="mt-4 space-y-3">
          {CRITERIA.map((c, i) => (
            <li key={c.title} className="flex gap-3 rounded-xl border bg-card p-4">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium">{c.title}</p>
                <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{c.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <h2 className="mt-10 text-xl font-bold tracking-tight">Как читать результат</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Балл из 100 показывает, насколько карточка готова конкурировать в выдаче. Выше 75:
          карточка работает, правки точечные. От 50 до 75: есть одна-две проблемы, которые режут
          клики, обычно это заголовок без выгоды или нечитаемая миниатюра. Ниже 50: карточку стоит
          собрать заново, дешевле, чем чинить. Бесплатно показываются балл, диагноз и главный совет.
          В полном разборе после регистрации: все найденные проблемы с решениями, варианты
          продающего заголовка, готовые тексты плашек, советы по визуалу и идеи новых карточек под
          этот товар.
        </p>

        <h2 className="mt-10 text-xl font-bold tracking-tight">Частые вопросы</h2>
        <div className="mt-4 grid gap-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-xl border bg-card p-4 open:shadow-sm">
              <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
              </summary>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Читайте также:{" "}
          <Link href="/blog/pochemu-kartochka-ne-prodaet" className="text-primary hover:underline">
            почему карточка не продаёт
          </Link>
          ,{" "}
          <Link href="/dizayn-kartochki-tovara" className="text-primary hover:underline">
            дизайн карточки товара
          </Link>
          ,{" "}
          <Link href="/infografika" className="text-primary hover:underline">
            что писать на слайдах инфографики
          </Link>
          .
        </p>

        <div className="mt-10 border-t pt-8">
          <SiteLinks />
        </div>
      </section>
    </main>
  );
}
