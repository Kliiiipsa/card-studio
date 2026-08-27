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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type ExampleCard } from "@/components/landing/examples-gallery";
import { ExamplesMarquee } from "@/components/landing/examples-marquee";
import { JsonLd } from "@/components/seo/json-ld";
import { PRICES } from "@/core/billing/prices";

/* ------------------------------------------------------------------ */
/* SEO-посадочная под запросы «генерация/создание карточек для          */
/* Wildberries». Публичная (открыта в middleware), с ключевым H1,       */
/* живым текстом, примерами и FAQ — то, что реально ранжируется.        */
/* ------------------------------------------------------------------ */

const SITE = "https://kartogen.ru";

export const metadata: Metadata = {
  title: "Генерация карточек для Wildberries с ИИ — Kartogen",
  description:
    "Создание карточек товара для Wildberries с помощью нейросети: фото товара, инфографика с русским текстом и плашками, SEO-название и описание, анализ карточки. За минуты, без дизайнера. 20 генов в подарок.",
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
      "Фото товара, инфографика с русским текстом, SEO-тексты и анализ карточки для Wildberries — за минуты.",
    url: `${SITE}/wildberries`,
    type: "website",
  },
};

const BLOCKS = [
  {
    icon: LayoutTemplate,
    title: "Инфографика с русским текстом",
    text: "Готовая карточка для WB: крупный заголовок, плашки преимуществ, товар в сцене. Текст рисует сама модель — он часть изображения, а не наклейка, и написан по-русски без ошибок.",
  },
  {
    icon: Wand2,
    title: "Чистое фото товара",
    text: "Новый фон, свет и подача по вашему снимку — или фото по описанию, если снимка нет. Подходит под требования WB к главному изображению.",
  },
  {
    icon: FileText,
    title: "SEO под поиск Wildberries",
    text: "Название с ключами в начале, продающее описание и реальные поисковые запросы покупателей — чтобы карточку находили внутри WB.",
  },
  {
    icon: ScanSearch,
    title: "Анализ готовой карточки",
    text: "Загрузите текущую карточку — ИИ оценит её по критериям и подскажет, что мешает продажам и что исправить в первую очередь.",
  },
];

const STEPS = [
  { icon: Upload, title: "Загрузите фото товара", text: "Или текущую карточку с Wildberries." },
  { icon: Lightbulb, title: "ИИ заполнит данные", text: "Распознает товар, предложит название и преимущества — бесплатно." },
  { icon: Wand2, title: "Соберите карточку", text: "Выберите стиль — студия соберёт инфографику с текстом за 40–90 секунд." },
  { icon: Download, title: "Скачайте под размер WB", text: "900×1200 или 1200×1600, PNG или JPG — в один клик." },
];

