"use client";
import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { ImageUploader } from "@/components/media/image-uploader";
import { findLogoBounds, TRIM_REASON_LABEL } from "@/core/banners/logo-trim";

/**
 * Загрузка логотипа с автоматической обрезкой до настоящих границ знака.
 *
 * Люди приносят логотип не «как надо», а как скачался: с белым фоном или с
 * клетчатой «прозрачностью», запечённой в пиксели. Без обрезки эта клетка
 * легла бы прямо на креатив. Считается всё в браузере обычным кодом —
 * нейросеть тут не нужна и только добавила бы случайности.
 */
export function LogoUploader({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);

  const handle = async (dataUrl: string | null) => {
    if (!dataUrl) {
      setNote(null);
      onChange(null);
      return;
    }
    setBusy(true);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("bad image"));
        el.src = dataUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        onChange(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const box = findLogoBounds({ data: data.data, width: canvas.width, height: canvas.height });

      if (!box.trimmed) {
        setNote(null);
        onChange(dataUrl);
        return;
      }
      const out = document.createElement("canvas");
      out.width = box.width;
      out.height = box.height;
      out
        .getContext("2d")
        ?.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
      setNote(`${TRIM_REASON_LABEL[box.reason]} · ${box.width} × ${box.height}`);
      onChange(out.toDataURL("image/png"));
    } catch {
      // не смогли разобрать — берём как есть, это не повод ронять шаг
      onChange(dataUrl);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <ImageUploader
        value={value}
        onChange={handle}
        label="Загрузите логотип"
        hint="Лишний фон обрежем сами — и белый, и клетчатый"
      />
      {busy ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Ищем границы знака…
        </p>
      ) : note ? (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" />
          {note}
        </p>
      ) : null}
    </div>
  );
}
