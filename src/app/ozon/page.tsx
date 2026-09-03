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
/* SEO-посадочная под запросы «карточки/инфографика для Ozon» — по      */
/* шаблону /wildberries, с озоновской спецификой: 3:4, чистое главное   */
/* фото, разрешение по категориям.                                      */
/* ------------------------------------------------------------------ */

const SITE = "https://kartogen.ru";

export const metadata: Metadata = {
  title: "Генерация карточек для Ozon с ИИ — Kartogen",
  description:
    "Создание карточек товара для Ozon с помощью нейросети: фото товара под требования площадки, инфографика с русским текстом, SEO-тексты и анализ карточки. Вертикаль 3:4, за минуты, без дизайнера. 20 генов в подарок.",
  keywords: [
    "генерация карточек Ozon",
    "карточки для Озон",
    "инфографика для Ozon",
    "нейросеть для карточек Ozon",
    "создать карточку товара Озон",
    "фото товара для Ozon",
  ],
  alternates: { canonical: `${SITE}/ozon` },
  openGraph: {
    title: "Генерация карточек для Ozon с ИИ — Kartogen",
    description:
      "Фото товара, инфографика с русским текстом, SEO-тексты и анализ карточки для Ozon — за минуты.",
    url: `${SITE}/ozon`,
    type: "website",
  },
};

const BLOCKS = [
  {
    icon: LayoutTemplate,
    title: "Инфографика с русским текстом",
    text: "Готовые дополнительные слайды для Ozon: крупный заголовок, плашки преимуществ, товар в сцене. Текст рисует сама модель — по-русски и без ошибок, это часть изображения, а не наклейка.",
  },
  {
    icon: Wand2,
    title: "Чистое главное фото",
    text: "Ozon строго требует главное фото без текста и графики. Сделайте чистый студийный кадр из вашего снимка — новый фон, свет и подача, без надписей, под модерацию площадки.",
  },
  {
    icon: FileText,
    title: "SEO-название и описание",
    text: "Название с ключами, продающее описание и поисковые запросы покупателей — чтобы карточку находили в поиске Ozon и вне его.",
  },
  {
    icon: ScanSearch,
    title: "Анализ готовой карточки",
    text: "Загрузите текущую карточку — ИИ оценит её глазами покупателя и подскажет, что мешает продажам и что исправить в первую очередь.",
  },
];

const STEPS = [
  { icon: Upload, title: "Загрузите фото товара", text: "Или текущую карточку с Ozon." },
  { icon: Lightbulb, title: "ИИ заполнит данные", text: "Распознает товар, предложит название и преимущества — бесплатно." },
  { icon: Wand2, title: "Соберите карточку", text: "Выберите стиль — студия соберёт инфографику с текстом за 40–90 секунд." },
  { icon: Download, title: "Скачайте под размер Ozon", text: "Вертикаль 3:4 — 900×1200 или 1200×1600, PNG или JPG." },
];

