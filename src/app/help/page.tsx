import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutGrid,
  Wand2,
  ScanSearch,
  FileText,
  Zap,
  Images,
  Sparkles,
  ArrowRight,
  Upload,
  MousePointerClick,
  Download,
  Palette,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PRICES, WELCOME_SPARKS, TOPUP_PACKAGES, CUSTOM_TOPUP } from "@/core/billing/prices";

export const metadata: Metadata = { title: "Как это работает — Kartogen" };

/* ------------------------------------------------------------------ */
/* Content. Written from how the studio actually behaves — every claim  */
/* here maps to real code paths (prices, free actions, charge-on-success)*/
/* ------------------------------------------------------------------ */

type Step = { title: string; text: string };

type Scenario = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  lead: string;
  href: string;
  cta: string;
  price: string;
  screenshot: { src: string; alt: string };
  steps: Step[];
  examples?: { src: string; alt: string }[];
  tip?: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "infographic",
    icon: LayoutGrid,
    eyebrow: "Самый частый сценарий",
    title: "Карточка с текстом за две минуты",
    lead: "Загружаете фото товара — получаете готовую карточку для маркетплейса: крупный заголовок, плашки с преимуществами, товар в сцене. Русский текст рисует сама модель, поэтому он часть картинки, а не наклейка.",
    href: "/infographics",
    cta: "Открыть «Инфографику»",
    price: `${PRICES.infographic} ⚡ за карточку`,
    screenshot: { src: "/help/infographics.jpg", alt: "Раздел «Инфографика»: фото и данные слева, настройки и стили в центре, результат справа" },
    steps: [
      { title: "Загрузите фото товара", text: "Лучше всего — чёткое фото на нейтральном фоне. Нажмите «Заполнить по фото» — ИИ распознает товар и предложит название и преимущества (это бесплатно)." },
      { title: "Проверьте данные", text: "Название и преимущества — по одному на строку. Совет: цифры продают лучше слов. «Хлопок 80%», «Объём 55 л», «До −30 °C» — модель вынесет их в плашки как есть." },
      { title: "Выберите, что нужно сделать", text: "«Преимущества», «Почему купить», «Состав», «Размеры» — карточка строится по-разному под каждую задачу. Тексты плашек соберутся автоматически, их можно поправить перед генерацией." },
      { title: "Выберите стиль", text: "В «Библиотеке» — 8 готовых стилей от спокойных до ярких плакатных. Или загрузите «Свой референс» — карточку конкурента, которая вам нравится (см. следующий сценарий)." },
      { title: "Нажмите «Собрать инфографику»", text: "Генерация идёт 40–90 секунд на сервере. Вкладку можно закрыть — результат дождётся вас в «Моих карточках»." },
      { title: "Скачайте в нужном размере", text: "900×1200 или 1200×1600, PNG или JPG. Не понравилось — «Перегенерировать основу»: следующий вариант получит другую композицию." },
    ],
    examples: [
      { src: "/examples/turka.jpg", alt: "Пример: турка медная, стиль «Сцена-история»" },
      { src: "/examples/suitcase.jpg", alt: "Пример: чемодан, стиль «Солнечный промо»" },
      { src: "/examples/humidifier.jpg", alt: "Пример: увлажнитель, стиль «Бирюзовый фреш»" },
    ],
    tip: "Списание — только за успешную генерацию. Если модерация отклонила фото или сервис ошибся, искры не списываются.",
  },
  {
    id: "reference",
    icon: Palette,
    eyebrow: "Для тех, кто знает, чего хочет",
    title: "Карточка «как у конкурента»",
    lead: "Увидели удачную карточку — сохраните её и загрузите как референс. Студия возьмёт стиль (палитру, типографику, композицию, настроение), но товар останется вашим, а тексты — вашими. Похоже, но не копия.",
    href: "/infographics",
    cta: "Попробовать со своим референсом",
    price: `${PRICES.infographic} ⚡ за карточку, извлечение стиля — бесплатно`,
    screenshot: { src: "/help/infographics.jpg", alt: "Вкладка «Свой референс» в разделе «Инфографика»" },
    steps: [
      { title: "Загрузите фото своего товара", text: "Обязательный шаг для точного переноса: тогда модель понимает, что менять (стиль), а что сохранить (ваш товар)." },
      { title: "Переключитесь на «Свой референс»", text: "В блоке «Стиль референса» вместо «Библиотеки». Загрузите скриншот понравившейся карточки." },
      { title: "Дождитесь «Стиль применён»", text: "Стиль извлекается автоматически за пару секунд — появится зелёная подпись с названием стиля. Селект «Визуальный стиль» при этом отключится: теперь стиль задаёт референс." },
      { title: "Собирайте как обычно", text: "Заголовок и плашки — только из ваших данных. Чужие цифры, цены и заявления с референса на вашу карточку не попадут." },
    ],
    examples: [
      { src: "/help/reference-source.jpg", alt: "Референс: чужая карточка фотоаппарата в ретро-поп стиле" },
      { src: "/examples/speaker.jpg", alt: "Результат: наша колонка — тот же стиль, свой товар и свои тексты" },
    ],
    tip: "Чужой стиль не охраняется авторским правом, а чужой товар, логотип и текст мы не копируем — так что это честный приём.",
  },
  {
    id: "photo",
    icon: Wand2,
    eyebrow: "Когда нужна только картинка",
    title: "Чистое фото товара без надписей",
    lead: "Новый фон, свет и подача для вашего снимка — или фото по описанию, если снимка нет. Здесь текст не рисуется намеренно: чистое фото потом можно превратить в карточку в «Инфографике» одной кнопкой.",
    href: "/generator",
    cta: "Открыть «Фото товара»",
    price: `${PRICES.generate} ⚡ за фото`,
    screenshot: { src: "/help/generator.jpg", alt: "Раздел «Фото товара»: данные, промпт и результат" },
    steps: [
      { title: "Загрузите снимок (или опишите товар)", text: "Со снимком модель бережно сохранит товар и заменит окружение. Без снимка — нарисует по описанию." },
      { title: "Выберите сценарий и стиль", text: "Студия, замена фона, lifestyle, крупный план, флэтлей, праздничный — это про композицию и подачу, а не про текст." },
      { title: "Нажмите «Написать промпт»", text: "ИИ составит описание кадра по фото и данным (бесплатно). Можно поправить руками или «Переписать»." },
      { title: "Сгенерируйте и заберите дальше", text: "Готовое фото можно скачать или сразу отправить в «Инфографику» кнопкой под результатом — фото товара уже будет на месте." },
    ],
  },
  {
    id: "analysis",
    icon: ScanSearch,
    eyebrow: "Если карточка уже есть, но не продаёт",
    title: "Разбор карточки: что мешает продажам",
    lead: "Загрузите текущую карточку — получите оценку по критериям, слабые места и конкретные рекомендации. А из отчёта одним нажатием можно собрать улучшенную инфографику.",
    href: "/analysis",
    cta: "Открыть «Анализ и улучшение»",
    price: `${PRICES.analyze} ⚡ за анализ`,
    screenshot: { src: "/help/analysis.jpg", alt: "Раздел «Анализ и улучшение»" },
    steps: [
      { title: "Загрузите карточку и укажите товар", text: "Скриншот с маркетплейса или файл карточки." },
      { title: "Прочитайте отчёт", text: "Общий балл, оценки по критериям и почему они такие, что исправить в первую очередь." },
      { title: "Нажмите «Собрать инфографику»", text: "Данные из отчёта перенесутся в раздел «Инфографика» — останется выбрать стиль." },
    ],
  },
  {
    id: "seo",
    icon: FileText,
    eyebrow: "Тексты для карточки",
    title: "SEO-название, описание и ключевые запросы",
    lead: "Название с главными ключами в начале, продающее описание на 800–1200 знаков и 12–15 реальных поисковых запросов покупателей — с кнопками «Копировать».",
    href: "/seo",
    cta: "Открыть «SEO-тексты»",
    price: `${PRICES.seo} ⚡ за комплект`,
    screenshot: { src: "/help/seo.jpg", alt: "Раздел «SEO-тексты»" },
    steps: [
      { title: "Заполните название, категорию, преимущества", text: "Чем конкретнее данные (состав, размеры, назначение), тем точнее ключи." },
      { title: "Нажмите «Создать SEO»", text: "Через несколько секунд — три блока текста. Копируйте прямо в карточку на маркетплейсе." },
    ],
  },
];

