"use client";
import * as React from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ExampleCard = {
  src: string;
  title: string;
  style: string;
};

/** Real generated cards with a click-to-zoom lightbox. */
export function ExamplesGallery({ items }: { items: ExampleCard[] }) {
  const [open, setOpen] = React.useState<ExampleCard | null>(null);
  return (
    <>
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((c) => (
          <button
            key={c.src}
            type="button"
            onClick={() => setOpen(c)}
            className="group overflow-hidden rounded-xl border text-left transition-shadow hover:shadow-lg"
            aria-label={`Открыть пример: ${c.title}`}
          >
            <div className="relative aspect-[3/4] overflow-hidden">
              <Image
                src={c.src}
                alt={`${c.title} — ${c.style}`}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <span className="absolute right-2 top-2 rounded-full bg-black/45 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <ZoomIn className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="p-2.5">
              <p className="text-xs font-medium">{c.title}</p>
              <p className="text-[11px] text-muted-foreground">{c.style}</p>
            </div>
          </button>
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
