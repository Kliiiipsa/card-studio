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
import { SeoFacts } from "@/components/seo/facts";
import { Table, Ul, Tip } from "@/components/seo/article-page";
import { PRICES, WELCOME_SPARKS } from "@/core/billing/prices";

/* ------------------------------------------------------------------ */
/* SEO-посадочная под запросы «фото товара нейросетью / предметная      */
/* съёмка ИИ / фон для фото товара» — по шаблону /wildberries.          */
/* ------------------------------------------------------------------ */

const SITE = "https://kartogen.ru";

export const metadata: Metadata = {
  // Заголовок переписан 10.09.2026 по запросам из Вебмастера. Люди ищут «фото
  // товара В СТУДИИ нейросеть» и «фото товара ПО ОПИСАНИЮ», а прежний заголовок
  // обещал съёмку «БЕЗ студии» — формально про экономию на аренде, но в выдаче
  // читалось как «студийного вида не будет». Теперь оба намерения названы прямо.
  title: "Фото товара нейросетью: студийные кадры и сцены — Kartogen",
  description: `Предметная съёмка для карточки товара нейросетью: чистый студийный фон, лайфстайл-сцены, новый свет по вашему снимку или фото по описанию. Под требования WB и Ozon, за минуту, без фотографа. ${WELCOME_SPARKS} генов в подарок.`,
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
  {
    icon: SlidersHorizontal,
    title: "Выберите сценарий",
    text: "Студия, лайфстайл или просто замена фона — и силу изменения.",
  },
  {
    icon: Wand2,
    title: "Сгенерируйте",
    text: "ИИ сохранит товар и пересоберёт фон, свет и подачу за ~30 секунд.",
  },
  {
    icon: Download,
    title: "Скачайте под маркетплейс",
    text: "Вертикаль 3:4 — 900×1200 или 1200×1600, PNG или JPG.",
  },
];

