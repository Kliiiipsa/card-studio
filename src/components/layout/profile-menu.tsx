"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, ShieldCheck, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfileStore } from "@/store/profile-store";
import { cn } from "@/lib/utils";

/** Avatar circle + balance chip; click opens the account dropdown. */
export function ProfileMenu() {
  const router = useRouter();
  const { email, role, balance, loaded, fetchMe, reset } = useProfileStore();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!loaded) void fetchMe();
  }, [loaded, fetchMe]);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    reset();
    router.replace("/login");
    router.refresh();
  };

  const letter = (email?.[0] ?? "?").toUpperCase();

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5 sm:gap-2">
      {balance !== null && (
        <Link
          href="/billing"
          className="hidden items-center gap-1 rounded-full border bg-card/60 px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 sm:flex"
          title="Баланс искр — пополнить"
        >
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          {balance}
        </Link>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Меню профиля"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-500 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105"
      >
        {letter}
      </button>

      {open && (
        // bg-card, not bg-popover: the popover token isn't defined in our theme
        <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border bg-card text-card-foreground p-2 shadow-xl">
          <div className="border-b px-3 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-medium">{email ?? "…"}</p>
            <p className="text-xs text-muted-foreground">
              {role === "admin" ? "Администратор · безлимит" : "Аккаунт"}
            </p>
            {balance !== null && (
              <p className="mt-1.5 flex items-center gap-1 text-sm font-semibold">
                <Zap className="h-4 w-4 text-amber-500" />
                {balance} искр
              </p>
            )}
          </div>
          <nav className="mt-1.5 space-y-0.5">
            <MenuLink href="/billing" onClick={() => setOpen(false)}>
              <Wallet className="h-4 w-4" /> Пополнить баланс
            </MenuLink>
            <MenuLink href="/settings" onClick={() => setOpen(false)}>
              <Settings className="h-4 w-4" /> Настройки
            </MenuLink>
            {role === "admin" && (
              <MenuLink href="/admin" onClick={() => setOpen(false)}>
                <ShieldCheck className="h-4 w-4" /> Админка
              </MenuLink>
            )}
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 px-3 text-destructive hover:text-destructive"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" /> Выйти
            </Button>
          </nav>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
        "text-foreground/80 transition-colors hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
