"use client";
import * as React from "react";
import Link from "next/link";
import { Loader2, Lock, ScanSearch, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImageUploader } from "@/components/media/image-uploader";
import { toast } from "@/components/ui/toaster";

/**
 * ПУБЛИЧНАЯ страница «Бесплатная проверка карточки» — лид-магнит: гость получает
 * общий балл + один совет, остальной разбор показан «под замком» с CTA на
 * регистрацию. Пока СКРЫТА (нигде не залинкована): после одобрения — блок на
 * главной. Полный отчёт с сервера не приходит вовсе (см. api/public/quick-check).
 */

type QuickCheck = {
  score: number;
  diagnosis: string;
  thumbnail: { readable: boolean; verdict: string };
  tip: { issue: string; fix: string };
  locked: {
    problems: number;
    headlineIdeas: number;
    benefitTexts: number;
    textRewrites: number;
    visualTips: number;
    newCardIdeas: number;
  };
};

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export default function QuickCheckPage() {
  const [image, setImage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<QuickCheck | null>(null);

  const run = async () => {
    if (!image) {
      toast.error("Сначала загрузите фото карточки или товара.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/public/quick-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: image }),
      });
      const data = (await res.json()) as (QuickCheck & { error?: string }) | { error?: string };
      if (!res.ok) throw new Error(("error" in data && data.error) || "Не получилось, попробуйте ещё раз.");
      setResult(data as QuickCheck);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не получилось, попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (s: number) =>
    s >= 75 ? "text-emerald-500" : s >= 50 ? "text-amber-500" : "text-red-500";

  const lockedRows = result
    ? [
        result.locked.problems > 0 &&
          `ещё ${result.locked.problems} ${plural(result.locked.problems, "проблема", "проблемы", "проблем")} с готовыми решениями`,
        result.locked.headlineIdeas > 0 &&
          `${result.locked.headlineIdeas} ${plural(result.locked.headlineIdeas, "вариант", "варианта", "вариантов")} продающего заголовка`,
        result.locked.benefitTexts > 0 && "готовые тексты преимуществ для плашек",
        result.locked.textRewrites > 0 && "переписанные тексты вместо текущих",
        result.locked.visualTips > 0 && "советы по визуалу и композиции",
        result.locked.newCardIdeas > 0 && "идеи новых карточек под этот товар",
      ].filter((x): x is string => Boolean(x))
    : [];

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-10">
      {/* мини-шапка */}
      <div className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold">
          Kartogen
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link href="/register">Регистрация</Link>
        </Button>
      </div>

      <h1 className="text-2xl font-bold [text-wrap:balance]">
        Бесплатная проверка карточки товара
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Загрузите фото карточки или товара — ИИ оценит её как покупатель на Wildberries и подскажет,
        что мешает продажам. Без регистрации, 3 проверки в день.
      </p>

      <Card className="mt-6">
        <CardContent className="space-y-4 p-5">
          <ImageUploader
            value={image}
            onChange={(v) => {
              setImage(v);
              setResult(null);
            }}
            label="Загрузите карточку или фото товара"
          />
          <Button className="w-full" variant="gradient" onClick={run} disabled={loading || !image}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Анализирую…
              </>
            ) : (
              <>
                <ScanSearch className="h-4 w-4" /> Проверить бесплатно
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="mt-6">
          <CardContent className="space-y-5 p-5">
            <div className="flex items-center gap-4">
              <div className={`text-5xl font-bold tabular-nums ${scoreColor(result.score)}`}>
                {result.score}
              </div>
              <div>
                <div className="text-sm font-semibold">баллов из 100</div>
                <div className="text-xs text-muted-foreground">общая оценка карточки</div>
              </div>
            </div>

            <p className="text-sm leading-relaxed">{result.diagnosis}</p>

            {result.thumbnail.verdict && (
              <p className="text-sm text-muted-foreground">
                <b>Тест миниатюры:</b> {result.thumbnail.verdict}
              </p>
            )}

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                Главный совет
              </div>
              <p className="mt-1 text-sm font-medium">{result.tip.issue}</p>
              {result.tip.fix && (
                <p className="mt-1 text-sm text-muted-foreground">Как исправить: {result.tip.fix}</p>
              )}
            </div>

            {lockedRows.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-semibold">В полном разборе ещё:</div>
                {lockedRows.map((row) => (
                  <div
                    key={row}
                    className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
                  >
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>{row}</span>
                  </div>
                ))}
              </div>
            )}

            <Button asChild className="w-full" variant="gradient">
              <Link href="/register">
                <Sparkles className="h-4 w-4" />
                Открыть полный разбор — бесплатно, 20 генов в подарок
              </Link>
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Регистрация за минуту · первое фото — бесплатно
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
