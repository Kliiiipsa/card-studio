"use client";
import * as React from "react";
import Link from "next/link";
import { Scale, Loader2, Trophy, ArrowRight, LayoutGrid } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/media/image-uploader";
import { EmptyState } from "@/components/project/empty-state";
import { api } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { PRICES, SPARK } from "@/core/billing/prices";
import type { ComparisonReport } from "@/core/ai/schemas";

const AXES: { key: keyof ComparisonReport["scoreMine"] & string; label: string }[] = [
  { key: "cover", label: "Фото" },
  { key: "infographics", label: "Инфографика" },
  { key: "text", label: "Текст" },
  { key: "composition", label: "Композиция" },
  { key: "trust", label: "Доверие" },
  { key: "sellingPower", label: "Продающая сила" },
];

export default function ComparePage() {
  const [mine, setMine] = React.useState<string | null>(null);
  const [competitor, setCompetitor] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [concern, setConcern] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [report, setReport] = React.useState<ComparisonReport | null>(null);

  const compare = async () => {
    if (!mine || !competitor) {
      toast.error("Загрузите обе карточки — свою и конкурента.");
      return;
    }
    setLoading(true);
    setReport(null);
    try {
      const result = await api.compare(mine, competitor, { name }, concern.trim() || undefined);
      setReport(result);
      toast.success("Сравнение готово");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сравнения");
    } finally {
      setLoading(false);
    }
  };

  const verdictBanner = report
    ? {
        mine: {
          cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
          title: "Ваша карточка выигрывает",
        },
        competitor: {
          cls: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
          title: "Пока сильнее конкурент",
        },
        tie: {
          cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
          title: "Примерно равны",
        },
      }[report.verdict]
    : null;

  return (
    <AppShell title="Сравнение карточек">
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* Input */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Кто против кого</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImageUploader
                value={mine}
                onChange={setMine}
                label="Ваша карточка"
                hint="Скриншот вашей карточки из выдачи или готовый макет"
              />
              <ImageUploader
                value={competitor}
                onChange={setCompetitor}
                label="Карточка конкурента"
                hint="Скриншот карточки конкурента из той же категории"
              />
              <div className="space-y-1.5">
                <Label htmlFor="cname">Название товара (необязательно)</Label>
                <Input
                  id="cname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Мужской костюм"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cconcern">Что для вас важно? (необязательно)</Label>
                <Input
                  id="cconcern"
                  value={concern}
                  onChange={(e) => setConcern(e.target.value)}
                  placeholder="Например: почему у него покупают, а у меня нет"
                />
              </div>
              <Button
                onClick={compare}
                disabled={loading || !mine || !competitor}
                variant="gradient"
                className="w-full"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
                Сравнить · {PRICES.compare} {SPARK}
              </Button>
              <p className="text-[11px] leading-4 text-muted-foreground">
                Нужен подробный план правок по одной карточке — это делает{" "}
                <Link href="/analysis" className="font-medium text-primary hover:underline">
                  Анализ карточки
                </Link>{" "}
                за {PRICES.analyze} {SPARK}.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Report */}
        <div>
          {loading ? (
            <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-xl border bg-card/60 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm">ИИ сравнивает карточки глазами покупателя…</p>
            </div>
          ) : report ? (
            <div className="space-y-4">
              {/* Verdict */}
              <div className={cn("rounded-xl border p-4", verdictBanner?.cls)}>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Trophy className="h-4 w-4" />
                  {verdictBanner?.title} — {report.scoreMine.total} : {report.scoreCompetitor.total}
                </p>
                <p className="mt-1.5 text-sm leading-6">{report.verdictText}</p>
              </div>

              {/* Axis table */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">По осям</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {AXES.map((a) => {
                    const m = report.scoreMine[a.key] as number;
                    const c = report.scoreCompetitor[a.key] as number;
                    return (
                      <div key={a.key}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="font-medium">{a.label}</span>
                          <span className="text-xs text-muted-foreground">
                            вы <strong className={cn(m >= c ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>{m}</strong>
                            {" · "}
                            конкурент <strong className={cn(c > m ? "text-red-600 dark:text-red-400" : "text-foreground")}>{c}</strong>
                          </span>
                        </div>
                        <div className="mt-1 flex gap-1">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${m}%` }} />
                          </div>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-red-400" style={{ width: `${c}%` }} />
                          </div>
                        </div>
                        {report.axisComments[a.key] && (
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {report.axisComments[a.key]}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {report.thumbnailVerdict && (
                    <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                      <strong className="text-foreground">Тест миниатюры:</strong>{" "}
                      {report.thumbnailVerdict}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Lists */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-emerald-600 dark:text-emerald-400">
                      В чём вы сильнее
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5 text-sm leading-6">
                      {report.advantages.length ? (
                        report.advantages.map((t, i) => <li key={i}>• {t}</li>)
                      ) : (
                        <li className="text-muted-foreground">Пока нечего выделить.</li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-red-600 dark:text-red-400">
                      Что у конкурента сделано лучше
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5 text-sm leading-6">
                      {report.weaknesses.length ? (
                        report.weaknesses.map((t, i) => <li key={i}>• {t}</li>)
                      ) : (
                        <li className="text-muted-foreground">Существенных преимуществ нет.</li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Adopt plan */}
              {report.adopt.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Что перенять — план действий</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ol className="space-y-1.5 text-sm leading-6">
                      {report.adopt.map((t, i) => (
                        <li key={i}>
                          {i + 1}. {t}
                        </li>
                      ))}
                    </ol>
                    <div className="flex flex-wrap gap-2 border-t pt-3">
                      <Button asChild variant="gradient" size="sm">
                        <Link href="/infographics">
                          <LayoutGrid className="h-4 w-4" />
                          Собрать карточку с плашками · {PRICES.infographic} {SPARK}
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/analysis">
                          Подробный разбор моей карточки · {PRICES.analyze} {SPARK}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<Scale className="h-6 w-6" />}
              title="Загрузите две карточки"
              description="Свою и конкурента из той же категории. ИИ оценит обе по одной рубрике, скажет, кто выигрывает в выдаче и почему, и даст план: что перенять, чтобы обойти конкурента."
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
