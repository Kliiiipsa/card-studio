"use client";
import * as React from "react";
import Link from "next/link";
import { Bell, Megaphone, Info, Wrench, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNoticeStore, type Notice } from "@/store/notice-store";

/**
 * «Колокольчик» уведомлений сервиса: акции, технические работы, новые функции.
 *
 * Заметность (2026-09-09): одной красной точки в шапке мало — рядом яркая
 * кнопка «Новая карточка» и зелёный бейдж, глаз уходит на них. Поэтому при
 * непрочитанном рядом появляется ПЛАШКА С ТЕКСТОМ («1 новое»), а сама кнопка
 * получает цветной фон. Прочитал — всё гаснет, шапка снова спокойная.
 *
 * Данные и отметки о прочтении — в общем сторе с полосой под шапкой.
 */

const ICON = { info: Info, promo: Megaphone, maintenance: Wrench } as const;
const TONE = {
  info: "text-sky-500 bg-sky-500/10",
  promo: "text-primary bg-primary/10",
  maintenance: "text-amber-500 bg-amber-500/10",
} as const;

/** «сегодня, 14:30» / «вчера» / «7 сентября» — без библиотек */
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `сегодня, ${time}`;
  if (diff === 1) return `вчера, ${time}`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

/** «1 новое» / «2 новых» / «5 новых» */
function newWord(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 14) return "новых";
  return n % 10 === 1 ? "новое" : "новых";
}

export function NoticeBell() {
  const { notices, loaded, fetchNotices, markRead } = useNoticeStore();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!loaded) void fetchNotices();
    // раз в 5 минут: акцию и «техработы» человек должен увидеть, не перезагружая
    const t = setInterval(() => void fetchNotices(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [loaded, fetchNotices]);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unread = notices.filter((n: Notice) => !n.read);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread.length) await markRead(unread.map((n) => n.id));
  };

  if (!notices.length) return null;

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread.length ? `Уведомления: ${unread.length} новых` : "Уведомления"}
        className={cn(
          "relative flex h-9 items-center gap-1.5 rounded-lg px-2 transition-colors",
          unread.length
            ? "bg-primary/10 text-primary hover:bg-primary/15"
            : "text-foreground/70 hover:bg-accent hover:text-foreground",
        )}
      >
        <Bell className={cn("h-[18px] w-[18px]", unread.length && "animate-wiggle")} />
        {unread.length > 0 && (
          <>
            <span className="text-xs font-semibold">
              {unread.length} {newWord(unread.length)}
            </span>
            <span className="absolute left-3 top-1.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
            </span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold">Уведомления</p>
            {unread.length === 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5" /> всё прочитано
              </span>
            )}
          </div>
          <div className="max-h-[26rem] divide-y overflow-y-auto">
            {notices.map((n) => {
              const Icon = ICON[n.kind] ?? Info;
              return (
                <div key={n.id} className="flex gap-3 px-4 py-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      TONE[n.kind] ?? TONE.info,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-5">{n.title}</p>
                    {n.body && (
                      <p className="mt-1 whitespace-pre-line text-[13px] leading-5 text-muted-foreground">
                        {n.body}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{when(n.createdAt)}</span>
                      {n.url && (
                        <Link
                          href={n.url}
                          onClick={() => setOpen(false)}
                          className="font-medium text-primary hover:underline"
                        >
                          Подробнее
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
