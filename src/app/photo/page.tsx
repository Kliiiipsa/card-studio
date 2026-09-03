import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/core/auth/session";
import {
  Wand2,
  Camera,
  Palette,
  Clapperboard,
  Upload,
  SlidersHorizontal,
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
/* SEO-посадочная под запросы «фото товара нейросетью / предметная      */
/* съёмка ИИ / фон для фото товара» — по шаблону /wildberries.          */
/* ------------------------------------------------------------------ */

const SITE = "https://kartogen.ru";

export const metadata: Metadata = {
  title: "Фото товара нейросетью — предметная съёмка без студии | Kartogen",
  description:
    "Профессиональное фото товара для маркетплейсов с помощью ИИ: новый фон и свет по вашему снимку, лайфстайл-сцены, чистая студия под главное фото WB и Ozon. Без фотографа, за минуту. 20 генов в подарок.",
  keywords: [
    "фото товара нейросеть",
    "предметная съёмка ИИ",
    "фон для фото товара",
    "фото для маркетплейса",
    "заменить фон на фото товара",
    "фото товара для Wildberries",
  ],
  alternates: { canonical: `${SITE}/photo` },
  openGraph: {
    title: "Фото товара нейросетью — предметная съёмка без студии | Kartogen",
    description:
      "Новый фон, свет и подача по вашему снимку — профессиональное фото товара за минуту, без фотографа.",
    url: `${SITE}/photo`,
    type: "website",
  },
};

const BLOCKS = [
  {
    icon: Camera,
    title: "Студийный кадр из любого снимка",
    text: "Сфотографируйте товар хоть на подоконнике — ИИ поставит его в чистую студию с профессиональным светом и мягкими тенями. Форма, цвет и фактура товара сохраняются.",
  },
  {
    icon: Palette,
    title: "Лайфстайл-сцены под товар",
    text: "Кухня для посуды, улица для одежды, природа для термоса — сцена подбирается под ваш товар, а не по одному шаблону. Каждая генерация — новый вариант.",
  },
  {
    icon: Wand2,
    title: "Фото по описанию — без снимка",
    text: "Нет фото? Опишите товар словами — нейросеть нарисует предметный кадр с нуля: ракурс, фон и свет на ваш выбор.",
  },
  {
    icon: Clapperboard,
    title: "Видео товара из одного фото",
    text: "Оживите кадр: 5-секундный ролик с движением камеры и товаром в сцене — заметный формат для карточки и рекламы.",
  },
];

const STEPS = [
  { icon: Upload, title: "Загрузите фото товара", text: "Подойдёт даже снимок на телефон." },
  { icon: SlidersHorizontal, title: "Выберите сценарий", text: "Студия, лайфстайл или просто замена фона — и силу изменения." },
  { icon: Wand2, title: "Сгенерируйте", text: "ИИ сохранит товар и пересоберёт фон, свет и подачу за ~30 секунд." },
  { icon: Download, title: "Скачайте под маркетплейс", text: "Вертикаль 3:4 — 900×1200 или 1200×1600, PNG или JPG." },
];

const EXAMPLES: ExampleCard[] = [
  { src: "/examples/woolcoat.jpg", title: "Пальто", style: "Осенняя сцена" },
  { src: "/examples/thermos.jpg", title: "Термос", style: "Горы на закате" },
  { src: "/examples/tracksuit.jpg", title: "Спортивный костюм", style: "Городская сцена" },
  { src: "/examples/overalls.jpg", title: "Детский комбинезон", style: "Зимний лес" },
  { src: "/examples/dress.jpg", title: "Платье", style: "Мягкий лайфстайл" },
  { src: "/examples/coat.jpg", title: "Пуховик", style: "Премиум тёмный" },
  { src: "/examples/thermomug.png", title: "Термокружка", style: "Чистый минимал" },
  { src: "/examples/sneakers.jpg", title: "Кроссовки", style: "Яркий акцент" },
  { src: "/examples/humidifier.jpg", title: "Увлажнитель", style: "Бирюзовый фреш" },
  { src: "/examples/cream.jpg", title: "Крем для лица", style: "Мягкий лайфстайл" },
  { src: "/examples/bedding.png", title: "Постельное бельё", style: "Нежный текстиль" },
  { src: "/examples/suitcase.jpg", title: "Чемодан", style: "Солнечный промо" },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Товар на фото не «поплывёт» после генерации?",
    a: "Сохранение товара — главное правило генерации: форма, цвет, материал и пропорции остаются вашими, меняются фон, свет и подача. Силу изменения вы регулируете сами, а нежелательные эффекты дополнительно ограничены настройками генерации.",
  },
  {
    q: "Подойдёт ли такое фото для главного изображения на WB и Ozon?",
    a: "Да. Режим «студийный фон» даёт чистый кадр без надписей на светлом фоне — именно такое главное фото требуют обе площадки. Экспорт в вертикали 3:4 (900×1200 или 1200×1600) подходит для загрузки напрямую.",
  },
  {
    q: "Что делать, если нет нормального фото товара?",
    a: "Достаточно любого снимка на телефон — фон и свет ИИ пересоберёт. А если фото нет совсем, опишите товар словами: режим «по описанию» нарисует предметный кадр с нуля.",
  },
  {
    q: "Чем «Фото товара» отличается от «Инфографики»?",
    a: "Фото товара — это чистое изображение без надписей: новый фон, свет и подача. Инфографика — это фото плюс текст: заголовок, плашки с преимуществами. Для обложки нужен чистый кадр, для дополнительных слайдов — инфографика.",
  },
  {
    q: "Сколько стоит фото товара?",
    a: `1 ген = 1 ₽. Фото товара — ${PRICES.generate} 🧬 за генерацию, инфографика — ${PRICES.infographic} 🧬, видео товара — ${PRICES.video} 🧬. Гены списываются только за успешный результат; при регистрации — 20 генов в подарок.`,
  },
  {
    q: "Сколько времени занимает генерация?",
    a: "Обычно 20–60 секунд на кадр. За пару минут можно перебрать несколько сцен и выбрать лучшую — против дней ожидания фотостудии.",
  },
];

