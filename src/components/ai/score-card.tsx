"use client";
import type { CardScore } from "@/core/domain/types";
import { cn } from "@/lib/utils";

const AXES: { key: keyof CardScore; label: string }[] = [
  { key: "cover", label: "Обложка" },
  { key: "infographics", label: "Инфографика" },
  { key: "text", label: "Текст" },
  { key: "composition", label: "Композиция" },
  { key: "trust", label: "Доверие" },
  { key: "sellingPower", label: "Продающая сила" },
];

function color(v: number) {
  if (v >= 75) return "text-emerald-600";
  if (v >= 55) return "text-amber-600";
  return "text-destructive";
}
function barColor(v: number) {
  if (v >= 75) return "bg-emerald-500";
  if (v >= 55) return "bg-amber-500";
  return "bg-destructive";
}

export function ScoreCard({
  score,
  reasons,
}: {
  score: CardScore;
  /** optional one-line justification per axis (from the analysis report) */
  reasons?: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-xl border bg-gradient-to-br from-primary/5 to-blue-500/5 p-4">
        <div className="relative flex h-20 w-20 items-center justify-center">
          <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke="hsl(var(--secondary))"
              strokeWidth="3"
            />
            <circle
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="3"
              strokeDasharray={`${score.total} 100`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-xl font-bold">{score.total}</span>
        </div>
        <div>
          <div className="text-sm font-semibold">Общий балл карточки</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {score.comment ?? "Оценка по 6 ключевым осям продаваемости."}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {AXES.map(({ key, label }) => {
          const v = score[key] as number;
          const reason = reasons?.[key as string];
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className={cn("font-semibold", color(v))}>{v}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full transition-all", barColor(v))}
                  style={{ width: `${v}%` }}
                />
              </div>
              {reason && (
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{reason}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