const EXAMPLES: ExampleCard[] = [
  { src: "/examples/dress.jpg", title: "Платье", style: "Мягкий лайфстайл" },
  { src: "/examples/coat.jpg", title: "Пуховик", style: "Премиум тёмный" },
  { src: "/examples/sneakers.jpg", title: "Кроссовки", style: "Яркий акцент" },
  { src: "/examples/bedding.png", title: "Постельное бельё", style: "Нежный текстиль" },
  { src: "/examples/humidifier.jpg", title: "Увлажнитель", style: "Бирюзовый фреш" },
  { src: "/examples/backpack.png", title: "Детский рюкзак", style: "Весёлый яркий" },
  { src: "/examples/catfood.png", title: "Корм для кошек", style: "Доверие и состав" },
  { src: "/examples/thermomug.png", title: "Термокружка", style: "Чистый минимал" },
  { src: "/examples/hoodie.jpg", title: "Худи", style: "Поп-арт" },
  { src: "/examples/cream.jpg", title: "Крем для лица", style: "Мягкий лайфстайл" },
  { src: "/examples/suitcase.jpg", title: "Чемодан", style: "Солнечный промо" },
  { src: "/examples/yogamat.jpg", title: "Коврик для йоги", style: "Бирюзовый фреш" },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Какой размер карточки подходит для Wildberries?",
    a: "Wildberries использует вертикальные изображения с соотношением сторон 3:4. Kartogen экспортирует в 900×1200 и 1200×1600 (PNG или JPG) — это вертикаль 3:4 в хорошем разрешении, которую можно загружать в карточку напрямую.",
  },
  {
    q: "Можно ли размещать инфографику на карточке WB?",
    a: "Да. Wildberries разрешает инфографику на изображениях товара — это стандартная практика продавцов. Kartogen как раз собирает такую карточку: заголовок, плашки с преимуществами и товар в сцене. Для главного фото можно сделать более «чистый» вариант без крупных надписей.",
  },
  {
    q: "Нейросеть напишет русский текст на карточке без ошибок?",
    a: "Да. Текст рисует модель, обученная писать по-русски прямо внутри изображения, поэтому заголовки и плашки получаются читаемыми и без «кракозябр». Тексты плашек собираются из ваших данных — их можно поправить перед генерацией.",
  },
  {
    q: "Спишутся ли деньги, если результат не понравился?",
    a: "Гены (внутренняя валюта, 1 ген = 1 ₽) списываются только за успешно созданное изображение или текст. За ошибки сервиса и отклонение модерацией — не списываются. Не понравилась композиция — можно перегенерировать основу, следующий вариант будет другим.",
  },
  {
    q: "Сколько стоит сделать карточку для Wildberries?",
    a: `1 ген = 1 ₽. Инфографика — ${PRICES.infographic} 🧬, фото товара — ${PRICES.generate} 🧬, SEO-тексты — ${PRICES.seo} 🧬, анализ карточки — ${PRICES.analyze} 🧬. Все текстовые помощники (заполнение по фото, промпт, идеи) бесплатны. При регистрации начисляется 20 генов в подарок.`,
  },
  {
    q: "Нужны ли навыки дизайнера или фотостудия?",
    a: "Нет. Достаточно фото товара и пары строк о нём. ИИ сам подберёт стиль, напишет текст и соберёт готовую карточку — фотограф, дизайнер и редакторы не нужны.",
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
        "Создание карточек товара для Wildberries с помощью нейросети: фото, инфографика с русским текстом, SEO-тексты и анализ карточки.",
      isPartOf: { "@type": "WebSite", name: "Kartogen", url: SITE },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Карточки для Wildberries", item: `${SITE}/wildberries` },
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
          Генерация карточек товара для <span className="text-gradient">Wildberries</span> с помощью ИИ
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Фото товара, инфографика с русским текстом и плашками, SEO-название и описание, анализ
          карточки — за минуты и без дизайнера. Загрузите фото товара — остальное сделает нейросеть.
        </p>
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
            20 генов в подарок при регистрации — хватит на первые карточки
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
          Четыре инструмента, которые закрывают карточку от фото до SEO — под требования и поиск WB.
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
          Примеры карточек для маркетплейса
        </h2>
        <p className="mt-2 text-center text-muted-foreground">
          Все карточки ниже сгенерированы этой студией — текст, композиция и стиль подобраны
          автоматически под каждый товар.
        </p>
        <ExamplesMarquee items={EXAMPLES} />
      </section>

      {/* FAQ */}
      <section className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Частые вопросы</h2>
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
            Соберите первую карточку для Wildberries
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">
            Регистрация за минуту, 20 генов в подарок. Тексты, идеи и анализ фото — бесплатно, платите
            только за готовые изображения.
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
          <Link href="/" className="hover:text-foreground">Главная</Link>
          <Link href="/help" className="hover:text-foreground">Как это работает</Link>
          <Link href="/pricing" className="hover:text-foreground">Тарифы</Link>
          <Link href="/offer" className="hover:text-foreground">Публичная оферта</Link>
          <a href="mailto:admin@kartogen.ru" className="hover:text-foreground">admin@kartogen.ru</a>
        </nav>
        <p className="text-xs">
          Kartogen — независимый сервис и не аффилирован с Wildberries. «Wildberries» — товарный знак
          его правообладателя.
        </p>
      </footer>
    </div>
  );
}
