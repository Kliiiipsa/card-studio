"use client";
import * as React from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListField } from "@/components/generator/product-form";
import { toast } from "@/components/ui/toaster";
import { PRICES, SPARK } from "@/core/billing/prices";
import { useProfileStore } from "@/store/profile-store";

type SeoTexts = { title: string; description: string; keywords: string[] };

export default function SeoPage() {
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [benefits, setBenefits] = React.useState<string[]>([]);
  const [materials, setMaterials] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [seo, setSeo] = React.useState<SeoTexts | null>(null);

  const generate = async () => {
    if (!name.trim()) return void toast.error("Укажите название товара.");
    if (!benefits.length) return void toast.error("Добавьте преимущества (по одному на строку).");
    setBusy(true);
    try {
      const res = await fetch("/api/ai/seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: name.trim(),
          category: category.trim() || undefined,
          benefits,
          materials,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { seo?: SeoTexts; error?: string };
      if (!res.ok || !data.seo) throw new Error(data.error ?? "Не удалось сгенерировать SEO");
      setSeo(data.seo);
      void useProfileStore.getState().fetchMe();
      toast.success("SEO-тексты готовы");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сгенерировать SEO");
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string, what: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`${what} — скопировано`))
      .catch(() => toast.error("Не удалось скопировать"));

  return (
    <AppShell title="SEO-тексты">
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              Название, описание и ключи для карточки
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Заполните данные — ИИ напишет SEO-название (главные ключи в начале), продающее
              описание и 12–15 реальных поисковых запросов покупателей WB.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sname">Название товара</Label>
                <Input
                  id="sname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Худи оверсайз"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scat">Категория</Label>
                <Input
                  id="scat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Одежда"
                />
              </div>
            </div>
            <ListField
              id="sben"
              label="Преимущества (по одному на строку)"
              placeholder={"Плотный хлопок 380 г\nНе скатывается\nУнисекс"}
              value={benefits}
              onChange={setBenefits}
            />
            <ListField
              id="smat"
              label="Состав и материалы (необязательно)"
              placeholder={"80% хлопок, 20% полиэстер"}
              value={materials}
              onChange={setMaterials}
            />
            <Button variant="gradient" className="w-full" onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Создать SEO · {PRICES.seo} {SPARK}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!seo ? (
            <Card>
              <CardContent className="flex min-h-[240px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Здесь появятся готовые тексты — название, описание и ключевые запросы с кнопками
                копирования.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">SEO для карточки</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Название</p>
                    <Button variant="ghost" size="sm" onClick={() => copy(seo.title, "Название")}>
                      Копировать
                    </Button>
                  </div>
                  <p className="rounded-lg border bg-card/60 p-2.5">{seo.title}</p>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Описание</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copy(seo.description, "Описание")}
                    >
                      Копировать
                    </Button>
                  </div>
                  <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-card/60 p-2.5 text-xs leading-5">
                    {seo.description}
                  </p>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      Ключевые запросы ({seo.keywords.length})
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copy(seo.keywords.join(", "), "Ключевые запросы")}
                    >
                      Копировать
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {seo.keywords.map((k) => (
                      <span
                        key={k}
                        className="rounded-full border bg-card/60 px-2 py-0.5 text-[11px]"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
