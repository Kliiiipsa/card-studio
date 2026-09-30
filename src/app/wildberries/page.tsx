import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/core/auth/session";
import {
  Wand2,
  LayoutTemplate,
  ScanSearch,
  FileText,
  Upload,
  Lightbulb,
  Download,
  Sparkles,
  ArrowRight,
  Gem,
  Dna,
  CheckCircle2,
  MousePointerClick,
  Images,
  Type,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type ExampleCard } from "@/components/landing/examples-gallery";
import { ExamplesMarquee } from "@/components/landing/examples-marquee";
import { JsonLd } from "@/components/seo/json-ld";
import { SeoFacts } from "@/components/seo/facts";
import { PRICES, WELCOME_SPARKS } from "@/core/billing/prices";

/* ------------------------------------------------------------------ */
/* SEO-посадочная под запросы «генерация/создание карточек для          */
/* Wildberries». Публичная (открыта в middleware), с ключевым H1,       */
/* живым текстом, примерами и FAQ — то, что реально ранжируется.        */
/*                                                                      */
/* 30.09.2026: разведена с /ozon. Раньше обе страницы были одним        */
/* шаблоном с заменой названия площадки, и ChatGPT приводил людей на    */
/* обе с одинаковым текстом. Теперь у каждой своя суть: здесь — про     */
/* обложку, которая решает клик в выдаче WB, лимит названия в 60        */
/* символов и живые подсказки поиска WB в SEO-текстах. Общие с /ozon    */
/* факты (3:4, 900×1200) остаются, потому что они правда общие.         */
/* ------------------------------------------------------------------ */

const SITE = "https://kartogen.ru";

export const metadata: Metadata = {
  title: "Генерация карточек для Wildberries с ИИ — Kartogen",
  description: `Создание карточек товара для Wildberries нейросетью: обложка с плашками под выдачу WB, фото товара, SEO-название до 60 символов по живым подсказкам поиска, анализ карточки. Файлы 3:4, 900×1200 и 1200×1600. ${WELCOME_SPARKS} генов в подарок.`,
  keywords: [
    "генерация карточек Wildberries",
    "карточки для WB",
    "инфографика для Wildberries",
    "нейросеть для карточек Wildberries",
    "создать карточку товара WB",
    "SEO для Wildberries",
  ],
  alternates: { canonical: `${SITE}/wildberries` },
  openGraph: {
    title: "Генерация карточек для Wildberries с ИИ — Kartogen",
    description:
      "Обложка с плашками под выдачу WB, фото товара, SEO-название по живым подсказкам поиска и анализ карточки — за минуты.",
    url: `${SITE}/wildberries`,
    type: "website",
  },
};

/** фактический абзац под нейропоиск — про Wildberries, а не про сервис вообще */
const WB_FACTS =
  `На Wildberries карточка показывается в выдаче первым фото, поэтому обложка с 2–3 плашками ` +
  `преимуществ у продавцов стандарт. Kartogen собирает такую обложку и остальные слайды нейросетью ` +
  `за ${PRICES.infographic} ₽ и 40–90 секунд, делает чистое фото товара за ${PRICES.generate} ₽ и ` +
  `пишет SEO-название до 60 символов и описание по живым подсказкам поиска WB за ${PRICES.seo} ₽. ` +
  `Файлы 3:4, 900×1200 и 1200×1600, JPG или PNG. ${WELCOME_SPARKS} генов (1 ген = 1 ₽) в подарок ` +
  `при регистрации, без подписки и привязки карты.`;

const BLOCKS = [
  {
    icon: LayoutTemplate,
    title: "Обложка, которая цепляет в выдаче",
    text: "На WB покупатель выбирает по первому фото в списке. Kartogen собирает обложку с крупным заголовком и 2–3 плашками преимуществ — текст пишет сама модель по-русски, прямо внутри изображения. Следующие слайды: состав, размеры, товар в использовании.",
  },
  {
    icon: Wand2,
    title: "Чистое фото для одежды и косметики",
    text: "В этих категориях на WB лучше работает кадр без надписей: модель или флакон крупно, ровный свет. Сделайте студийный снимок из своего фото, а плашки унесите на второй слайд.",
  },
  {
    icon: FileText,
    title: "SEO по живым подсказкам поиска WB",
    text: "Название до 60 символов с главным ключом в начале, описание и список запросов. Подсказки берём из поисковой строки Wildberries в момент генерации — это то, что покупатели набирают сейчас, а не год назад.",
  },
  {
    icon: ScanSearch,
    title: "Анализ карточки перед сравнением",
    text: "Загрузите свою карточку — ИИ оценит обложку, тексты и слайды так, как их видит покупатель в выдаче, и назовёт три вещи, которые исправить первыми. Есть режим «моя карточка против конкурента».",
  },
];

