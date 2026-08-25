"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Wand2, Loader2, RefreshCw, Sparkles, Eraser, ImagePlus, LayoutGrid } from "lucide-react";
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
import { ListField } from "@/components/generator/product-form";
import { GeneratedImageGrid } from "@/components/generator/generated-image-grid";
import { LoadingGenerationState } from "@/components/generator/loading-generation-state";
import { ExportPanel } from "@/components/generator/export-panel";
import { ImageUploader } from "@/components/media/image-uploader";
import { ImagePreview } from "@/components/media/image-preview";
import { useGeneratorStore, type StyleMode, type GenMode } from "@/store/generator-store";
import { useCardGeneration } from "@/hooks/use-card-generation";
import { PHOTO_SCENARIOS, PHOTO_SCENARIO_MAP, type PhotoScenarioId } from "@/core/domain/photo-scenarios";
import { ASPECT_RATIOS, type AspectRatioId } from "@/core/domain/export-presets";
import { INFOGRAPHICS_PREFILL_KEY } from "@/components/ai/analysis-report";
import { uid } from "@/lib/utils";

const STYLE_MODES: { id: StyleMode; label: string }[] = [
  { id: "auto", label: "Авто" },
  { id: "minimal", label: "Минимал" },
  { id: "premium", label: "Премиум" },
  { id: "bold", label: "Ярко" },
  { id: "lifestyle", label: "Lifestyle" },
];

