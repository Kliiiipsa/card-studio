"use client";
import * as React from "react";
import Link from "next/link";
import { Bell, Megaphone, Info, Wrench, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * «Колокольчик» уведомлений сервиса: акции, технические работы, новые функции.
 * Красная точка — есть непрочитанные; открыли панель — точка гаснет (отметку
 * шлём на сервер, она пер-аккаунт, а не в localStorage: человек заходит с
 * телефона и с компьютера).
 *
 * Список приходит из /api/notices, который сам решает, показывать ли что-то
 * (гейт noticeBellEnabled: сейчас админ, потом env NOTICES=all). Если список
 * пуст, кнопки нет вовсе — лишний неработающий значок в шапке не нужен.
 */

type Notice = {
  id: number;
  kind: "info" | "promo" | "maintenance";
  title: string;
  body: string;
  url: string | null;
  createdAt: string;
  read: boolean;
};

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

export function NoticeBell() {
  const [notices, setNotices] = React.useState<Notice[]>([]);
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notices");
      if (!res.ok) return;
      const data = (await res.json()) as { notices?: Notice[] };
      setNotices(data.notices ?? []);
    } catch {
      // аналитика шапки не должна ломать страницу
    }
  }, []);

  React.useEffect(() => {
    void load();
    // раз в 5 минут: акцию и «техработы» человек должен увидеть, не перезагружая
    const t = setInterval(() => void load(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unread = notices.filter((n) => !n.read);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || !unread.length) return;
    // гасим точку сразу, не дожидаясь сервера
    setNotices((list) => list.map((n) => ({ ...n, read: true })));
    await fetch("/api/notices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: unread.map((n) => n.id) }),
    }).catch(() => undefined);
  };

  if (!notices.length) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread.length ? `Уведомления: ${unread.length} новых` : "Уведомления"}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread.length > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
          </span>
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
