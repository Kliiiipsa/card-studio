"use client";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Lightbulb,
  Type,
  Palette,
  Eye,
  Smartphone,
  ShieldAlert,
  ArrowRight,
  LayoutGrid,
} from "lucide-react";
import type { AnalysisReport as Report, CardIdea } from "@/core/domain/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreCard } from "./score-card";
import { CARD_TYPE_MAP } from "@/core/domain/card-types";
import { cn } from "@/lib/utils";

/** sessionStorage key the infographics page reads on mount to prefill itself */
export const INFOGRAPHICS_PREFILL_KEY = "wb-infographics-prefill";

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
          <span className="text-foreground/80">{it}</span>
        </li>
      ))}
    </ul>
  );
}

const SEVERITY: Record<string, { label: string; className: string; rank: number }> = {
  high: { label: "критично", className: "bg-destructive/10 text-destructive", rank: 0 },
  medium: { label: "важно", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400", rank: 1 },
  low: { label: "полировка", className: "bg-muted text-muted-foreground", rank: 2 },
};

export function AnalysisReportView({
  report,
  productName,
}: {
  report: Report;
  /** the user-entered product name — used when sending an idea to infographics */
  productName?: string;
}) {
  const router = useRouter();

  const useIdeaForInfographic = (idea: CardIdea) => {
    sessionStorage.setItem(
      INFOGRAPHICS_PREFILL_KEY,
      JSON.stringify({
        name: productName?.trim() || report.observed.product,
        headline: idea.headline,
        benefits: idea.keyPoints,
      }),
    );
    router.push("/infographics");
  };

  const problems = [...report.problems].sort(
    (a, b) => (SEVERITY[a.severity]?.rank ?? 1) - (SEVERITY[b.severity]?.rank ?? 1),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {(report.observed.product || report.observed.composition) && (
          <Section icon={<Eye className="h-4 w-4" />} title="Что видит ИИ на карточке">
            <div className="space-y-2">
              {report.observed.product && (
                <p className="text-foreground/80">
                  <span className="text-muted-foreground">Товар: </span>
                  {report.observed.product}
                </p>
              )}
              {report.observed.composition && (
                <p className="text-foreground/80">
                  <span className="text-muted-foreground">Композиция: </span>
                  {report.observed.composition}
                </p>
              )}
              {report.observed.existingText.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {report.observed.existingText.map((t, i) => (
                    <Badge key={i} variant="secondary" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs">Надписей на карточке не обнаружено.</p>
              )}
            </div>
          </Section>
        )}

        <Section icon={<Stethoscope className="h-4 w-4" />} title="Короткий диагноз">
          <p className="text-foreground/80">{report.diagnosis}</p>
        </Section>

        <Section icon={<AlertTriangle className="h-4 w-4" />} title="Главная проблема">
          <p className="text-foreground/80">{report.mainProblem}</p>
        </Section>

        <Section icon={<ListChecks className="h-4 w-4" />} title="Проблемы и как исправить">
          <ul className="space-y-3">
            {problems.map((p, i) => {
              const sev = SEVERITY[p.severity] ?? SEVERITY.medium;
              return (
                <li key={i} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{p.issue}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        sev.className,
                      )}
                    >
                      {sev.label}
                    </span>
                  </div>
                  {p.fix && (
                    <p className="mt-1.5 flex gap-1.5 text-xs text-foreground/70">
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      {p.fix}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        <Section icon={<CheckCircle2 className="h-4 w-4" />} title="Что хорошо">
          <List items={report.whatWorks} />
        </Section>

        <Section icon={<Type className="h-4 w-4" />} title="Готовые тексты">
          <div className="space-y-3">
            {report.headlineIdeas.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-foreground">Заголовки</p>
                <List items={report.headlineIdeas.map((h) => `«${h}»`)} />
              </div>
            )}
            {report.benefitTexts.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-foreground">Плашки преимуществ</p>
                <div className="flex flex-wrap gap-1.5">
                  {report.benefitTexts.map((b, i) => (
                    <Badge key={i} variant="secondary" className="font-normal">
                      {b}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {report.textRewrites.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-foreground">Замены «было → стало»</p>
                <ul className="space-y-1.5">
                  {report.textRewrites.map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
                      {r.current ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 line-through opacity-70">
                          {r.current}
                        </span>
                      ) : (
                        <span className="italic opacity-60">нет текста</span>
                      )}
                      <ArrowRight className="h-3 w-3 text-primary" />
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-foreground">
                        {r.better}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>

        <Section icon={<Palette className="h-4 w-4" />} title="Рекомендации по визуалу">
          <List items={report.visualTips} />
        </Section>

        <div className="grid gap-4 md:grid-cols-2">
          <Section icon={<Smartphone className="h-4 w-4" />} title="Тест миниатюры (~200px)">
            <div className="flex items-start gap-2">
              <Badge
                className={cn(
                  "shrink-0",
                  report.thumbnailTest.readable
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive",
                )}
                variant="secondary"
              >
                {report.thumbnailTest.readable ? "читается" : "не читается"}
              </Badge>
              <p className="text-foreground/80">{report.thumbnailTest.verdict}</p>
            </div>
          </Section>
          <Section icon={<ShieldAlert className="h-4 w-4" />} title="Риски модерации WB">
            {report.riskFlags.length > 0 ? (
              <List items={report.riskFlags} />
            ) : (
              <p className="text-xs">Рискованных формулировок не найдено.</p>
            )}
          </Section>
        </div>

        <Section icon={<Lightbulb className="h-4 w-4" />} title="Идеи новых карточек">
          <div className="grid gap-2 sm:grid-cols-2">
            {report.newCardIdeas.map((idea, i) => (
              <div key={i} className="flex flex-col rounded-lg border p-3">
                <div className="text-xs font-medium text-primary">
                  {CARD_TYPE_MAP[idea.cardType as keyof typeof CARD_TYPE_MAP]?.title ??
                    idea.cardType}
                </div>
                <div className="mt-0.5 text-sm font-medium text-foreground">{idea.title}</div>
                <p className="mt-1 text-xs">{idea.angle}</p>
                {idea.headline && (
                  <p className="mt-1.5 text-xs italic text-foreground/70">«{idea.headline}»</p>
                )}
                {idea.keyPoints.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs">
                    {idea.keyPoints.map((k, j) => (
                      <li key={j} className="flex gap-1.5">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/50" />
                        {k}
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2.5 w-full"
                  onClick={() => useIdeaForInfographic(idea)}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Собрать инфографику
                </Button>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="lg:col-span-1">
        <Card className="sticky top-20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Оценка карточки</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreCard score={report.scores} reasons={report.scoreReasons} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
