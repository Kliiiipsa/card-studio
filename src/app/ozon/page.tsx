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
  ShieldCheck,
  Crop,
  FileImage,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type ExampleCard } from "@/components/landing/examples-gallery";
import { ExamplesMarquee } from "@/components/landing/examples-marquee";
import { JsonLd } from "@/components/seo/json-ld";
import { SeoFacts } from "@/components/seo/facts";
import { PRICES, WELCOME_SPARKS } from "@/core/billing/prices";

/* ------------------------------------------------------------------ */
/* SEO-посадочная под запросы «карточки/инфографика для Ozon».          */
/*                                                                      */
/* 30.09.2026: разведена с /wildberries. Раньше это был тот же шаблон с */
/* заменой названия площадки. Суть этой страницы — модерация Ozon:      */
/* каким категориям нужна чистая обложка, сколько графики допустимо в   */
/* кадре, какие форматы и разрешения принимает площадка и за что        */
/* отклоняет фото. Цифры совпадают с /trebovaniya-k-foto-ozon.          */
/* ------------------------------------------------------------------ */

const SITE = "https://kartogen.ru";

export const metadata: Metadata = {
  title: "Генерация карточек для Ozon с ИИ — Kartogen",
  description: `Создание карточек товара для Ozon нейросетью под модерацию площадки: чистое главное фото для одежды, обуви, Fresh и «Селекта», инфографика на слайды с товаром не меньше двух третей кадра, SEO-тексты. Вертикаль 3:4, JPEG или PNG. ${WELCOME_SPARKS} генов в подарок.`,
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
      "Чистое главное фото для строгих категорий, инфографика на слайды под правила модерации, SEO-тексты и анализ карточки для Ozon — за минуты.",
    url: `${SITE}/ozon`,
    type: "website",
  },
};

/** фактический абзац под нейропоиск — про правила Ozon, а не про сервис вообще */
const OZON_FACTS =
  `Ozon с февраля 2025 принимает изображения товара в вертикали 3:4 (для Fresh — квадрат 1:1), ` +
  `форматы JPEG, PNG, HEIC и WEBP до 10 МБ, для одежды и обуви минимум 900×1200. Одежде, обуви, ` +
  `Fresh и «Селекту» нужна чистая обложка без надписей, в остальных категориях инфографика на главном ` +
  `фото допустима, если товар занимает не меньше двух третей кадра и текст без цен и обещаний. ` +
  `Kartogen делает чистое главное фото за ${PRICES.generate} ₽ и слайды с русским текстом за ` +
  `${PRICES.infographic} ₽ и 40–90 секунд, SEO-название с описанием за ${PRICES.seo} ₽. ` +
  `${WELCOME_SPARKS} генов (1 ген = 1 ₽) в подарок при регистрации, без подписки.`;

const BLOCKS = [
  {
    icon: Wand2,
    title: "Чистое главное фото под модерацию",
    text: "Для одежды, обуви, Ozon Fresh и «Селекта» обложка обязана быть без плашек: товар крупно на однотонном светлом фоне. Kartogen делает такой кадр из вашего снимка — новый фон, свет, ракурс, без единой надписи.",
  },
  {
    icon: LayoutTemplate,
    title: "Инфографика на следующие слайды",
    text: "Со второго слайда Ozon разрешает плашки в любой категории. Модель пишет русский текст прямо внутри изображения и держит товар главным объектом кадра — так, как требует площадка.",
  },
  {
    icon: FileText,
    title: "Название и описание для поиска Ozon",
    text: "Название с типом товара и ключевыми характеристиками, описание для карточки и список запросов под характеристики. Тексты без обещаний и превосходных степеней, чтобы не спорить с модерацией.",
  },
  {
    icon: ScanSearch,
    title: "Проверка карточки до публикации",
    text: "Загрузите готовую карточку — ИИ посмотрит на неё глазами покупателя и отметит слабые места: обложку, тексты, порядок слайдов. Дешевле, чем узнать это по отсутствию заказов.",
  },
];