const FREE_ACTIONS = [
  "Заполнение данных по фото",
  "Написание и улучшение промпта",
  "Идеи карточек",
  "Тексты плашек (бриф) для инфографики",
  "Извлечение стиля из референса",
  "Оценка готовой карточки после генерации",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Почему в «Фото товара» не рисуется текст?",
    a: "Так задумано. Этот раздел делает чистое фото — фон, свет, подачу. Текст, плашки и заголовки рисует «Инфографика», у неё для этого отдельная модель, которая умеет писать по-русски прямо в картинке. Сделали фото → кнопка «Сделать инфографику из этого фото».",
  },
  {
    q: "Сколько ждать инфографику и можно ли закрыть вкладку?",
    a: "Обычно 40–90 секунд. Генерация идёт на сервере: вкладку можно закрыть, результат появится в «Моих карточках» и на главной в «Последних работах».",
  },
  {
    q: "Генерация не удалась — я заплатил?",
    a: "Нет. Искры списываются только за успешно созданное изображение или текст. За ошибки сервиса, провайдера или отклонение модерацией — не списываются. Если списание всё же произошло ошибочно, напишите на admin@kartogen.ru — вернём.",
  },
  {
    q: "Почему модерация отклонила моё фото?",
    a: "У моделей есть автоматические фильтры; чаще всего они срабатывают на фото людей в открытой одежде (бельё, купальники). Попробуйте другое фото товара или сценарий; для инфографики в этом случае студия автоматически соберёт карточку запасным способом.",
  },
  {
    q: "Можно ли отредактировать текст на готовой карточке?",
    a: "Текст на карточке из «Инфографики» — часть изображения, отдельно он не редактируется. Поправьте заголовок или плашки в форме и нажмите «Перегенерировать основу» — новая карточка получит новые тексты (и другую композицию).",
  },
  {
    q: "Почему каждая перегенерация выглядит по-другому?",
    a: "Так и должно быть: у студии пул композиций, и каждая следующая попытка берёт другую — чтобы вы могли выбрать лучшую, а не получать одно и то же. Стиль при этом сохраняется.",
  },
  {
    q: "Что такое искры и как пополнить?",
    a: `1 искра = 1 ₽. При регистрации начисляется ${WELCOME_SPARKS} искр. Пополнение — пакетами (${TOPUP_PACKAGES.map((p) => p.sparks + (p.bonus ? `+${p.bonus}` : "")).join(", ")}) или на произвольную сумму от ${CUSTOM_TOPUP.minRub} ₽ в разделе «Баланс». Искры не сгорают.`,
  },
  {
    q: "Кому принадлежат сгенерированные изображения?",
    a: "Используйте их как угодно, включая карточки на маркетплейсах и рекламу, — без доплат. Единственная ответственность за вами: права на загруженные исходники (свои фото, согласие людей на снимках). Подробнее — в Публичной оферте.",
  },
];

