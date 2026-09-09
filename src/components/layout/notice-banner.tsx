"use client";
import * as React from "react";
import Link from "next/link";
import { Megaphone, Info, Wrench, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNoticeStore } from "@/store/notice-store";

/**
 * Полоса во всю ширину под шапкой — для того, что нельзя пропустить:
 * технические работы, крупная акция. Показывается только у уведомлений с
 * галочкой «Показать полосой» и только пока оно не прочитано; крестик
 * отмечает его прочитанным на сервере, поэтому полоса не вернётся ни завтра,
 * ни на другом устройстве.
 *
 * Сознательно показываем ОДНО уведомление за раз (самое свежее): две-три
 * полосы подряд превращаются в баннерную слепоту и съедают экран.
 */

const STYLE = {
  promo: {
    icon: Megaphone,
    box: "bg-primary/10 text-primary-foreground/90 border-primary/20",
    accent: "text-primary",
  },
  maintenance: {
    icon: Wrench,
    box: "bg-amber-500/10 border-amber-500/25",
    accent: "text-amber-600 dark:text-amber-400",
  },
  info: {
    icon: Info,
    box: "bg-sky-500/10 border-sky-500/25",
    accent: "text-sky-600 dark:text-sky-400",
  },
} as const;

export function NoticeBanner() {
  const { notices, loaded, fetchNotices, markRead } = useNoticeStore();

  React.useEffect(() => {
    if (!loaded) void fetchNotices();
  }, [loaded, fetchNotices]);

  const shown = notices.find((n) => n.banner && !n.read);
  if (!shown) return null;

  const s = STYLE[shown.kind] ?? STYLE.info;
  const Icon = s.icon;

  return (
    <div className={cn("flex items-start gap-3 border-b px-4 py-2.5 sm:px-6", s.box)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", s.accent)} />
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-semibold text-foreground">{shown.title}</span>
        {shown.body && (
          <span className="ml-2 text-foreground/75">{shown.body.split("\n")[0]}</span>
        )}
        {shown.url && (
          <Link
            href={shown.url}
            className={cn("ml-2 inline-flex items-center gap-0.5 font-medium hover:underline", s.accent)}
          >
            Подробнее <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={() => void markRead([shown.id])}
        aria-label="Скрыть"
        className="-mr-1 shrink-0 rounded-md p-1 text-foreground/50 transition-colors hover:bg-background/50 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