/** обложка Ozon по категориям — цифры совпадают с /trebovaniya-k-foto-ozon */
const COVER_RULES: { cat: string; rule: string; tool: string }[] = [
  {
    cat: "Одежда и обувь",
    rule: "Только чистая обложка: модель или товар на однотонном сером фоне, без плашек. Минимум 900×1200.",
    tool: "«Фото товара» → чистый кадр, плашки на 2-й слайд",
  },
  {
    cat: "Ozon Fresh",
    rule: "Квадрат 1:1 вместо вертикали, обложка без надписей.",
    tool: "«Фото товара» в 1:1",
  },
  {
    cat: "«Ozon Селект»",
    rule: "Чистая обложка в высоком разрешении; карточку с текстом на первом фото с витрины снимают.",
    tool: "Два первых слайда: чистый для площадки, с плашками для остальных каналов",
  },
  {
    cat: "Остальные категории",
    rule: "Инфографика на обложке допустима: товар не меньше двух третей кадра, графика до 30% площади, текст описательный, без цен и скидок.",
    tool: "«Инфографика» с товаром крупно",
  },
];

/** за что модерация Ozon отклоняет фото — из базы знаний продавца */
const REJECTS = [
  "Маркетинговый текст на обложке: «хит», «успей», обещание скидки или гарантии",
  "Графика заняла больше трети кадра, товар стал мелким",
  "Плашки в категории с обязательно чистой обложкой",
  "Пёстрый или тёмный фон вместо светлого",
  "Чужие логотипы, водяные знаки, цена на изображении",
  "Фото не совпадает с названием и характеристиками",
];

const STEPS = [
  {
    icon: Upload,
    title: "Загрузите фото товара",
    text: "Подойдёт снимок с телефона или текущая карточка с Ozon.",
  },
  {
    icon: Lightbulb,
    title: "Выберите, что нужно обложке",
    text: "Чистый кадр для строгой категории или инфографика для остальных. ИИ заполнит название и преимущества бесплатно.",
  },
  {
    icon: Wand2,
    title: "Соберите слайды",
    text: "Обложка и следующие слайды собираются по одному, 40–90 секунд каждый. Композиция каждый раз новая.",
  },
  {
    icon: Download,
    title: "Скачайте под Ozon",
    text: "Вертикаль 3:4, 900×1200 или 1200×1600, JPEG для фото и PNG для слайдов с текстом.",
  },
];

