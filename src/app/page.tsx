import Link from "next/link";
import {
  Wand2,
  ScanSearch,
  Lightbulb,
  ImageIcon,
  LayoutTemplate,
  Download,
  Upload,
  Sparkles,
  ArrowRight,
  Gem,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CARD_TYPES } from "@/core/domain/card-types";

const FEATURES = [
  {
    icon: Wand2,
    title: "Генерация по промпту",
    text: "Text-to-image карточки с премиальным визуалом за минуты.",
  },
  {
    icon: ScanSearch,
    title: "Анализ карточки",
    text: "ИИ оценивает текущую карточку и находит, что мешает продажам.",
  },
  {
    icon: Lightbulb,
    title: "Идеи для улучшения",
    text: "5–10 идей карточек под вашу категорию и аудиторию.",
  },
  {
    icon: ImageIcon,
    title: "Image-to-image",
    text: "Загрузите фото товара — получите дорогую карточку, товар сохраняется.",
  },
  {
    icon: LayoutTemplate,
    title: "Шаблоны под WB",
    text: "12 типов карточек и 11 премиальных стилей из коробки.",
  },
  {
    icon: Download,
    title: "Экспорт под размер",
    text: "900×1200, 1200×1600, 3:4, 4:5 — PNG и JPG в один клик.",
  },
];

const STEPS = [
  { icon: Upload, title: "Загрузите товар", text: "Фото товара или текущую карточку WB." },
  { icon: Lightbulb, title: "Получите идеи", text: "ИИ предложит смыслы и закроет боли клиента." },
  { icon: Wand2, title: "Сгенерируйте карточку", text: "Структурный промпт → дорогой визуал." },
  { icon: Download, title: "Скачайте результат", text: "Готовая графика в нужном размере." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen surface-gradient">
      {/* Nav */}
      <header className="container flex h-16 items-center justify-between gap-2">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-500 text-white shadow-md">
            <Gem className="h-5 w-5" />
          </div>
          <span className="whitespace-nowrap text-sm font-semibold sm:text-base">
            WB Card Studio
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/dashboard">Дашборд</Link>
          </Button>
          <Button asChild variant="gradient" size="sm">
            <Link href="/generator">
              <span className="sm:hidden">Создать</span>
              <span className="hidden sm:inline">Создать карточку</span>
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="container flex flex-col items-center pt-20 pb-16 text-center">
        <Badge variant="secondary" className="mb-5 gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI-студия контента для маркетплейсов
        </Badge>
        <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Создавайте премиальные карточки для <span className="text-gradient">Wildberries</span> с
          помощью ИИ
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Анализируйте товар, получайте идеи и генерируйте продающую инфографику за минуты.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" variant="gradient">
            <Link href="/generator">
              Создать карточку
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="#examples">Посмотреть примеры</Link>
          </Button>
        </div>

        {/* Hero preview strip */}
        <div className="mt-16 grid w-full max-w-5xl grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            "from-violet-500 to-indigo-600",
            "from-slate-800 to-slate-950",
            "from-emerald-500 to-teal-700",
            "from-blue-500 to-indigo-700",
          ].map((g, i) => (
            <div
              key={i}
              className={`aspect-[3/4] rounded-2xl bg-gradient-to-br ${g} shadow-lg ring-1 ring-black/5`}
            />
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Возможности</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Как это работает</h2>
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

      {/* Examples gallery */}
      <section id="examples" className="container py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Примеры карточек</h2>
        <p className="mt-2 text-center text-muted-foreground">
          12 типов карточек под любой сценарий продаж
        </p>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {CARD_TYPES.slice(0, 6).map((t, i) => {
            const palettes = [
              "from-violet-500 to-indigo-700",
              "from-slate-800 to-black",
              "from-emerald-500 to-teal-700",
              "from-rose-400 to-pink-600",
              "from-blue-500 to-cyan-600",
              "from-amber-500 to-orange-600",
            ];
            return (
              <div key={t.id} className="overflow-hidden rounded-xl border">
                <div
                  className={`flex aspect-[3/4] items-end bg-gradient-to-br ${palettes[i % palettes.length]} p-3`}
                >
                  <span className="text-xs font-medium text-white">{t.title}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-indigo-600 to-blue-600 p-10 text-center text-white sm:p-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Готовы делать карточки, которые продают?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">
            Запустите первый проект бесплатно — анализ, идеи и генерация в одной студии.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-8">
            <Link href="/generator">
              Начать сейчас
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="container border-t py-8 text-center text-sm text-muted-foreground">
        WB Card Studio · AI-студия карточек Wildberries
      </footer>
    </div>
  );
}
