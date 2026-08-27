"use client";
import * as React from "react";
import { Download, Loader2, Package, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EXPORT_PRESETS, type ExportFormat } from "@/core/domain/export-presets";
import {
  exportCard,
  exportCardNatural,
  exportAllVariants,
  type ExportVariant,
} from "@/core/rendering/export";
import type { CardOverlay } from "@/core/rendering/types";
import { toast } from "@/components/ui/toaster";

/**
 * Export panel. Works for a single selected image (`src`) and, when `variants`
 * are provided, can download every generated variant across every size.
 * If `overlay` is given (e.g. a Russian headline), the text is composited on
 * top of the image via the canvas renderer.
 */
export function ExportPanel({
  src,
  variants,
  overlay,
  item = "card",
  allowOriginal = false,
}: {
  src?: string | null;
  variants?: ExportVariant[];
  overlay?: CardOverlay;
  /** контекст названия: «карточка» для маркетплейса, «фото» для обычной генерации */
  item?: "card" | "photo";
  /** показать вариант «Как у исходного» (родное разрешение, без кропа) */
  allowOriginal?: boolean;
}) {
  // склонения под контекст: «Скачать фото» / «Фото скачано» vs карточка
  const noun = item === "photo"
    ? { acc: "фото", done: "Фото скачано" }
    : { acc: "карточку", done: "Карточка скачана" };
  const ORIGINAL = "__original";
  const [presetId, setPresetId] = React.useState(
    allowOriginal ? ORIGINAL : EXPORT_PRESETS[0].id,
  );
  const [format, setFormat] = React.useState<ExportFormat>("png");
  const [withText, setWithText] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const preset = EXPORT_PRESETS.find((p) => p.id === presetId) ?? EXPORT_PRESETS[0];
  const hasOverlay = !!(overlay?.headline || overlay?.benefits?.length);
  const activeOverlay = withText && hasOverlay ? overlay : undefined;
  const allVariants: ExportVariant[] = variants?.length
    ? variants
    : src
      ? [{ id: "current", url: src }]
      : [];

  const single = async () => {
    if (!src) return;
    setBusy(true);
    try {
      if (presetId === ORIGINAL) {
        // родное разрешение сгенерированного фото, без кропа и без наложения текста
        await exportCardNatural(src, format);
      } else {
        await exportCard(src, preset, format, { overlay: activeOverlay });
      }
      toast.success(noun.done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setBusy(false);
    }
  };

  const all = async () => {
    if (!allVariants.length) return;
    setBusy(true);
    try {
      await exportAllVariants(allVariants, EXPORT_PRESETS, format, { overlay: activeOverlay });
      toast.success("Все варианты скачаны");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Размер</Label>
          <Select value={presetId} onValueChange={setPresetId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowOriginal && (
                <SelectItem value={ORIGINAL}>Как у исходного</SelectItem>
              )}
              {EXPORT_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label} · {p.ratio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Формат</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="png">PNG</SelectItem>
              <SelectItem value="jpg">JPG</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasOverlay && (
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <Label className="flex items-center gap-2 text-xs">
            <Type className="h-3.5 w-3.5 text-primary" />
            Наложить заголовок на карточку
          </Label>
          <Switch checked={withText} onCheckedChange={setWithText} />
        </div>
      )}

      <Button onClick={single} disabled={!src || busy} className="w-full" variant="gradient">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Скачать {noun.acc}
      </Button>
      <Button
        onClick={all}
        disabled={!allVariants.length || busy}
        className="w-full"
        variant="outline"
      >
        <Package className="h-4 w-4" />
        Скачать все варианты
      </Button>
    </div>
  );
}