/** что важно именно на Wildberries — цифры совпадают с /razmer-kartochki-wildberries */
const WB_RULES = [
  {
    icon: Images,
    title: "3:4, от 900×1200",
    text: "Вертикаль 3:4. Минимум 700×900, рабочий размер 900×1200, для больших экранов 1200×1600. Квадрат и горизонталь WB обрежет сам, и плашки уедут из кадра.",
  },
  {
    icon: MousePointerClick,
    title: "Первое фото решает клик",
    text: "В выдаче видно только обложку. Карточка с одним фото показывается хуже: нужно минимум 2–3 слайда, оптимум 7–15.",
  },
  {
    icon: Type,
    title: "Название — 60 символов",
    text: "Ключевой запрос ставится в начало, остальное — характеристики, по которым ищут. Длиннее WB не примет, поэтому наш генератор считает символы за вас.",
  },
  {
    icon: Ban,
    title: "Чего нельзя на обложке",
    text: "Цены, «скидка», «хит», «гарантия», контакты и чужие логотипы. Сама инфографика разрешена — ограничено содержание надписей, а не их наличие.",
  },
];

const STEPS = [
  {
    icon: Upload,
    title: "Загрузите фото или карточку",
    text: "Своё фото товара или текущую карточку с Wildberries — по ней ИИ поймёт, что улучшать.",
  },
  {
    icon: Lightbulb,
    title: "ИИ подберёт тексты плашек",
    text: "Распознает товар и предложит заголовок и 3–4 преимущества под вашу категорию. Бесплатно, правится руками.",
  },
  {
    icon: Wand2,
    title: "Соберите обложку и слайды",
    text: "Выберите стиль — через 40–90 секунд готова обложка с плашками. Следующие слайды собираются так же.",
  },
  {
    icon: Download,
    title: "Скачайте и загрузите в WB",
    text: "900×1200 или 1200×1600, JPG или PNG. Файл подходит под карточку без обрезки.",
  },
];