const EXAMPLES: ExampleCard[] = [
  { src: "/examples/woolcoat.jpg", title: "Пальто", style: "Осенняя сцена" },
  { src: "/examples/thermos.jpg", title: "Термос", style: "Горы на закате" },
  { src: "/examples/tracksuit.jpg", title: "Спортивный костюм", style: "Городская сцена" },
  { src: "/examples/overalls.jpg", title: "Детский комбинезон", style: "Зимний лес" },
  { src: "/examples/dress.jpg", title: "Платье", style: "Мягкий лайфстайл" },
  { src: "/examples/coat.jpg", title: "Пуховик", style: "Премиум тёмный" },
  { src: "/examples/thermomug.jpg", title: "Термокружка", style: "Чистый минимал" },
  { src: "/examples/sneakers.jpg", title: "Кроссовки", style: "Яркий акцент" },
  { src: "/examples/humidifier.jpg", title: "Увлажнитель", style: "Бирюзовый фреш" },
  { src: "/examples/cream.jpg", title: "Крем для лица", style: "Мягкий лайфстайл" },
  { src: "/examples/bedding.jpg", title: "Постельное бельё", style: "Нежный текстиль" },
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
    a: `1 ген = 1 ₽. Фото товара — ${PRICES.generate} 🧬 за генерацию, инфографика — ${PRICES.infographic} 🧬, видео товара — ${PRICES.video} 🧬. Гены списываются только за успешный результат; при регистрации — ${WELCOME_SPARKS} генов в подарок.`,
  },
  {
    q: "Сколько времени занимает генерация?",
    a: "Обычно 20–60 секунд на кадр. За пару минут можно перебрать несколько сцен и выбрать лучшую — против дней ожидания фотостудии.",
  },
  {
    q: "Как заменить фон на фото товара?",
    a: "Загрузите снимок и выберите сценарий «Смена фона»: товар останется кадр в кадр, а вокруг него соберётся новое окружение под вашу категорию. Если нужен нейтральный кадр под главное фото карточки, берите «Студийный фон» — чистый бесшовный фон с мягким светом. По умолчанию стоит «Оставить как есть», то есть фон не меняется, пока вы не попросили.",
  },
  {
    q: "Можно ли получить фото товара без фона, в прозрачном PNG?",
    a: "Нет, и это осознанное ограничение: сервис не вырезает товар по контуру, а перерисовывает кадр целиком с новым фоном. Для маркетплейсов прозрачный фон и не нужен — площадки ждут готовое изображение на светлом фоне, именно его даёт сценарий «Студийный фон».",
  },
  {
    q: "Какой фон лучше для главного фото карточки?",
    a: "Светлый и чистый: так требуют обе площадки, и в пёстрой выдаче такая карточка читается лучше всего. Живые сцены работают со второго-третьего слайда, где нужно показать товар в использовании. Подробный разбор по категориям — в статье блога «Какой фон выбрать для карточки товара».",
  },
  {
    q: "Чем фото товара отличается от видео товара?",
    a: `Фото — это один кадр за ${PRICES.generate} генов: новый фон, свет и подача. Видео — пятисекундный ролик из того же снимка за ${PRICES.video} генов: камера двигается, товар получает объём. Обычно делают сначала фото, а ролик уже из удачного кадра.`,
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
        <SeoFacts className="mt-5 max-w-2xl text-left" />
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
            {WELCOME_SPARKS} генов в подарок при регистрации — первое фото бесплатно
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
        <h2 className="text-center text-3xl font-bold tracking-tight">Что умеет ИИ-фотостудия</h2>
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
        <h2 className="text-center text-3xl font-bold tracking-tight">Фото товара за 4 шага</h2>
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

      {/* Содержательная часть: кластер «фон / фото товара» — самый крупный у
          нас по показам (49 запросов, 176 показов, средняя позиция 8,8 на
          20.09.2026), а страница под него была на 606 слов без единого
          заголовка про фон. Разделы отвечают на ОПЕРАЦИЮ («как заменить фон
          на своём снимке»); выбор фона по категориям разобран в статье блога
          /blog/fon-dlya-kartochki-tovara — тексты не пересекаются. */}
      <section className="container max-w-3xl py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Фон для фото товара: заменить, оставить или собрать студию
        </h2>
        <p className="mt-3 text-muted-foreground">
          Фон на карточке решает, выглядит товар дорого или случайно. Переснимать ради этого не
          нужно: нейросеть работает с вашим снимком и меняет окружение, сохраняя сам товар. Выбор
          сводится к трём сценариям, и это осознанное решение, а не настройка по умолчанию.
        </p>
        <Table
          head={["Сценарий", "Что происходит с фоном", "Когда брать"]}
          rows={[
            [
              "Оставить как есть",
              "Фон, свет и окружение вашего снимка не трогаются вообще",
              "Когда фон уже хороший, а поправить нужно что-то одно",
            ],
            [
              "Студийный фон",
              "Собирается чистый бесшовный фон с мягким светом и естественной тенью",
              "Главное фото карточки: площадки ждут чистый кадр",
            ],
            [
              "Смена фона",
              "Товар остаётся кадр в кадр, вокруг него строится новое подходящее окружение",
              "Когда снимали дома и нужен приличный фон вместо подоконника",
            ],
          ]}
        />
        <p className="mt-4 text-muted-foreground">
          Разница между «студийным фоном» и «сменой фона» в замысле. Студия делает нейтральный кадр,
          где товар единственный герой. Смена фона подбирает окружение под категорию: дерево и лён
          для посуды, бетон и металл для инструмента. Режим «оставить как есть» стоит по умолчанию
          намеренно: фон меняется только тогда, когда вы этого попросили.
        </p>
        <p className="mt-3 text-muted-foreground">
          Какой именно фон уместен вашей категории и что площадки разрешают на обложке, разобрано
          отдельно в статье{" "}
          <Link href="/blog/fon-dlya-kartochki-tovara" className="text-primary hover:underline">
            «Какой фон выбрать для карточки товара»
          </Link>
          .
        </p>
      </section>

      <section className="container max-w-3xl py-10">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Фото товара в студии нейросетью: что происходит со снимком
        </h2>
        <p className="mt-3 text-muted-foreground">
          Модель не вырезает товар по контуру и не подставляет его на картинку. Она перерисовывает
          кадр целиком, удерживая форму, цвет, материал и пропорции вашего товара и заново
          выстраивая свет вокруг него. Поэтому тень ложится физически правдоподобно, а блик на
          металле соответствует новому источнику света — то, чего не даёт простая замена фона в
          редакторе.
        </p>
        <p className="mt-3 text-muted-foreground">
          Обратная сторона та же: это генерация, а не ретушь. Мелкие надписи на упаковке, штрихкоды
          и сложная фурнитура при перерисовке могут измениться. Поэтому для товаров, где важна
          этикетка, берите «оставить как есть» и меняйте только свет, а студийный фон используйте
          там, где героем выступает сама форма предмета.
        </p>
        <p className="mt-3 text-muted-foreground">
          Сила изменения регулируется: чем она ниже, тем ближе результат к исходнику. Начинать стоит
          с умеренной, посмотреть на товар в результате и только потом поднимать.
        </p>
      </section>

      <section className="container max-w-3xl py-10">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Лайфстайл-фото товара: когда сцена продаёт лучше белого фона
        </h2>
        <p className="mt-3 text-muted-foreground">
          Лайфстайл-сцена показывает товар там, где им пользуются: термос в горах, крем на полке в
          ванной, костюм на городской улице. Такой кадр отвечает на вопрос, который покупатель не
          задаёт вслух: как эта вещь будет выглядеть у меня. На белом фоне ответить на него нечем.
        </p>
        <p className="mt-3 text-muted-foreground">
          Работает это не везде. Сцена помогает одежде, посуде, товарам для дома и всему, что
          связано с образом жизни. Крепежу, расходникам и запчастям она скорее мешает: там
          покупателю нужны размер и совместимость, а не настроение. Для таких категорий лучше
          студийный кадр и крупный план.
        </p>
        <p className="mt-3 text-muted-foreground">
          Практическое правило для карточки: обложка чистая, лайфстайл со второго-третьего слайда.
          Площадки ждут на главном фото товар без лишнего окружения, и сцена там чаще вредит, чем
          помогает.
        </p>
      </section>

      <section className="container max-w-3xl py-10">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Остальные сценарии съёмки</h2>
        <p className="mt-3 text-muted-foreground">
          Кроме фона и сцены есть ещё четыре режима — они отвечают за ракурс и подачу, а не за
          окружение.
        </p>
        <Table
          head={["Сценарий", "Что даёт", "Для какого слайда"]}
          rows={[
            [
              "Крупный план",
              "Фактура материала, швы, детали качества с малой глубиной резкости",
              "Слайд про материал и качество исполнения",
            ],
            [
              "Раскладка сверху",
              "Вид сверху, товар и несколько уместных предметов, много воздуха",
              "Комплектация, наборы, аксессуары",
            ],
            [
              "Праздничная подача",
              "Сезонное оформление и настроение вокруг товара",
              "Предновогодние и подарочные карточки",
            ],
            [
              "Фото по описанию",
              "Кадр рисуется с нуля по тексту, без исходного снимка",
              "Когда товара ещё нет на руках",
            ],
          ]}
        />
      </section>

      <section className="container max-w-3xl py-10">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Фото товара по описанию, если снимка нет
        </h2>
        <p className="mt-3 text-muted-foreground">
          Режим «по описанию» рисует предметный кадр с нуля: вы описываете товар словами, а
          нейросеть собирает изображение. Это выручает, когда партия ещё в пути, а карточку нужно
          завести заранее, или когда нужен концепт для проверки спроса.
        </p>
        <p className="mt-3 text-muted-foreground">
          Здесь важно сказать прямо: нарисованный товар похож на описание, но это не ваш товар.
          Отличия в оттенке, фурнитуре и пропорциях будут, а расхождение фото с реальностью — прямой
          путь к возвратам и к претензиям от площадки. Поэтому такой кадр годится для черновика
          карточки и для рекламы концепции, а на обложку лучше поставить снимок настоящего товара,
          пусть даже сделанный на телефон.
        </p>
      </section>

      <section className="container max-w-3xl py-10">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Какой исходник подойдёт</h2>
        <p className="mt-3 text-muted-foreground">
          Снимок с телефона подходит, студийное оборудование не нужно. Но качество результата
          напрямую зависит от того, что видно на исходнике.
        </p>
        <Ul
          items={[
            <>
              <b>Товар в фокусе и целиком.</b> Смазанный кадр модель достроит смазанным: она
              опирается на то, что различает.
            </>,
            <>
              <b>Ровный свет без жёстких теней.</b> Подойдёт дневной свет из окна. Пересвет и
              глубокие чёрные тени съедают фактуру, и вернуть её при перерисовке неоткуда.
            </>,
            <>
              <b>Один товар в кадре.</b> Группу предметов модель перерисовывает по-разному, и
              композиция расползается.
            </>,
            <>
              <b>Минимум отражений.</b> Стекло и полированный металл с отражением интерьера — самый
              сложный случай: при смене фона отражение должно поменяться физически корректно.
            </>,
            <>
              <b>Запас по краям.</b> Товар, упирающийся в границу кадра, ограничивает выбор
              композиции.
            </>,
          ]}
        />
      </section>

      <section className="container max-w-3xl py-10">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Чего нейросеть с вашим фото не сделает
        </h2>
        <p className="mt-3 text-muted-foreground">
          Честный список границ экономит гены и время. Всё перечисленное — свойства технологии, а не
          недоработка настроек.
        </p>
        <Table
          head={["Задача", "Результат", "Почему"]}
          rows={[
            [
              "Показать товар с другой стороны",
              "Нет",
              "На снимке нет обратной стороны, взять её неоткуда",
            ],
            [
              "Сохранить мелкий текст этикетки в точности",
              "Частично",
              "Кадр перерисовывается: надписи воспроизводятся приблизительно",
            ],
            [
              "Убрать фон в прозрачность (PNG без фона)",
              "Нет",
              "Сервис заменяет фон новым, а не вырезает товар по контуру",
            ],
            [
              "Напечатать заголовок или плашки на фото",
              "Нет",
              "Текст на карточке делает «Инфографика» — у неё отдельная модель под русский текст",
            ],
            [
              "Повторить кадр один в один со второй попытки",
              "Нет",
              "Генерация вероятностная: каждый запуск даёт свой вариант",
            ],
          ]}
        />
        <Tip>
          Если нужен кадр с текстом, начните здесь и передайте готовое фото в{" "}
          <Link href="/infografika" className="text-primary hover:underline">
            «Инфографику»
          </Link>{" "}
          одной кнопкой: товар уже будет на месте, останется выбрать стиль.
        </Tip>
      </section>

      {/* Examples */}
      <section id="examples" className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Примеры генераций студии</h2>
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
            Регистрация за минуту, {WELCOME_SPARKS} генов в подарок — первое фото бесплатно. Платите
            только за готовые изображения.
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
          <Link href="/" className="hover:text-foreground">
            Главная
          </Link>
          <Link href="/wildberries" className="hover:text-foreground">
            Для Wildberries
          </Link>
          <Link href="/infografika" className="hover:text-foreground">
            Инфографика
          </Link>
          <Link href="/video-dlya-kartochki-tovara" className="hover:text-foreground">
            Видео для карточки
          </Link>
          <Link href="/seo-opisanie-tovara" className="hover:text-foreground">
            SEO-описание
          </Link>
          <Link href="/razmer-kartochki-wildberries" className="hover:text-foreground">
            Размер карточки WB
          </Link>
          <Link href="/trebovaniya-k-foto-ozon" className="hover:text-foreground">
            Требования к фото Ozon
          </Link>
          <Link href="/ozon" className="hover:text-foreground">
            Для Ozon
          </Link>
          <Link href="/help" className="hover:text-foreground">
            Как это работает
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Тарифы
          </Link>
          <a href="mailto:admin@kartogen.ru" className="hover:text-foreground">
            admin@kartogen.ru
          </a>
        </nav>
        <p className="text-xs">
          Kartogen — независимый сервис и не аффилирован с маркетплейсами. Упомянутые товарные знаки
          принадлежат их правообладателям.
        </p>
      </footer>
    </div>
  );
}