const EXAMPLES: ExampleCard[] = [
  { src: "/examples/thermos.jpg", title: "Термос", style: "Сцена-история" },
  { src: "/examples/overalls.jpg", title: "Детский комбинезон", style: "Бирюзовый фреш" },
  { src: "/examples/woolcoat.jpg", title: "Пальто", style: "Сцена-история" },
  { src: "/examples/tracksuit.jpg", title: "Спортивный костюм", style: "Яркий акцент" },
  { src: "/examples/humidifier.jpg", title: "Увлажнитель", style: "Бирюзовый фреш" },
  { src: "/examples/catfood.jpg", title: "Корм для кошек", style: "Доверие и состав" },
  { src: "/examples/thermomug.jpg", title: "Термокружка", style: "Чистый минимал" },
  { src: "/examples/coat.jpg", title: "Пуховик", style: "Премиум тёмный" },
  { src: "/examples/bedding.jpg", title: "Постельное бельё", style: "Нежный текстиль" },
  { src: "/examples/sneakers.jpg", title: "Кроссовки", style: "Яркий акцент" },
  { src: "/examples/hoodie.jpg", title: "Худи", style: "Поп-арт" },
  { src: "/examples/cream.jpg", title: "Крем для лица", style: "Мягкий лайфстайл" },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Какой размер изображений нужен для Ozon?",
    a: "Вертикаль 3:4, действует с февраля 2025 года; для категории Fresh — квадрат 1:1. Для одежды, обуви и аксессуаров минимум 900×1200. Технический минимум для остальных категорий 200×200, но ориентироваться стоит на 1500–3000 пикселей по меньшей стороне, иначе не работает зум. Kartogen отдаёт 900×1200 и 1200×1600 в 3:4.",
  },
  {
    q: "Можно ли инфографику с текстом на главном фото Ozon?",
    a: "В большинстве категорий можно, с ограничениями: товар занимает не меньше двух третей кадра, графика примерно до 30% площади, текст только описательный, без цен, скидок и обещаний. Обложка обязана быть чистой у одежды и обуви, Ozon Fresh и «Селекта». Список исключений меняется, сверьте свою категорию в базе знаний продавца. В Kartogen для строгих категорий есть «Фото товара», для остальных «Инфографика».",
  },
  {
    q: "Какие форматы и вес файла принимает Ozon?",
    a: "JPEG, PNG, HEIC и WEBP, цветовой профиль sRGB, размер файла до 10 МБ. Для фото товара подходит JPEG, для слайдов с текстом лучше PNG — края букв остаются резкими. Kartogen сохраняет в sRGB, поэтому цвета на витрине совпадут с тем, что вы видели при генерации.",
  },
  {
    q: "Почему модерация Ozon отклоняет фото и как этого избежать?",
    a: "Чаще всего из-за маркетингового текста на обложке, слишком мелкого товара под графикой, плашек в категории с чистой обложкой, тёмного или пёстрого фона, чужих логотипов и цены на изображении. В Kartogen товар всегда главный объект кадра, есть светлые стили под требования площадки, а тексты плашек вы видите и правите до генерации, так что «хит» и «скидка» туда не попадут.",
  },
  {
    q: "Что такое чистое фото для «Ozon Селекта» и как его сделать из обычного снимка?",
    a: "«Селект» — витрина отобранных товаров с повышенными требованиями: главное фото без плашек, надписей, коллажей и логотипов, товар крупно на однотонном светлом фоне, вертикаль 3:4 в высоком разрешении. В Kartogen это раздел «Фото товара»: загружаете свой снимок, выбираете студийную подачу, получаете чистый кадр. Плашки при этом уходят на второй слайд.",
  },
  {
    q: "Сколько стоит подготовить карточку для Ozon?",
    a: `Чистое главное фото — ${PRICES.generate} ₽, слайд с инфографикой — ${PRICES.infographic} ₽, название с описанием — ${PRICES.seo} ₽, проверка карточки — ${PRICES.analyze} ₽. Заполнение данных по фото и подбор текстов бесплатны. При регистрации ${WELCOME_SPARKS} генов в подарок: это чистая обложка плюс слайд с плашками. Подписки нет.`,
  },
  {
    q: "Подходят ли карточки из Kartogen одновременно для Ozon и Wildberries?",
    a: "Да, обе площадки используют вертикаль 3:4, и файлы 900×1200 и 1200×1600 подходят обеим. Разница в обложке: Ozon в строгих категориях требует чистое первое фото, а на Wildberries плашки на обложке — норма. Поэтому для одежды и обуви держите два варианта первого слайда, остальные слайды общие.",
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
        "Создание карточек товара для Ozon нейросетью под модерацию площадки: чистое главное фото для строгих категорий, инфографика на слайды, SEO-тексты и анализ карточки.",
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
          Чистое главное фото для категорий со строгой обложкой, инфографика на слайды по правилам
          модерации, название и описание для поиска Ozon. Всё в вертикали 3:4 и без правок после
          отклонения.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" variant="gradient">
            <Link href={authed ? "/dashboard" : "/register"}>
              {authed ? "Открыть студию" : "Сделать карточку для Ozon"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="#cover-rules">Правила обложки по категориям</Link>
          </Button>
        </div>
        {!authed && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Dna className="h-4 w-4 text-primary" />
            {WELCOME_SPARKS} генов в подарок — чистая обложка и слайд с плашками
          </p>
        )}
        {/* Фактический абзац для нейропоиска — ПОСЛЕ кнопки: на телефоне он
            выталкивал главную кнопку за первый экран (проверка 30.09.2026). */}
        <SeoFacts text={OZON_FACTS} className="mt-8 max-w-2xl text-left" />

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

      {/* Cover rules by category */}
      <section id="cover-rules" className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Обложка на Ozon: чистая или с плашками?
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-muted-foreground">
          Зависит от категории. Ошибка здесь — самая частая причина отклонения на модерации.
        </p>
        {/* на телефоне таблица из трёх колонок сжимается в столбики по 2–3 слова —
            там показываем карточки, таблица только от sm */}
        <div className="mt-8 space-y-3 sm:hidden">
          {COVER_RULES.map((r) => (
            <div key={r.cat} className="rounded-2xl border bg-card p-4">
              <p className="font-semibold">{r.cat}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{r.rule}</p>
              <p className="mt-2 text-sm">
                <span className="text-muted-foreground">В Kartogen: </span>
                {r.tool}
              </p>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-10 hidden max-w-4xl overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-3 pr-4 font-medium">Категория</th>
                <th className="py-3 pr-4 font-medium">Правило Ozon</th>
                <th className="py-3 font-medium">Что делать в Kartogen</th>
              </tr>
            </thead>
            <tbody>
              {COVER_RULES.map((r) => (
                <tr key={r.cat} className="border-b align-top last:border-0">
                  <td className="py-3 pr-4 font-medium">{r.cat}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{r.rule}</td>
                  <td className="py-3 text-muted-foreground">{r.tool}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Полный разбор с форматами и разрешениями —{" "}
          <Link href="/trebovaniya-k-foto-ozon" className="text-primary hover:underline">
            требования к фото Ozon
          </Link>
          .
        </p>
      </section>

      {/* What you get */}
      <section className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Нейросеть для карточек Ozon: от обложки до описания
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-muted-foreground">
          Четыре инструмента, каждый с оглядкой на модерацию площадки. Онлайн, без программ.
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

      {/* Formats + rejects */}
      <section className="container py-16">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border bg-card p-6">
            <Crop className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold">Формат кадра</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Вертикаль 3:4 с февраля 2025. Fresh — квадрат 1:1. Одежда и обувь — от 900×1200,
              остальным категориям лучше 1500–3000 px по меньшей стороне, иначе не работает зум.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <FileImage className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold">Файлы</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              JPEG, PNG, HEIC, WEBP до 10 МБ, профиль sRGB. Фото товара — JPEG, слайды с текстом —
              PNG, чтобы буквы остались резкими.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <XCircle className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold">За что отклоняет модерация</h3>
            <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
              {REJECTS.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
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
          Слайды с инфографикой, сделанные в студии
        </h2>
        <p className="mt-2 text-center text-muted-foreground">
          Товар крупно, светлый фон, описательный текст плашек — такие слайды проходят модерацию
          Ozon со второго изображения, а в нестрогих категориях и на обложке.
        </p>
        <ExamplesMarquee items={EXAMPLES} />
      </section>

      {/* FAQ */}
      <section className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Частые вопросы о карточках Ozon
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
          <ShieldCheck className="mx-auto h-8 w-8 text-white/90" />
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Карточка для Ozon, которую примет модерация
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">
            Регистрация за минуту, {WELCOME_SPARKS} генов в подарок: чистая обложка и слайд с
            плашками. Заполнение по фото и подбор текстов бесплатны.
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
          <Link href="/wildberries" className="hover:text-foreground">
            Для Wildberries
          </Link>
          <Link href="/photo" className="hover:text-foreground">
            Фото товара
          </Link>
          <Link href="/infografika" className="hover:text-foreground">
            Инфографика
          </Link>
          <Link href="/trebovaniya-k-foto-ozon" className="hover:text-foreground">
            Требования к фото Ozon
          </Link>
          <Link href="/razmer-kartochki-ozon" className="hover:text-foreground">
            Размер карточки Ozon
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
          Kartogen — независимый сервис и не аффилирован с Ozon. «Ozon» — товарный знак его
          правообладателя.
        </p>
      </footer>
    </div>
  );
}