const EXAMPLES: ExampleCard[] = [
  { src: "/examples/dress.jpg", title: "Платье", style: "Мягкий лайфстайл" },
  { src: "/examples/coat.jpg", title: "Пуховик", style: "Премиум тёмный" },
  { src: "/examples/sneakers.jpg", title: "Кроссовки", style: "Яркий акцент" },
  { src: "/examples/bedding.jpg", title: "Постельное бельё", style: "Нежный текстиль" },
  { src: "/examples/humidifier.jpg", title: "Увлажнитель", style: "Бирюзовый фреш" },
  { src: "/examples/backpack.jpg", title: "Детский рюкзак", style: "Весёлый яркий" },
  { src: "/examples/catfood.jpg", title: "Корм для кошек", style: "Доверие и состав" },
  { src: "/examples/thermomug.jpg", title: "Термокружка", style: "Чистый минимал" },
  { src: "/examples/hoodie.jpg", title: "Худи", style: "Поп-арт" },
  { src: "/examples/cream.jpg", title: "Крем для лица", style: "Мягкий лайфстайл" },
  { src: "/examples/suitcase.jpg", title: "Чемодан", style: "Солнечный промо" },
  { src: "/examples/yogamat.jpg", title: "Коврик для йоги", style: "Бирюзовый фреш" },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Какой размер карточки подходит для Wildberries?",
    a: "Вертикаль 3:4. Минимум 700×900 пикселей, рабочий размер 900×1200, для чёткости на больших экранах 1200×1600. Kartogen отдаёт оба рабочих размера в JPG или PNG, файл загружается в карточку без обрезки.",
  },
  {
    q: "Можно ли делать инфографику на главном фото WB?",
    a: "Да, и на практике это стандарт: у большинства сильных карточек на обложке 2–3 плашки с преимуществами, потому что именно первое фото видно в выдаче. Ограничено содержание надписей: нельзя цены, «скидка», «хит», обещания гарантии, контакты и чужие логотипы. Для одежды и косметики чистая обложка обычно работает лучше, а плашки уходят на второй слайд.",
  },
  {
    q: "Сколько слайдов делать в карточке Wildberries?",
    a: "До 30 изображений, рабочий оптимум 7–15: обложка, преимущества, состав или материалы, размеры, товар в использовании, детали крупно. Карточка с единственным фото показывается в поиске хуже, минимум нужно 2–3 слайда. В Kartogen каждый слайд собирается отдельной генерацией, композиция каждый раз новая.",
  },
  {
    q: "Как написать название карточки для WB, чтобы её находили?",
    a: "Лимит 60 символов. Главный запрос ставится в начало, дальше 2–3 уточнения, по которым ищут: материал, размер, для кого. Kartogen берёт подсказки из поисковой строки Wildberries в момент генерации, укладывает название в 60 символов и отдельно отдаёт описание и список запросов для характеристик.",
  },
  {
    q: "Чем нейросеть лучше шаблона для карточек WB?",
    a: "Шаблон даёт одну и ту же композицию всем товарам, и карточка становится похожа на соседние в выдаче. Нейросеть смотрит на конкретное фото, подбирает сцену и цвета под товар и пишет плашки под категорию. Заголовок и факты берутся из ваших данных, вы правите их до генерации, а не перерисовываете после.",
  },
  {
    q: "Сколько стоит сделать карточку для Wildberries?",
    a: `Обложка или слайд с инфографикой — ${PRICES.infographic} ₽, чистое фото товара — ${PRICES.generate} ₽, SEO-название с описанием — ${PRICES.seo} ₽, анализ карточки — ${PRICES.analyze} ₽. Подбор текстов плашек и заполнение по фото бесплатны. При регистрации ${WELCOME_SPARKS} генов в подарок, этого хватает на две обложки. Подписки нет, платите за готовые файлы.`,
  },
  {
    q: "Что будет, если результат не подошёл?",
    a: "Гены списываются только за успешно созданное изображение или текст, за ошибки сервиса нет. Не понравилась композиция — соберите ещё раз, следующий вариант будет другим. Тексты плашек можно поправить до генерации, а стиль сменить одним переключателем.",
  },
];

