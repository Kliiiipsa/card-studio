"use client";
import * as React from "react";
import Link from "next/link";
import { ScanSearch, Loader2, Wand2, RefreshCw, Copy } from "lucide-react";
import { PRICES, SPARK } from "@/core/billing/prices";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@/components/media/image-uploader";
import { ImagePreview } from "@/components/media/image-preview";
import { GeneratedImageGrid } from "@/components/generator/generated-image-grid";
import { ExportPanel } from "@/components/generator/export-panel";
import { AnalysisReportView } from "@/components/ai/analysis-report";
import { EmptyState } from "@/components/project/empty-state";
import { api } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { uid } from "@/lib/utils";
import { analysisTable } from "@/core/storage/db";
import { reportToMarkdown } from "@/lib/report-markdown";
import { splitAdvice, buildImprovePrompt } from "@/core/ai/improve-prompt";
import type { AnalysisReport } from "@/core/domain/types";
import type { GeneratedVariant } from "@/store/generator-store";

const CONCERNS = [
  { id: "none", label: "Просто аудит" },
  { id: "ctr", label: "Мало кликов из выдачи (низкий CTR)" },
  { id: "conversion", label: "Кликают, но не покупают" },
  { id: "returns", label: "Жалобы и возвраты «не то ожидал»" },
];
const CONCERN_TEXT: Record<string, string | undefined> = {
  none: undefined,
  ctr: "низкий CTR — карточку мало открывают из выдачи",
  conversion: "по карточке кликают, но не покупают — слабая конверсия в заказ",
  returns: "покупатели жалуются и возвращают товар: ожидание не совпадает с реальностью",
};

/** last report persists across F5 (single slot) */
const SAVED_KEY = "last";

/** Показывать ли «Улучшить карточку по советам ИИ» — выключено 2026-08-21. */
const SHOW_IMPROVE = false;
type SavedAnalysis = {
  report: AnalysisReport;
  image: string | null;
  name: string;
  category: string;
  audience: string;
  concern: string;
};

