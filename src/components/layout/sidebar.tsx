"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wand2,
  ScanSearch,
  LayoutGrid,
  Gem,
  Images,
  FileText,
  CircleHelp,
  Clapperboard,
  Scale,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfileStore } from "@/store/profile-store";

// «Карточка под ключ» (/turnkey) временно скрыта из меню — дорабатываем качество пакета
export const NAV = [
  { href: "/dashboard", label: "Главная", icon: LayoutDashboard },
  { href: "/generator", label: "Фото товара", icon: Wand2 },
  { href: "/infographics", label: "Инфографика", icon: LayoutGrid },
  { href: "/video", label: "Видео товара", icon: Clapperboard },
  { href: "/seo", label: "SEO-тексты", icon: FileText },
  { href: "/analysis", label: "Анализ и улучшение", icon: ScanSearch },
  { href: "/compare", label: "Сравнение карточек", icon: Scale },
  { href: "/cards", label: "Мои карточки", icon: Images },
  { href: "/help", label: "Как это работает", icon: CircleHelp },
];

/**
 * «Рекламные баннеры» пока закрыты гейтом (админ или BANNERS=all), поэтому
 * пункт меню появляется только у тех, кому раздел реально доступен. Настоящая
 * защита — на сервере: без неё ссылку можно было бы просто угадать.
 */
const BANNERS_ITEM = { href: "/banners", label: "Рекламные креативы", icon: Megaphone };

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const banners = useProfileStore((s) => s.banners);
  const items = React.useMemo(() => {
    if (!banners) return NAV;
    // рядом с «Инфографикой» — соседняя по смыслу услуга
    const at = NAV.findIndex((i) => i.href === "/infographics");
    const next = [...NAV];
    next.splice(at + 1, 0, BANNERS_ITEM);
    return next;
  }, [banners]);
  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r bg-card/50 md:flex">
      <Link href="/" className="flex items-center gap-2 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-500 text-white shadow-md">
          <Gem className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold whitespace-nowrap">Kartogen</div>
          <div className="text-xs text-muted-foreground">AI для карточек</div>
        </div>
      </Link>

      <nav className="space-y-1 px-3 py-2">
        <NavLinks />
      </nav>

      <div className="mt-auto px-5 pb-5 pt-4">
        <div className="rounded-xl border bg-card/60 p-3 text-xs text-muted-foreground">
          Загрузите фото товара, получите идеи и сгенерируйте премиальную карточку.
        </div>
      </div>
    </aside>
  );
}