/* ------------------------------------------------------------------ */

export default function HelpPage() {
  return (
    <AppShell title="Как это работает">
      <div className="mx-auto max-w-5xl space-y-14 pb-10">
        {/* Intro + TOC */}
        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Справка</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl [text-wrap:balance]">
              Как получить продающую карточку — по шагам
            </h1>
            <p className="text-[15px] leading-7 text-muted-foreground">
              Kartogen делает четыре вещи: собирает готовую инфографику с русским текстом, генерирует
              чистые фото товара, разбирает существующие карточки и пишет SEO-тексты. Ниже — сценарии
              «от задачи»: выберите свою и идите по шагам. Все текстовые помощники бесплатны, платите
              только за готовые изображения и SEO.
            </p>
          </div>
          <nav className="rounded-2xl border bg-card p-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">С чего начать</p>
            <ol className="space-y-1.5 text-sm">
              {SCENARIOS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    {s.title}
                  </a>
                </li>
              ))}
              <li>
                <a href="#sparks" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                  <Zap className="h-4 w-4 text-amber-500" /> Искры и цены
                </a>
              </li>
              <li>
                <a href="#faq" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                  <Sparkles className="h-4 w-4 text-primary" /> Частые вопросы
                </a>
              </li>
            </ol>
          </nav>
        </section>

        {/* Overview of the studio */}
        <section className="overflow-hidden rounded-2xl border bg-card">
          <Image
            src="/help/dashboard.jpg"
            alt="Главная страница студии: быстрые действия и последние работы"
            width={1440}
            height={900}
            className="w-full"
            priority
          />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            {[
              { icon: Upload, t: "Загружаете фото", d: "и пару строк о товаре" },
              { icon: MousePointerClick, t: "Нажимаете кнопку", d: "ИИ делает остальное на сервере" },
              { icon: Download, t: "Скачиваете результат", d: "он же остаётся в «Моих карточках»" },
            ].map((x) => (
              <div key={x.t} className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <x.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{x.t}</p>
                  <p className="text-xs text-muted-foreground">{x.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Scenarios */}
        {SCENARIOS.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-20 space-y-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {i + 1} · {s.eyebrow}
                </p>
                <h2 className="text-xl font-bold tracking-tight [text-wrap:balance]">{s.title}</h2>
                <p className="mt-2 max-w-3xl text-[15px] leading-7 text-muted-foreground">{s.lead}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Link
                    href={s.href}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    {s.cta} <ArrowRight className="h-4 w-4" />
                  </Link>
                  <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                    <Zap className="h-3.5 w-3.5 text-amber-500" /> {s.price}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
              <div className="overflow-hidden rounded-2xl border bg-card">
                <Image src={s.screenshot.src} alt={s.screenshot.alt} width={1440} height={1000} className="w-full" />
                <p className="border-t px-4 py-2 text-xs text-muted-foreground">{s.screenshot.alt}</p>
              </div>
              <ol className="space-y-3">
                {s.steps.map((st, j) => (
                  <li key={st.title} className="flex gap-3 rounded-xl border bg-card p-3.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {j + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{st.title}</p>
                      <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{st.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {s.examples && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-2xl">
                {s.examples.map((ex) => (
                  <figure key={ex.src} className="overflow-hidden rounded-xl border bg-card">
                    <Image src={ex.src} alt={ex.alt} width={720} height={960} className="aspect-[3/4] w-full object-cover" />
                    <figcaption className="px-2.5 py-1.5 text-[11px] text-muted-foreground">{ex.alt}</figcaption>
                  </figure>
                ))}
              </div>
            )}

            {s.tip && (
              <p className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{s.tip}</span>
              </p>
            )}
          </section>
        ))}

        {/* Sparks */}
        <section id="sparks" className="scroll-mt-20 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <Zap className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Искры и цены</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border bg-card p-5 text-sm leading-6">
              <p>
                <strong>1 искра = 1 ₽.</strong> При регистрации — {WELCOME_SPARKS} искр в подарок.
                Пополняете баланс пакетом или своей суммой, платите искрами за готовые изображения и SEO.
                Подписок нет, искры не сгорают.
              </p>
              <ul className="mt-3 space-y-1.5">
                <li className="flex justify-between"><span>Инфографика</span><strong>{PRICES.infographic} ⚡</strong></li>
                <li className="flex justify-between"><span>Фото товара</span><strong>{PRICES.generate} ⚡</strong></li>
                <li className="flex justify-between"><span>Анализ карточки</span><strong>{PRICES.analyze} ⚡</strong></li>
                <li className="flex justify-between"><span>SEO-тексты</span><strong>{PRICES.seo} ⚡</strong></li>
              </ul>
              <p className="mt-3 text-muted-foreground">
                Списание — только за успешный результат. Полный прайс —{" "}
                <Link href="/pricing" className="text-primary hover:underline">на странице тарифов</Link>, пополнить —{" "}
                <Link href="/billing" className="text-primary hover:underline">в разделе «Баланс»</Link>.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-5 text-sm">
              <p className="font-medium">Бесплатно — всегда</p>
              <ul className="mt-2 grid gap-1.5">
                {FREE_ACTIONS.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-4 overflow-hidden rounded-xl border">
                <Image src="/help/billing.jpg" alt="Раздел «Баланс и пополнение»" width={1440} height={1000} className="w-full" />
              </div>
            </div>
          </div>
        </section>

        {/* My cards */}
        <section className="grid gap-5 rounded-2xl border bg-card p-5 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Images className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold">Всё, что вы сделали, — в «Моих карточках»</h2>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Каждая генерация сохраняется в вашем аккаунте и доступна с любого устройства: можно
              вернуться через неделю, скачать в другом размере или собрать из чистого фото
              инфографику. Ничего не теряется, даже если закрыть вкладку во время генерации.
            </p>
            <Link href="/cards" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Открыть «Мои карточки» <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["/examples/dress.jpg", "/examples/coat.jpg", "/examples/jeans.jpg"].map((src) => (
              <Image key={src} src={src} alt="Пример сохранённой карточки" width={360} height={480} className="aspect-[3/4] w-full rounded-lg object-cover" />
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Частые вопросы</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-xl border bg-card p-4 open:shadow-sm">
                <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                </summary>
                <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Не нашли ответ — напишите на{" "}
            <a href="mailto:admin@kartogen.ru" className="text-primary hover:underline">admin@kartogen.ru</a>.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
