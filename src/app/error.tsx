"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[render error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center surface-gradient p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h1 className="mt-6 text-lg font-semibold">Что-то пошло не так</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Произошла непредвиденная ошибка. Попробуйте ещё раз — обычно это помогает.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button variant="gradient" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Попробовать снова
        </Button>
        <Button asChild variant="outline">
          <Link href="/">
            <Home className="h-4 w-4" />
            На главную
          </Link>
        </Button>
      </div>
    </div>
  );
}