export default function AnalysisPage() {
  const [image, setImage] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [audience, setAudience] = React.useState("");
  const [concern, setConcern] = React.useState("none");
  const [loading, setLoading] = React.useState(false);
  const [report, setReport] = React.useState<AnalysisReport | null>(null);

  const [improving, setImproving] = React.useState(false);
  const [variants, setVariants] = React.useState<GeneratedVariant[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const selected = variants.find((v) => v.id === selectedId);

  // restore the last report after a reload
  React.useEffect(() => {
    analysisTable.getItem<SavedAnalysis>(SAVED_KEY).then((saved) => {
      if (!saved?.report) return;
      setReport(saved.report);
      setImage(saved.image);
      setName(saved.name);
      setCategory(saved.category);
      setAudience(saved.audience ?? "");
      setConcern(saved.concern ?? "none");
    });
  }, []);

  const analyze = async () => {
    if (!image) {
      toast.error("Загрузите карточку для анализа.");
      return;
    }
    setLoading(true);
    setReport(null);
    setVariants([]);
    try {
      const result = await api.analyze(image, { name, category, audience }, CONCERN_TEXT[concern]);
      setReport(result);
      await analysisTable.setItem<SavedAnalysis>(SAVED_KEY, {
        report: result,
        image,
        name,
        category,
        audience,
        concern,
      });
      toast.success("Анализ готов");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка анализа");
    } finally {
      setLoading(false);
    }
  };

  const copyReport = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(reportToMarkdown(report, name));
      toast.success("Отчёт скопирован (markdown)");
    } catch {
      toast.error("Не удалось скопировать отчёт");
    }
  };

  const improve = async () => {
    if (!image || !report) return;
    setImproving(true);
    try {
      // Советы делим: свет/фон/композицию отдаём модели, а плашки и тексты —
      // нет, она их рисует нечитаемой кашей (разбор 2026-08-21).
      const split = splitAdvice([
        ...report.problems.map((p) => p.fix),
        ...report.visualTips,
      ]);
      const prompt = buildImprovePrompt(split);
      const cardText =
        (report.headlineIdeas[0] || report.newCardIdeas[0]?.headline || name || "")
          .trim()
          .slice(0, 60) || undefined;
      if (split.textual.length) {
        toast.info(
          `Советы про текст и плашки (${split.textual.length}) сюда не пойдут — их сделает «Инфографика»`,
        );
      }

      const result = await api.generateImage({
        prompt,
        referenceImageDataUrl: image,
        strength: 0.45,
        aspectRatio: "3:4",
        count: 1,
        cardText,
      });
      const vs: GeneratedVariant[] = result.images.map((img) => ({
        id: uid("var"),
        url: img.url,
        width: img.width,
        height: img.height,
      }));
      setVariants(vs);
      setSelectedId(vs[0]?.id ?? null);
      toast.success("Улучшенная карточка готова");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка улучшения");
    } finally {
      setImproving(false);
    }
  };

  return (
    <AppShell title="Анализ и улучшение карточки">
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* Input */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Текущая карточка</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImageUploader
                value={image}
                onChange={setImage}
                label="Загрузите карточку или фото товара"
                hint="Скриншот карточки из выдачи маркетплейса или фото товара"
              />
              <div className="space-y-1.5">
                <Label htmlFor="aname">Название товара (необязательно)</Label>
                <Input
                  id="aname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Мужской костюм"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acat">Категория (необязательно)</Label>
                <Input
                  id="acat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Одежда"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aaud">Целевая аудитория (необязательно)</Label>
                <Input
                  id="aaud"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="Мужчины 25–45"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Что беспокоит?</Label>
                <Select value={concern} onValueChange={setConcern}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONCERNS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={analyze}
                disabled={loading || !image}
                variant="gradient"
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ScanSearch className="h-4 w-4" />
                )}
                Проанализировать · {PRICES.analyze} {SPARK}
              </Button>
              <p className="text-[11px] leading-4 text-muted-foreground">
                Хотите узнать, чья карточка сильнее — ваша или конкурента?{" "}
                <Link href="/compare" className="font-medium text-primary hover:underline">
                  Сравнение карточек
                </Link>{" "}
                за {PRICES.compare} {SPARK}.
              </p>

              {/* «Улучшить карточку по советам ИИ» СКРЫТА (решение пользователя
                  2026-08-21): результат не оправдывал 7 🧬 — модель меняла свет и
                  фон, но карточку это не продвигало, а советы анализа почти
                  всегда про текст и плашки, то есть про «Инфографику».
                  Код (improve + фильтр промпта) сохранён: вернуть = показать
                  кнопку снова. */}
              {report && SHOW_IMPROVE && (
                <Button onClick={improve} disabled={improving} variant="outline" className="w-full">
                  {improving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Улучшить карточку по советам ИИ · {PRICES.generate} {SPARK}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Improved result */}
          {(improving || variants.length > 0) && (
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm">Улучшенная карточка</CardTitle>
                {variants.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={improve} disabled={improving}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {improving && variants.length === 0 ? (
                  <div className="flex aspect-[3/4] items-center justify-center rounded-xl border bg-card/60 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
                    ИИ улучшает карточку…
                  </div>
                ) : (
                  <ImagePreview src={selected?.url} />
                )}
                {variants.length > 1 && (
                  <GeneratedImageGrid
                    variants={variants}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                )}
                {selected && (
                  <ExportPanel
                    src={selected.url}
                    variants={variants}
                    overlay={{
                      headline:
                        report?.headlineIdeas[0] ||
                        report?.newCardIdeas[0]?.headline ||
                        name ||
                        undefined,
                      scrim: true,
                    }}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Report */}
        <div>
          {loading ? (
            <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-xl border bg-card/60 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm">ИИ анализирует карточку как маркетплейс-дизайнер…</p>
            </div>
          ) : report ? (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={copyReport}>
                  <Copy className="h-3.5 w-3.5" />
                  Скопировать отчёт
                </Button>
              </div>
              <AnalysisReportView report={report} productName={name} />
            </div>
          ) : (
            <EmptyState
              icon={<ScanSearch className="h-6 w-6" />}
              title="Загрузите карточку для анализа"
              description="ИИ оценит обложку, текст, композицию и доверие, найдёт что мешает покупке и даст конкретный план улучшений. После анализа можно одной кнопкой сгенерировать улучшенную карточку."
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
