import Link from "next/link";
import { Gem, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Общая шапка/подвал для страниц блога — в стиле лендинга, публичные. */
export function BlogHeader() {
  return (
    <header className="container flex h-16 items-center justify-between gap-2">
      <Link href="/" className="flex min-w-0 items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-500 text-white shadow-md">
          <Gem className="h-5 w-5" />
        </div>
        <span className="whitespace-nowrap text-sm font-semibold sm:text-base">Kartogen</span>
      </Link>
      <nav className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/blog">Блог</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/help">Как это работает</Link>
        </Button>
        <Button asChild variant="gradient" size="sm">
          <Link href="/register">
            <span className="sm:hidden">Начать</span>
            <span className="hidden sm:inline">Начать бесплатно</span>
          </Link>
        </Button>
      </nav>
    </header>
  );
}

export function BlogFooter() {
  return (
    <footer className="container flex flex-col items-center gap-3 border-t py-8 text-center text-sm text-muted-foreground">
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/" className="hover:text-foreground">Главная</Link>
        <Link href="/blog" className="hover:text-foreground">Блог</Link>
        <Link href="/help" className="hover:text-foreground">Как это работает</Link>
        <Link href="/pricing" className="hover:text-foreground">Тарифы</Link>
        <a href="mailto:admin@kartogen.ru" className="hover:text-foreground">admin@kartogen.ru</a>
      </nav>
      <p className="text-xs">
        Kartogen — независимый сервис и не аффилирован с Wildberries, Ozon и иными маркетплейсами.
      </p>
    </footer>
  );
}
