import Link from "next/link";
import { Compass, Home, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center surface-gradient p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="h-7 w-7" />
      </div>
      <p className="mt-6 text-5xl font-bold tracking-tight">404</p>
      <h1 className="mt-2 text-lg font-semibold">Такой страницы нет</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Возможно, ссылка устарела или в адресе опечатка.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="outline">
          <Link href="/">
            <Home className="h-4 w-4" />
            На главную
          </Link>
        </Button>
        <Button asChild variant="gradient">
          <Link href="/generator">
            <Wand2 className="h-4 w-4" />
            В генератор
          </Link>
        </Button>
      </div>
    </div>
  );
}
