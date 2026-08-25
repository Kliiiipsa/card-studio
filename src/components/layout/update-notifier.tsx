"use client";
import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * «Kartogen обновился» для давно открытых вкладок. Запоминаем версию сборки
 * при загрузке страницы и сверяем: раз в 5 минут и каждый раз, когда человек
 * возвращается к вкладке (главный момент — переключился на нас после долгого
 * отсутствия). Версии разошлись → ненавязчивая плашка с кнопкой.
 * НИКОГДА не перезагружаем сами: человек может заполнять форму или ждать
 * генерацию — обновление только по его клику.
 */
const POLL_MS = 5 * 60_000;

export function UpdateNotifier() {
  const [stale, setStale] = React.useState(false);
  const baseline = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!build || build === "dev" || cancelled) return;
        if (baseline.current === null) baseline.current = build;
        else if (build !== baseline.current) setStale(true);
      } catch {
        /* сеть моргнула — проверим в следующий раз */
      }
    };

    void check();
    const timer = setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex w-[92vw] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border bg-card p-3 shadow-xl">
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">Kartogen обновился.</span>{" "}
        <span className="text-muted-foreground">Обновите страницу, чтобы увидеть новое.</span>
      </p>
      <Button size="sm" onClick={() => window.location.reload()}>
        <RefreshCw className="h-3.5 w-3.5" />
        Обновить
      </Button>
    </div>
  );
}
