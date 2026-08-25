"use client";
import * as React from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExampleCard } from "./examples-gallery";

/**
 * Две бесконечные встречные ленты примеров (запрос пользователя 2026-08-25):
 * верхняя плывёт вправо, нижняя — влево. Чистый CSS-marquee: трек содержит
 * две копии набора и анимируется на 50% ширины — стык бесшовный. Наведение
 * ставит ленту на паузу (карточку можно рассмотреть и кликнуть), а при
 * системной настройке «уменьшить движение» ленты стоят и просто скроллятся.
 */
export function ExamplesMarquee({ items }: { items: ExampleCard[] }) {
  const [open, setOpen] = React.useState<ExampleCard | null>(null);
  const half = Math.ceil(items.length / 2);
  const rows: { cards: ExampleCard[]; reverse: boolean }[] = [
    { cards: items.slice(0, half), reverse: true }, // верхняя — слева направо
    { cards: items.slice(half), reverse: false }, // нижняя — справа налево
  ];

  return (
    <>
      <div className="mt-10 space-y-4">
        {rows.map((row, i) => (
          <div
            key={i}
            className="group relative overflow-hidden motion-reduce:overflow-x-auto"
            // растягиваем ленты на всю ширину окна, вырываясь из контейнера
            style={{ marginInline: "calc(50% - 50vw)" }}
          >
            <div
              className={
                "flex w-max gap-4 pr-4 group-hover:[animation-play-state:paused] motion-reduce:animate-none " +
                (row.reverse ? "animate-marquee-right" : "animate-marquee-left")
              }
            >
              {[...row.cards, ...row.cards].map((c, j) => (
                <button
                  key={`${c.src}-${j}`}
                  type="button"
                  onClick={() => setOpen(c)}
                  aria-label={`Открыть пример: ${c.title}`}
                  aria-hidden={j >= row.cards.length}
                  tabIndex={j >= row.cards.length ? -1 : 0}
                  className="w-40 shrink-0 overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:shadow-lg sm:w-48"
                >
                  <div className="relative aspect-[3/4]">
                    <Image
                      src={c.src}
                      alt={`${c.title} — ${c.style}`}
                      fill
                      sizes="192px"
                      className="object-cover"
                    />
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-xs font-medium">{c.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{c.style}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog.Root open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 outline-none data-[state=open]:animate-in data-[state=open]:zoom-in-95"
            aria-describedby={undefined}
          >
            {open && (
              <div className="overflow-hidden rounded-2xl bg-background shadow-2xl">
                <div className="flex items-center justify-between border-b px-4 py-2.5">
                  <Dialog.Title className="text-sm font-medium">
                    {open.title} · {open.style}
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Закрыть">
                      <X className="h-4 w-4" />
                    </Button>
                  </Dialog.Close>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={open.src} alt={`${open.title} — ${open.style}`} className="w-full" />
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
