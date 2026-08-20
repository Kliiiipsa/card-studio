"use client";
import { Gem, Minus, Sparkles, ImageIcon, CheckSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface QuickAction {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  modifier: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "pricier",
    label: "Дороже и премиальнее",
    hint: "Более дорогой премиальный вид, благородные материалы, каталожное качество",
    icon: <Gem className="h-4 w-4" />,
    modifier: "более дорогой премиальный вид, благородные материалы, дорогая палитра",
  },
  {
    id: "minimal",
    label: "Чище и минималистичнее",
    hint: "Дорогой минимализм, больше воздуха, чистая редакторская композиция",
    icon: <Minus className="h-4 w-4" />,
    modifier: "дорогой минимализм, много свободного пространства, чистая композиция",
  },
  {
    id: "brighter",
    label: "Ярче и заметнее",
    hint: "Яркий акцентный цвет, энергичный, но аккуратный контраст",
    icon: <Sparkles className="h-4 w-4" />,
    modifier: "яркий акцентный цвет, энергичный, но аккуратный контраст",
  },
  {
    id: "bg",
    label: "Перегенерировать фон",
    hint: "Новый премиальный фон, товар остаётся неизменным и без искажений",
    icon: <ImageIcon className="h-4 w-4" />,
    modifier: "новый премиальный фон, товар без изменений и искажений",
  },
];

const CARD_CHECKLIST = [
  "Понятное УТП за 2 секунды",
  "Товар крупный и в центре",
  "Заголовок-выгода до 5 слов",
  "Единый акцентный цвет",
  "Элементы доверия (гарантия, состав)",
  "Чистый, не шумный фон",
];

export function AIRecommendations({
  onQuickAction,
  disabled,
}: {
  onQuickAction: (action: QuickAction) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Быстрые улучшения</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              title={a.hint}
              disabled={disabled}
              onClick={() => onQuickAction(a)}
              className="group flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="mt-0.5 text-primary">{a.icon}</span>
              <span className="min-w-0">
                <span className="block font-medium leading-tight">{a.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {a.hint}
                </span>
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CheckSquare className="h-4 w-4 text-primary" />
            Чек-лист хорошей карточки
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {CARD_CHECKLIST.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
