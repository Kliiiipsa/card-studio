"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { ProviderBadge } from "./provider-badge";
import { MobileNav } from "./mobile-nav";

export function Topbar({ title }: { title?: string }) {
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-xl sm:gap-4 sm:px-6">
      <MobileNav />
      <h1 className="min-w-0 truncate text-base font-semibold sm:text-lg">{title}</h1>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
        <ProviderBadge />
        <ThemeToggle />
        <Button asChild variant="gradient" size="sm">
          <Link href="/generator" aria-label="Новая карточка">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Новая карточка</span>
          </Link>
        </Button>
        <Button variant="ghost" size="icon" onClick={logout} title="Выйти" aria-label="Выйти">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