function GeneratorInner() {
  const params = useSearchParams();
  const s = useGeneratorStore();
  const { writePrompt, generate, improvePrompt } = useCardGeneration();
  const [writing, setWriting] = React.useState(false);
  const [improving, setImproving] = React.useState(false);

  React.useEffect(() => {
    const type = params.get("type");
    if (type && PHOTO_SCENARIO_MAP[type]) s.setField("cardType", type as PhotoScenarioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = s.status === "generating" || s.status === "scoring";
  const freeMode = s.genMode === "free";
  // Tailwind needs the literal class names — a computed aspect-[…] won't compile
  const placeholderAspect =
    { "3:4": "aspect-[3/4]", "4:5": "aspect-[4/5]", "1:1": "aspect-square", "9:16": "aspect-[9/16]" }[
      s.aspectRatio
    ] ?? "aspect-[3/4]";
  const selected = s.variants.find((v) => v.id === s.selectedVariantId);
  const latestScore = s.lastScore;

  const handleWrite = async () => {
    setWriting(true);
    await writePrompt();
    setWriting(false);
  };

  const handleImprove = async () => {
    setImproving(true);
    await improvePrompt();
    setImproving(false);
  };

  // hand the generated photo over to the infographics section as the product
  // photo — the natural "clean photo → card with text" pipeline
  const router = useRouter();
  const toInfographic = () => {
    if (!selected) return;
    sessionStorage.setItem(
      INFOGRAPHICS_PREFILL_KEY,
      JSON.stringify({
        name: s.product.name,
        benefits: s.product.benefits,
        image: selected.url,
      }),
    );
    router.push("/infographics");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-20 md:pb-0">
      {/* Режим раздела: карточка для маркетплейса или свободная генерация */}
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            {
              id: "market",
              title: "Для маркетплейса",
              desc: "Продающее фото товара: сценарии, стили, оценка карточки",
            },
            {
              id: "free",
              title: "Обычное фото",
              desc: "Свободная генерация по вашему описанию — без привязки к товару",
            },
          ] as { id: GenMode; title: string; desc: string }[]
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => s.setField("genMode", m.id)}
            className={
              "rounded-xl border px-4 py-3 text-left transition-colors " +
              (s.genMode === m.id
                ? "border-primary bg-primary/5"
                : "bg-card/60 hover:border-primary/40")
            }
          >
            <p className="text-sm font-medium">{m.title}</p>
            <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{m.desc}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      {/* BLOCK 1 — Product data / reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            {freeMode ? "1. Референс и размер" : "1. Данные товара"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ImageUploader
            value={s.reference?.dataUrl}
            onChange={(dataUrl) =>
              s.setReference(dataUrl ? { id: uid("ref"), dataUrl, createdAt: Date.now() } : null)
            }
            label={freeMode ? "Фото-референс" : "Загрузите фото товара"}
            hint={
              freeMode
                ? "Необязательно. Результат будет опираться на это фото (image-to-image)"
                : "Необязательно. С фото ИИ напишет промпт точнее (image-to-image)"
            }
          />

          <div className="space-y-1.5" hidden={freeMode}>
            <Label htmlFor="name">Название товара</Label>
            <Input
              id="name"
              value={s.product.name}
              onChange={(e) => s.setProduct({ name: e.target.value })}
              placeholder="Например: Мужской деловой костюм"
            />
          </div>

          {!freeMode && (
          <ListField
            id="benefits"
            label="Преимущества (по одному на строку)"
            placeholder={"Не мнётся\nДышащая ткань\nСидит по фигуре"}
            value={s.product.benefits}
            onChange={(benefits) => s.setProduct({ benefits })}
          />
          )}

          {/* Secondary fields only nudge the AI prompt — hidden by default. */}
          {!freeMode && (
          <details className="group rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              Дополнительно (необязательно)
            </summary>
            <div className="mt-3 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="category">Категория</Label>
                <Input
                  id="category"
                  value={s.product.category}
                  onChange={(e) => s.setProduct({ category: e.target.value })}
                  placeholder="Одежда"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audience">Целевая аудитория</Label>
                <Input
                  id="audience"
                  value={s.product.audience}
                  onChange={(e) => s.setProduct({ audience: e.target.value })}
                  placeholder="Мужчины 25–40, офис"
                />
              </div>
              <ListField
                id="pains"
                label="Боли клиента (по одной на строку)"
                placeholder={"Костюмы быстро мнутся\nТрудно подобрать размер"}
                value={s.product.pains}
                onChange={(pains) => s.setProduct({ pains })}
              />
            </div>
          </details>
          )}

          <div className="space-y-1.5" hidden={freeMode}>
            <Label htmlFor="note">Дополнительное пожелание</Label>
            <Textarea
              id="note"
              value={s.userNote}
              onChange={(e) => s.setField("userNote", e.target.value)}
              placeholder="Например: тёмный премиальный фон, акцент на качестве"
              className="min-h-[60px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5" hidden={freeMode}>
              <Label className="text-xs">Сценарий фото</Label>
              <Select
                value={s.cardType}
                onValueChange={(v) => s.setField("cardType", v as PhotoScenarioId)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHOTO_SCENARIOS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5" hidden={freeMode}>
              <Label className="text-xs">Стиль</Label>
              <Select
                value={s.styleMode}
                onValueChange={(v) => s.setField("styleMode", v as StyleMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLE_MODES.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Размер фото</Label>
              <Select
                value={s.aspectRatio}
                onValueChange={(v) => s.setField("aspectRatio", v as AspectRatioId)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIOS.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!freeMode && (
          <p className="text-[11px] leading-4 text-muted-foreground">
            Этот раздел делает чистое фото без надписей. Нужна карточка с текстом и плашками —{" "}
            <Link href="/infographics" className="font-medium text-primary hover:underline">
              соберите инфографику
            </Link>
            .
          </p>
          )}
        </CardContent>
      </Card>

      {/* BLOCK 2 + 3 — Prompt & generation */}
      <div className="space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{freeMode ? "2. Что нарисовать?" : "2. Промпт"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!freeMode && (
            <Button
              onClick={handleWrite}
              disabled={writing || busy}
              variant="gradient"
              className="w-full"
            >
              {writing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Написать промпт
            </Button>
            )}

            <Textarea
              value={s.userPrompt}
              onChange={(e) => s.setField("userPrompt", e.target.value)}
              placeholder={
                freeMode
                  ? "Опишите картинку своими словами, по-русски. Например: уютная кухня в скандинавском стиле, утренний свет, на столе чашка кофе"
                  : "Нажмите «Написать промпт» — ИИ опишет карточку по фото и данным товара. Текст можно отредактировать."
              }
              className="min-h-[160px]"
            />

            <div className="flex gap-2">
              {!freeMode && (
              <Button
                onClick={handleImprove}
                disabled={improving || busy || !s.userPrompt.trim()}
                variant="outline"
                size="sm"
              >
                {improving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Переписать
              </Button>
              )}
              <Button
                onClick={() => s.setField("userPrompt", "")}
                disabled={!s.userPrompt.trim()}
                variant="ghost"
                size="sm"
              >
                <Eraser className="h-4 w-4" />
                Очистить
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm">3. Генерация</CardTitle>
            {s.variants.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => generate()} disabled={busy}>
                <RefreshCw className="h-4 w-4" />
                Ещё вариант
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => generate()}
              disabled={busy || !s.userPrompt.trim()}
              variant="gradient"
              size="lg"
              className="w-full"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Сгенерировать фото · 7 🧬
            </Button>

            {busy ? (
              <LoadingGenerationState status={s.status} />
            ) : selected ? (
              <ImagePreview src={selected.url} className="mx-auto max-w-sm" />
            ) : (
              <div className={`flex ${placeholderAspect} max-w-sm mx-auto items-center justify-center rounded-xl border border-dashed text-center text-sm text-muted-foreground`}>
                <span className="flex flex-col items-center gap-2 px-6">
                  <ImagePlus className="h-6 w-6 opacity-60" />
                  Здесь появится фото
                </span>
              </div>
            )}

            {s.variants.length > 1 && (
              <div className="mx-auto max-w-sm">
                <GeneratedImageGrid
                  variants={s.variants}
                  selectedId={s.selectedVariantId}
                  onSelect={(id) => s.selectVariant(id)}
                />
              </div>
            )}

            {selected && (
              <div className="space-y-3 border-t pt-4">
                <ExportPanel
                  src={selected.url}
                  variants={s.variants}
                  overlay={{
                    headline:
                      s.overlayHeadline || s.product.benefits[0] || s.product.name || undefined,
                    benefits: s.product.benefits.slice(0, 3),
                    scrim: true,
                  }}
                />
                <Button variant="outline" className="w-full" onClick={toInfographic}>
                  <LayoutGrid className="h-4 w-4" />
                  Сделать инфографику из этого фото · 10 🧬
                </Button>
                {latestScore && (
                  <p className="text-center text-xs text-muted-foreground">
                    Оценка карточки: <span className="font-semibold">{latestScore.total}/100</span>
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>

      {/* Mobile: the generate CTA is always in reach at the bottom of the screen */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 p-3 backdrop-blur-xl md:hidden">
        <Button
          onClick={() => generate()}
          disabled={busy || !s.userPrompt.trim()}
          variant="gradient"
          className="w-full"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Сгенерировать фото · 7 🧬
        </Button>
      </div>
    </div>
  );
}

export default function GeneratorPage() {
  return (
    <AppShell title="Фото товара">
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Загрузка…</div>}>
        <GeneratorInner />
      </Suspense>
    </AppShell>
  );
}
