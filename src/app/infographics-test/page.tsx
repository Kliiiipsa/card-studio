"use client";
import * as React from "react";
import { FlaskConical, Loader2, Wand2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";

/**
 * ВРЕМЕННАЯ тестовая страница (не в меню, только для админа): инфографика тем
 * же промптом, что боевая, но через AliceAI (Yandex AI Studio) вместо
 * gpt-image. Гипотеза: потянет ли AliceAI русский текст на карточке.
 * После теста страница удаляется вместе с роутом и провайдером.
 */
const STYLES = [
  { id: "auto", label: "Авто" },
  { id: "minimal", label: "Минимал" },
  { id: "premium", label: "Премиум" },
  { id: "bright", label: "Ярко" },
  { id: "soft", label: "Мягкий" },
  { id: "dark", label: "Тёмный" },
];

export default function InfographicsTestPage() {
  const [productName, setProductName] = React.useState("Мужские джинсы прямого кроя");
  const [headline, setHeadline] = React.useState("Джинсы, которые держат форму");
  const [subheadline, setSubheadline] = React.useState("");
  const [benefits, setBenefits] = React.useState("Хлопок 98%\nНе тянутся на коленях\nУсиленные швы");
  const [style, setStyle] = React.useState("auto");
  const [customPrompt, setCustomPrompt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ imageDataUrl: string; prompt: string } | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ai/infographic/test-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          headline,
          subheadline: subheadline || undefined,
          benefits: benefits.split("\n").map((s) => s.trim()).filter(Boolean),
          style,
          customPrompt: customPrompt.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { imageDataUrl?: string; prompt?: string; error?: string };
      if (!res.ok || !data.imageDataUrl) throw new Error(data.error ?? "Генерация не удалась");
      setResult({ imageDataUrl: data.imageDataUrl, prompt: data.prompt ?? "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Генерация не удалась");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Инфографика — тест AliceAI">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-primary" />
              Тест: AliceAI (Yandex AI Studio) вместо gpt-image
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Промпт собирается тем же кодом, что у боевой инфографики. Отличия теста: рисует
              AliceAI, фото товара на вход не принимает (товар нарисует модель), формат 1:1,
              гены не списываются. Страница видна только администратору.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Название товара</Label>
              <Input id="t-name" value={productName} onChange={(e) => setProductName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-headline">Заголовок (появится на карточке)</Label>
              <Input id="t-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-sub">Подзаголовок (необязательно)</Label>
              <Input id="t-sub" value={subheadline} onChange={(e) => setSubheadline(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-benefits">Плашки (по одной на строку)</Label>
              <Textarea
                id="t-benefits"
                value={benefits}
                onChange={(e) => setBenefits(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Стиль</Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <details className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">
                Свой промпт (заменит собранный автоматически)
              </summary>
              <Textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Оставьте пустым, чтобы использовать боевой промпт инфографики"
                className="mt-2 min-h-[100px]"
              />
            </details>
            <Button onClick={generate} disabled={busy} variant="gradient" className="w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Сгенерировать через AliceAI (бесплатно)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Результат</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {busy ? (
              <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> AliceAI рисует… (до 2 минут)
                </span>
              </div>
            ) : result ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.imageDataUrl}
                  alt="Тестовая инфографика AliceAI"
                  className="w-full rounded-xl border"
                />
                <details className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                  <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">
                    Промпт, который ушёл в модель
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                    {result.prompt}
                  </p>
                </details>
              </>
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                Здесь появится карточка
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