export default async function WildberriesLanding() {
  const secret = process.env.AUTH_SECRET;
  const token = cookies().get(SESSION_COOKIE)?.value;
  const authed = secret ? Boolean(await verifySessionToken(secret, token)) : false;

  const structured: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Генерация карточек для Wildberries с ИИ",
      url: `${SITE}/wildberries`,
      inLanguage: "ru-RU",
      description:
        "Создание карточек товара для Wildberries нейросетью: обложка с плашками под выдачу WB, фото товара, SEO-название до 60 символов по живым подсказкам поиска, анализ карточки.",
      isPartOf: { "@type": "WebSite", name: "Kartogen", url: SITE },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: `${SITE}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Карточки для Wildberries",
          item: `${SITE}/wildberries`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  return (
    <div className="min-h-screen surface-gradient">
      <JsonLd data={structured} />

      {/* Nav */}
      <header className="container flex h-16 items-center justify-between gap-2">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-500 text-white shadow-md">
            <Gem className="h-5 w-5" />
          </div>
          <span className="whitespace-nowrap text-sm font-semibold sm:text-base">Kartogen</span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {authed ? (
            <Button asChild variant="gradient" size="sm">
              <Link href="/dashboard">
                В студию <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Войти</Link>
              </Button>
              <Button asChild variant="gradient" size="sm">
                <Link href="/register">
                  <span className="sm:hidden">Начать</span>
                  <span className="hidden sm:inline">Начать бесплатно</span>
                </Link>
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="container flex flex-col items-center pt-20 pb-16 text-center">
        <Badge variant="secondary" className="mb-5 gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Для селлеров Wildberries
        </Badge>
        <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Генерация карточек товара для <span className="text-gradient">Wildberries</span> с помощью
          ИИ
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Обложка с плашками, которая выделяется в выдаче, чистое фото товара, SEO-название до 60
          символов по живым подсказкам поиска WB и разбор карточки перед публикацией. Загрузите фото
          товара — остальное соберёт нейросеть.
        </p>
        <SeoFacts text={WB_FACTS} className="mt-5 max-w-2xl text-left" />
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" variant="gradient">
            <Link href={authed ? "/dashboard" : "/register"}>
              {authed ? "Открыть студию" : "Сделать карточку для WB"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="#examples">Посмотреть примеры</Link>
          </Button>
        </div>
        {!authed && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Dna className="h-4 w-4 text-primary" />
            {WELCOME_SPARKS} генов в подарок при регистрации — это две обложки
          </p>
        )}

        <div className="mt-16 grid w-full max-w-5xl grid-cols-2 gap-4 sm:grid-cols-4">
          {EXAMPLES.slice(0, 4).map((c, i) => (
            <div
              key={c.src}
              className={`relative aspect-[3/4] overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5 ${
                i % 2 === 1 ? "sm:translate-y-6" : ""
              }`}
            >
              <Image
                src={c.src}
                alt={`Карточка для Wildberries: ${c.title} — ${c.style}`}
                fill
                priority={i < 2}
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </section>

      {/* What you get */}
      <section className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Всё для карточки Wildberries в одном месте
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-muted-foreground">
          Четыре инструмента под то, как карточку видят в выдаче и ищут в поиске WB. Онлайн, без
          программ и шаблонов.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {BLOCKS.map((b) => (
            <div key={b.title} className="glass rounded-2xl p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{b.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WB rules */}
      <section className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Что важно именно на Wildberries
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-muted-foreground">
          Четыре правила, из-за которых карточки теряют показы. Kartogen учитывает их при генерации.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {WB_RULES.map((r) => (
            <div key={r.title} className="rounded-2xl border bg-card p-6">
              <r.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{r.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Подробно про размеры и требования к фото —{" "}
          <Link href="/razmer-kartochki-wildberries" className="text-primary hover:underline">
            размер карточки Wildberries
          </Link>
          .
        </p>
      </section>

      {/* How it works */}
      <section className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Как сделать карточку для WB за 4 шага
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative rounded-2xl border bg-card p-6">
              <div className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-500 text-xs font-bold text-white">
                {i + 1}
              </div>
              <s.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Examples */}
      <section id="examples" className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Обложки, собранные для продавцов WB
        </h2>
        <p className="mt-2 text-center text-muted-foreground">
          Каждая карточка ниже сделана в этой студии по одному фото товара: заголовок, плашки и
          сцена подобраны нейросетью под категорию.
        </p>
        <ExamplesMarquee items={EXAMPLES} />
      </section>

      {/* FAQ */}
      <section className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Частые вопросы о карточках Wildberries
        </h2>
        <div className="mx-auto mt-10 grid max-w-4xl gap-3 md:grid-cols-2">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-xl border bg-card p-4 open:shadow-sm">
              <summary className="flex cursor-pointer list-none items-start gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {f.q}
              </summary>
              <p className="mt-2 pl-6 text-[13px] leading-6 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-indigo-600 to-blue-600 p-10 text-center text-white sm:p-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Соберите обложку для Wildberries сегодня
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">
            Регистрация за минуту, {WELCOME_SPARKS} генов в подарок — хватит на две обложки. Тексты
            плашек и разбор фото бесплатны, платите только за готовые файлы.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-8">
            <Link href={authed ? "/dashboard" : "/register"}>
              {authed ? "Открыть студию" : "Начать бесплатно"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="container flex flex-col items-center gap-3 border-t py-8 text-center text-sm text-muted-foreground">
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/" className="hover:text-foreground">
            Главная
          </Link>
          <Link href="/ozon" className="hover:text-foreground">
            Для Ozon
          </Link>
          <Link href="/photo" className="hover:text-foreground">
            Фото товара
          </Link>
          <Link href="/infografika" className="hover:text-foreground">
            Инфографика
          </Link>
          <Link href="/razmer-kartochki-wildberries" className="hover:text-foreground">
            Размер карточки WB
          </Link>
          <Link href="/seo-opisanie-tovara" className="hover:text-foreground">
            SEO-описание товара
          </Link>
          <Link href="/help" className="hover:text-foreground">
            Как это работает
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Тарифы
          </Link>
          <Link href="/offer" className="hover:text-foreground">
            Публичная оферта
          </Link>
          <a href="mailto:admin@kartogen.ru" className="hover:text-foreground">
            admin@kartogen.ru
          </a>
        </nav>
        <p className="text-xs">
          Kartogen — независимый сервис и не аффилирован с Wildberries. «Wildberries» — товарный
          знак его правообладателя.
        </p>
      </footer>
    </div>
  );
}
