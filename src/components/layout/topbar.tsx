"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { ProviderBadge } from "./provider-badge";

export function Topbar({ title }: { title?: string }) {
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 px-6 backdrop-blur-xl">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-3">
        <ProviderBadge />
        <ThemeToggle />
        <Button asChild variant="gradient" size="sm">
          <Link href="/generator">
            <Plus className="h-4 w-4" />
            Новая карточка
          </Link>
        </Button>
        <Button variant="ghost" size="icon" onClick={logout} title="Выйти">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
