"use client";
import * as React from "react";
import { Loader2, Wand2, Sparkles, ScanLine, RefreshCw, ImagePlus } from "lucide-react";
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
import { ImageUploader } from "@/components/media/image-uploader";
import { EmptyState } from "@/components/project/empty-state";
import { InfographicCanvas } from "@/components/infographics/infographic-canvas";
import {
  InfographicBriefEditor,
  type BriefEdit,
} from "@/components/infographics/infographic-brief-editor";
import { InfographicExportPanel } from "@/components/infographics/infographic-export-panel";
import { InfographicReferencePicker } from "@/components/infographics/infographic-reference-picker";
import { api } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { EMPTY_PRODUCT, type ProductInfo } from "@/core/domain/types";
import {
  INFOGRAPHIC_TYPES,
  INFOGRAPHIC_STYLES,
  type InfographicType,
  type InfographicStyle,
  type InfographicInput,
  type InfographicBrief,
  type StyleProfile,
} from "@/core/infographics/types";
import { assembleBrief } from "@/core/infographics/brief-builder";
import { DEFAULT_STYLE_PROFILE } from "@/core/infographics/style-library";
import { INFOGRAPHICS_PREFILL_KEY } from "@/components/ai/analysis-report";

export default function InfographicsPage() {
  const [product, setProduct] = React.useState<ProductInfo>({ ...EMPTY_PRODUCT });
  const [reference, setReference] = React.useState<string | null>(null);
  const [userNote, setUserNote] = React.useState("");
  const [type, setType] = React.useState<InfographicType>("benefits");
  const [style, setStyle] = React.useState<InfographicStyle>("auto");
  const [styleProfile, setStyleProfile] = React.useState<StyleProfile | null>(
    DEFAULT_STYLE_PROFILE,
  );
  // raw style-reference image (data URL) — the i2i style anchor, separate from
  // the product photo (`reference`)
  const [styleReferenceImage, setStyleReferenceImage] = React.useState<string | null>(null);

  const [brief, setBrief] = React.useState<InfographicBrief | null>(null);
  const [baseImageUrl, setBaseImageUrl] = React.useState<string | null>(null);
  // true when the model baked the text into the image (gpt-image) — skip overlay
  const [textBaked, setTextBaked] = React.useState(false);

  const [autofilling, setAutofilling] = React.useState(false);
  const [briefing, setBriefing] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  // synchronous in-flight guard: `generating` state updates async, so two quick
  // clicks (or a double event) could both pass and queue duplicate gpt-image jobs
  const generatingRef = React.useRef(false);
  // each generate click advances the seed → the next base gets a different
  // composition variant (the pool lives in composition-variants.ts)
  const variantSeedRef = React.useRef(0);

  const buildInput = (): InfographicInput => ({
    productName: product.name,
    category: product.category,
    targetAudience: product.audience,
    benefits: product.benefits,
    painPoints: product.pains,
    userNote,
    referenceImage: reference ?? undefined,
    type,
    style,
    marketplace: "wildberries",
    aspectRatio: "3:4",
  });

  const handleAutofill = async () => {
    if (!reference) {
      toast.error("Сначала загрузите фото товара.");
      return;
    }
    setAutofilling(true);
    try {
      const r = await api.infographic.autofill({
        imageDataUrl: reference,
        productName: product.name || undefined,
        category: product.category || undefined,
      });
      setProduct((p) => ({
        ...p,
        name: p.name || r.detectedProduct,
        category: p.category || r.suggestedCategory,
        benefits: p.benefits.length ? p.benefits : r.suggestedBenefits,
        pains: p.pains.length ? p.pains : r.suggestedPainPoints,
      }));
      if (r.warnings.length) toast.info(r.warnings[0]);
      else toast.success("Данные заполнены по фото");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось распознать фото");
    } finally {
      setAutofilling(false);
    }
  };

  const handleBrief = async () => {
    if (!product.name.trim()) {
      toast.error("Укажите название товара.");
      return;
    }
    setBriefing(true);
    setBaseImageUrl(null);
    try {
      const b = await api.infographic.brief(buildInput(), styleProfile ?? undefined);
      setBrief(b);
      toast.success("Инфографика собрана — проверьте текст");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось собрать инфографику");
    } finally {
      setBriefing(false);
    }
  };

  // edits rebuild the overlay instantly on the client (no tokens); the existing
  // per-photo layout plan is carried through so geometry stays consistent.
  const handleBriefEdit = (edit: BriefEdit) => {
    setBrief(assembleBrief(buildInput(), edit, styleProfile ?? undefined, brief?.layoutPlan));
  };

  // Restore the last server-tracked generation: a job started before the tab
  // was closed keeps running on the server — on return we either re-attach to
  // it (processing) or show its stored result (completed, image is in S3).
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const job = await api.infographic.latestJob();
      if (!job || cancelled) return;
      const payload = job.payload ?? undefined;
      if (job.status === "processing") {
        setBrief((prev) => prev ?? payload?.brief ?? null);
        setGenerating(true);
        generatingRef.current = true;
        toast.info("Ваша генерация ещё идёт — продолжаем её");
        try {
          const done = await api.infographic.resumeJob(job.id);
          if (cancelled) return;
          if (done.status === "completed" && done.resultUrl) {
            if (payload?.brief) setBrief(payload.brief);
            setTextBaked(payload?.textBaked ?? true);
            setBaseImageUrl(done.resultUrl);
            toast.success("Изображение готово");
          } else {
            toast.error("Прошлая генерация не удалась — попробуйте ещё раз");
          }
        } catch {
          if (!cancelled) toast.error("Не удалось дождаться прошлой генерации");
        } finally {
          if (!cancelled) {
            setGenerating(false);
            generatingRef.current = false;
          }
        }
      } else if (job.status === "completed" && job.resultUrl) {
        // restore the last finished card only onto a fresh, empty page
        setBaseImageUrl((prev) => {
          if (prev) return prev;
          if (payload?.brief) {
            setBrief((b) => b ?? payload.brief);
            setTextBaked(payload.textBaked ?? true);
          }
          return job.resultUrl;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill from the analysis section ("Собрать инфографику" on a card idea):
  // product name, benefits and the suggested headline arrive via sessionStorage.
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(INFOGRAPHICS_PREFILL_KEY);
      if (!raw) return;
      sessionStorage.removeItem(INFOGRAPHICS_PREFILL_KEY);
      const p = JSON.parse(raw) as { name?: string; headline?: string; benefits?: string[] };
      setProduct((s) => ({
        ...s,
        name: p.name || s.name,
        benefits: p.benefits?.length ? p.benefits : s.benefits,
      }));
      if (p.headline) setUserNote(`Заголовок карточки: «${p.headline}»`);
      toast.success("Идея из анализа подставлена — нажмите «Собрать инфографику»");
    } catch {
      // malformed prefill is not worth breaking the page for
    }
  }, []);

  // Changing the type / visual style / reference must actually reach the image
  // prompt — reassemble the existing brief with the current selections (keeps
  // the user's edited text and the per-photo layout plan).
  React.useEffect(() => {
    setBrief((prev) =>
      prev
        ? assembleBrief(
            buildInput(),
            { headline: prev.headline, subheadline: prev.subheadline, blocks: prev.blocks },
            styleProfile ?? undefined,
            prev.layoutPlan,
          )
        : prev,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, style, styleProfile]);

  const handleGenerate = async () => {
    if (!brief || generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    try {
      const r = await api.infographic.generate({
        brief,
        productImage: reference ?? undefined,
        styleReferenceImage: styleReferenceImage ?? undefined,
        productName: product.name || undefined,
        aspectRatio: "3:4",
        variantSeed: variantSeedRef.current,
      });
      variantSeedRef.current += 1; // next generate → next composition
      setBaseImageUrl(r.baseImageUrl);
      setBrief(r.brief);
      setTextBaked(r.textBaked);
      toast.success("Изображение готово");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка генерации");
    } finally {
      setGenerating(false);
      generatingRef.current = false;
    }
  };

  return (
    <AppShell title="Инфографика">
      <div className="grid gap-5 lg:grid-cols-3">
        {/* LEFT — data */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">1. Фото и данные товара</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ImageUploader
              value={reference}
              onChange={setReference}
              label="Загрузите фото товара"
              hint="ИИ распознает товар и предложит данные"
            />
            <Button
              onClick={handleAutofill}
              disabled={autofilling || !reference}
              variant="outline"
              className="w-full"
            >
              {autofilling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanLine className="h-4 w-4" />
              )}
              Заполнить по фото
            </Button>

            <div className="space-y-1.5">
              <Label htmlFor="name">Название товара</Label>
              <Input
                id="name"
                value={product.name}
                onChange={(e) => setProduct((s) => ({ ...s, name: e.target.value }))}
                placeholder="Например: Женский костюм"
              />
            </div>

            <ListField
              id="benefits"
              label="Преимущества (по одному на строку)"
              placeholder={"Не мнётся\nДышащая ткань\nСидит по фигуре"}
              value={product.benefits}
              onChange={(benefits) => setProduct((s) => ({ ...s, benefits }))}
            />

            {/* Secondary fields only nudge the AI's tone — hidden by default to
                keep the form simple; the data path is unchanged when used. */}
            <details className="group rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                Дополнительно (необязательно)
              </summary>
              <div className="mt-3 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="category">Категория</Label>
                  <Input
                    id="category"
                    value={product.category}
                    onChange={(e) => setProduct((s) => ({ ...s, category: e.target.value }))}
                    placeholder="Одежда"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="audience">Целевая аудитория</Label>
                  <Input
                    id="audience"
                    value={product.audience}
                    onChange={(e) => setProduct((s) => ({ ...s, audience: e.target.value }))}
                    placeholder="Женщины 25–40"
                  />
                </div>
                <ListField
                  id="pains"
                  label="Боли клиента (по одной на строку)"
                  placeholder={"Костюмы быстро мнутся\nТрудно подобрать размер"}
                  value={product.pains}
                  onChange={(pains) => setProduct((s) => ({ ...s, pains }))}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="note">Дополнительный комментарий</Label>
                  <Textarea
                    id="note"
                    value={userNote}
                    onChange={(e) => setUserNote(e.target.value)}
                    placeholder="Необязательно"
                    className="min-h-[56px]"
                  />
                </div>
              </div>
            </details>
          </CardContent>
        </Card>

        {/* CENTER — type/style + brief */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">2. Инфографика</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Что нужно сделать?</Label>
                <Select value={type} onValueChange={(v) => setType(v as InfographicType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INFOGRAPHIC_TYPES.map((t) => (
                      <SelectItem key={t.id} value={t.id} disabled={!t.enabled}>
                        {t.label}
                        {!t.enabled ? " (скоро)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Визуальный стиль</Label>
                <Select
                  value={style}
                  onValueChange={(v) => setStyle(v as InfographicStyle)}
                  disabled={!!styleProfile}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INFOGRAPHIC_STYLES.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {styleProfile && (
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Стиль задаёт референс «{styleProfile.name}» — снимите его выбор ниже, чтобы
                    выбрать вручную.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Стиль референса</Label>
              <InfographicReferencePicker
                value={styleProfile}
                onChange={setStyleProfile}
                onReferenceImageChange={setStyleReferenceImage}
              />
            </div>

            <Button onClick={handleBrief} disabled={briefing} variant="gradient" className="w-full">
              {briefing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Собрать инфографику
            </Button>

            {brief ? (
              <>
                <InfographicBriefEditor brief={brief} onChange={handleBriefEdit} />
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  variant="gradient"
                  size="lg"
                  className="w-full"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Сгенерировать изображение · 10 ⚡
                </Button>
              </>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                Заполните данные и нажмите «Собрать инфографику» — ИИ предложит заголовок и блоки.
              </p>
            )}
          </CardContent>
        </Card>

        {/* RIGHT — result */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm">3. Результат</CardTitle>
            {baseImageUrl && (
              <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={generating}>
                <RefreshCw className="h-4 w-4" />
                Перегенерировать основу
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {generating ? (
              <div className="flex aspect-[3/4] items-center justify-center rounded-xl border bg-card/60 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
                Генерируем основу…
              </div>
            ) : baseImageUrl && brief ? (
              <InfographicCanvas baseSrc={baseImageUrl} brief={brief} textBaked={textBaked} />
            ) : (
              <EmptyState
                icon={<ImagePlus className="h-6 w-6" />}
                title="Здесь появится карточка"
                description="Соберите инфографику и нажмите «Сгенерировать изображение»."
              />
            )}

            {baseImageUrl && brief && (
              <InfographicExportPanel baseSrc={baseImageUrl} brief={brief} textBaked={textBaked} />
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
