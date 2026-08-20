"use client";
import * as React from "react";
import Link from "next/link";
import { Wand2, ScanSearch, LayoutTemplate, FileText, Images, ArrowRight, Clapperboard } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/project/empty-state";

const QUICK = [
  {
    href: "/generator",
    icon: Wand2,
    title: "Фото товара",
    desc: "Новый фон, свет и подача — по описанию или из снимка",
  },
  {
    href: "/infographics",
    icon: LayoutTemplate,
    title: "Инфографика",
    desc: "Готовая карточка с русским текстом и плашками",
  },
  {
    href: "/video",
    icon: Clapperboard,
    title: "Видео товара",
    desc: "5-секундный живой ролик из одного фото",
  },
  {
    href: "/seo",
    icon: FileText,
    title: "SEO-тексты",
    desc: "Название, описание и ключевые запросы для карточки",
  },
  {
    href: "/analysis",
    icon: ScanSearch,
    title: "Анализ и улучшение",
    desc: "Аудит карточки + улучшение ИИ",
  },
];

type CardItem = {
  id: string;
  kind: string;
  url: string;
  title: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  generator: "Генератор",
  infographic: "Инфографика",
  improve: "Улучшение",
  video: "Видео",
};

export default function DashboardPage() {
  const [cards, setCards] = React.useState<CardItem[] | null>(null);

  React.useEffect(() => {
    fetch("/api/cards")
      .then((r) => r.json())
      .then((d: { cards?: CardItem[] }) => setCards((d.cards ?? []).slice(0, 8)))
      .catch(() => setCards([]));
  }, []);

  return (
    <AppShell title="Главная">
      <div className="space-y-8">
        {/* Quick actions */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Быстрые действия</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK.map((q) => (
              <Link key={q.href} href={q.href}>
                <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
                  <CardContent className="flex flex-col gap-3 p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <q.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium leading-tight">{q.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{q.desc}</div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* Recent work — server-side, synced across devices */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Последние работы</h2>
            {cards !== null && cards.length > 0 && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/cards">
                  Все карточки
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>

          {cards === null ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <EmptyState
              icon={<Images className="h-6 w-6" />}
              title="Пока ничего нет"
              description="Сгенерируйте первую карточку — она появится здесь и в «Моих карточках»."
              action={
                <Button asChild variant="gradient">
                  <Link href="/infographics">
                    <LayoutTemplate className="h-4 w-4" />
                    Собрать инфографику
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {cards.map((c) => (
                <Link
                  key={c.id}
                  href="/cards"
                  className="group overflow-hidden rounded-xl border bg-card"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                    {c.kind === "video" ? (
                      <video
                        src={c.url}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.url}
                        alt={c.title ?? "Сгенерированная карточка"}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5">
                    <p className="truncate text-xs font-medium">
                      {c.title ?? KIND_LABEL[c.kind] ?? c.kind}
                    </p>
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] font-normal">
                      {KIND_LABEL[c.kind] ?? c.kind}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