const EXAMPLES: ExampleCard[] = [
  { src: "/examples/thermos.jpg", title: "Термос", style: "Сцена-история" },
  { src: "/examples/coat.jpg", title: "Пуховик", style: "Премиум тёмный" },
  { src: "/examples/overalls.jpg", title: "Детский комбинезон", style: "Бирюзовый фреш" },
  { src: "/examples/sneakers.jpg", title: "Кроссовки", style: "Яркий акцент" },
  { src: "/examples/woolcoat.jpg", title: "Пальто", style: "Сцена-история" },
  { src: "/examples/humidifier.jpg", title: "Увлажнитель", style: "Бирюзовый фреш" },
  { src: "/examples/bedding.png", title: "Постельное бельё", style: "Нежный текстиль" },
  { src: "/examples/tracksuit.jpg", title: "Спортивный костюм", style: "Яркий акцент" },
  { src: "/examples/catfood.png", title: "Корм для кошек", style: "Доверие и состав" },
  { src: "/examples/thermomug.png", title: "Термокружка", style: "Чистый минимал" },
  { src: "/examples/hoodie.jpg", title: "Худи", style: "Поп-арт" },
  { src: "/examples/cream.jpg", title: "Крем для лица", style: "Мягкий лайфстайл" },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Какой размер изображений нужен для Ozon?",
    a: "С 2025 года Ozon использует вертикальные изображения 3:4 (исключение — категория Fresh, там квадрат 1:1). Для одежды и обуви минимальное разрешение 900×1200. Kartogen экспортирует в 900×1200 и 1200×1600 (PNG или JPG) — это подходит под требования напрямую.",
  },
  {
    q: "Можно ли инфографику с текстом на главном фото Ozon?",
    a: "Нет — Ozon требует чистое главное фото: товар без текста, логотипов и графики. Инфографику размещают со второго слайда. В Kartogen это решается парой: чистое «Фото товара» на обложку + инфографика с плашками на дополнительные кадры.",
  },
  {
    q: "Чем требования Ozon отличаются от Wildberries?",
    a: "Обе площадки используют вертикаль 3:4, но Ozon строже запрещает текст на главном фото, задаёт минимальное разрешение по категориям (для одежды от 900×1200) и сохраняет квадрат только для Fresh. Карточки из Kartogen подходят под обе площадки.",
  },
  {
    q: "Нейросеть напишет русский текст на слайдах без ошибок?",
    a: "Да. Текст рисует модель, обученная писать по-русски прямо внутри изображения — заголовки и плашки получаются читаемыми, без «кракозябр». Тексты собираются из ваших данных, и их можно поправить перед генерацией.",
  },
  {
    q: "Сколько стоит сделать карточку для Ozon?",
    a: `1 ген = 1 ₽. Инфографика — ${PRICES.infographic} 🧬, фото товара — ${PRICES.generate} 🧬, SEO-тексты — ${PRICES.seo} 🧬, анализ карточки — ${PRICES.analyze} 🧬. Текстовые помощники (заполнение по фото, идеи) бесплатны. При регистрации — 20 генов в подарок.`,
  },
  {
    q: "Спишутся ли гены, если результат не понравился?",
    a: "Гены списываются только за успешно созданное изображение или текст. За ошибки сервиса — не списываются. Не понравилась композиция — перегенерируйте основу: следующий вариант будет другим.",
  },
];

export default async function OzonLanding() {
  const secret = process.env.AUTH_SECRET;
  const token = cookies().get(SESSION_COOKIE)?.value;
  const authed = secret ? Boolean(await verifySessionToken(secret, token)) : false;

  const structured: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Генерация карточек для Ozon с ИИ",
      url: `${SITE}/ozon`,
      inLanguage: "ru-RU",
      description:
        "Создание карточек товара для Ozon с помощью нейросети: фото под требования площадки, инфографика с русским текстом, SEO-тексты и анализ карточки.",
      isPartOf: { "@type": "WebSite", name: "Kartogen", url: SITE },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Карточки для Ozon", item: `${SITE}/ozon` },
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
          Для селлеров Ozon
        </Badge>
        <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Генерация карточек товара для <span className="text-gradient">Ozon</span> с помощью ИИ
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Чистое главное фото под модерацию, инфографика с русским текстом на дополнительные слайды,
          SEO-тексты и анализ карточки — за минуты и без дизайнера. Всё в вертикали 3:4, как требует
          Ozon.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" variant="gradient">
            <Link href={authed ? "/dashboard" : "/register"}>
              {authed ? "Открыть студию" : "Сделать карточку для Ozon"}
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
                alt={`Карточка для Ozon: ${c.title} — ${c.style}`}
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
          Всё для карточки Ozon в одном месте
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-muted-foreground">
          Четыре инструмента, которые закрывают карточку от главного фото до SEO — под требования и
          модерацию Ozon.
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
          Как сделать карточку для Ozon за 4 шага
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
            Соберите первую карточку для Ozon
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">
            Регистрация за минуту, 20 генов в подарок. Тексты, идеи и заполнение по фото — бесплатно,
            платите только за готовые изображения.
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
          <Link href="/wildberries" className="hover:text-foreground">Для Wildberries</Link>
          <Link href="/help" className="hover:text-foreground">Как это работает</Link>
          <Link href="/pricing" className="hover:text-foreground">Тарифы</Link>
          <Link href="/offer" className="hover:text-foreground">Публичная оферта</Link>
          <a href="mailto:admin@kartogen.ru" className="hover:text-foreground">admin@kartogen.ru</a>
        </nav>
        <p className="text-xs">
          Kartogen — независимый сервис и не аффилирован с Ozon. «Ozon» — товарный знак его
          правообладателя.
        </p>
      </footer>
    </div>
  );
}
