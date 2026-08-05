"use client";
import * as React from "react";
import { Download, Images, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/project/empty-state";
import { toast } from "@/components/ui/toaster";

type CardItem = {
  id: string;
  kind: "generator" | "infographic" | "improve" | string;
  url: string;
  title: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  generator: "Генератор",
  infographic: "Инфографика",
  improve: "Улучшение",
};

export default function MyCardsPage() {
  const [cards, setCards] = React.useState<CardItem[] | null>(null);
  const [kind, setKind] = React.useState<string>("all");

  React.useEffect(() => {
    setCards(null);
    const q = kind === "all" ? "" : `?kind=${kind}`;
    fetch(`/api/cards${q}`)
      .then((r) => r.json())
      .then((d: { cards?: CardItem[] }) => setCards(d.cards ?? []))
      .catch(() => setCards([]));
  }, [kind]);

  const download = async (card: CardItem) => {
    try {
      // same-origin proxy keeps the download attribute working for S3 URLs
      const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(card.url)}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `card-${card.id}.${blob.type.includes("jpeg") ? "jpg" : "png"}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Не удалось скачать — попробуйте ещё раз");
    }
  };

  return (
    <AppShell title="Мои карточки">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Всё, что вы сгенерировали, — хранится в вашем аккаунте и доступно с любого устройства.
          </p>
          <Tabs value={kind} onValueChange={setKind}>
            <TabsList>
              <TabsTrigger value="all">Все</TabsTrigger>
              <TabsTrigger value="infographic">Инфографика</TabsTrigger>
              <TabsTrigger value="generator">Генератор</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {cards === null ? (
          <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Загрузка…
          </div>
        ) : cards.length === 0 ? (
          <EmptyState
            icon={<Images className="h-6 w-6" />}
            title="Пока ничего нет"
            description="Сгенерируйте первую карточку или инфографику — она появится здесь и останется навсегда."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.id} className="group overflow-hidden rounded-xl border bg-card">
                <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.url}
                    alt={c.title ?? "Сгенерированная карточка"}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {c.title ?? KIND_LABEL[c.kind] ?? c.kind}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                        {KIND_LABEL[c.kind] ?? c.kind}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => download(c)}
                    aria-label="Скачать"
                    title="Скачать"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