export default async function PhotoLanding() {
  const secret = process.env.AUTH_SECRET;
  const token = cookies().get(SESSION_COOKIE)?.value;
  const authed = secret ? Boolean(await verifySessionToken(secret, token)) : false;

  const structured: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Фото товара нейросетью — предметная съёмка без студии",
      url: `${SITE}/photo`,
      inLanguage: "ru-RU",
      description:
        "Профессиональное фото товара для маркетплейсов с помощью ИИ: новый фон и свет по вашему снимку, лайфстайл-сцены, чистая студия под главное фото.",
      isPartOf: { "@type": "WebSite", name: "Kartogen", url: SITE },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Фото товара", item: `${SITE}/photo` },
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
          Предметная съёмка без студии
        </Badge>
        <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Фото товара <span className="text-gradient">нейросетью</span> — как из фотостудии
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Загрузите любой снимок — ИИ сохранит товар и пересоберёт фон, свет и подачу: чистая студия
          под главное фото или живая сцена под ваш товар. Без фотографа, аренды и ожидания.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" variant="gradient">
            <Link href={authed ? "/generator" : "/register"}>
              {authed ? "Открыть фото товара" : "Сделать фото товара"}
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
            20 генов в подарок при регистрации — первое фото бесплатно
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
                alt={`Фото товара нейросетью: ${c.title} — ${c.style}`}
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
          Что умеет ИИ-фотостудия
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-muted-foreground">
          Четыре режима — от чистой студии до живых сцен и видео. Товар всегда остаётся вашим:
          меняются фон, свет и подача.
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
          Фото товара за 4 шага
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
          Примеры генераций студии
        </h2>
        <p className="mt-2 text-center text-muted-foreground">
          Сцены и свет во всех примерах созданы нейросетью — на базе таких фото собираются и чистые
          кадры, и карточки с инфографикой.
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
            Сделайте первое фото товара
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">
            Регистрация за минуту, 20 генов в подарок — первое фото бесплатно. Платите только за
            готовые изображения.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-8">
            <Link href={authed ? "/generator" : "/register"}>
              {authed ? "Открыть фото товара" : "Начать бесплатно"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="container flex flex-col items-center gap-3 border-t py-8 text-center text-sm text-muted-foreground">
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/" className="hover:text-foreground">Главная</Link>
          <Link href="/wildberries" className="hover:text-foreground">Для Wildberries</Link>
          <Link href="/ozon" className="hover:text-foreground">Для Ozon</Link>
          <Link href="/help" className="hover:text-foreground">Как это работает</Link>
          <Link href="/pricing" className="hover:text-foreground">Тарифы</Link>
          <a href="mailto:admin@kartogen.ru" className="hover:text-foreground">admin@kartogen.ru</a>
        </nav>
        <p className="text-xs">
          Kartogen — независимый сервис и не аффилирован с маркетплейсами. Упомянутые товарные знаки
          принадлежат их правообладателям.
        </p>
      </footer>
    </div>
  );
}
