"use client";
import * as React from "react";
import { UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateImageFile } from "@/lib/image-validation";
import { compressImage } from "@/lib/image-compress";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";

export function ImageUploader({
  value,
  onChange,
  label = "Загрузите фото товара или текущую карточку",
  hint = "PNG, JPG, WEBP · до 8 МБ",
  className,
}: {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  hint?: string;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    try {
      validateImageFile(file);
      // Canvas re-encode keeps requests small AND guarantees the original file's
      // metadata (EXIF: geolocation, camera serials) never leaves the browser —
      // providers must only ever see anonymous pixels. No raw-file fallback.
      const dataUrl = await compressImage(file);
      onChange(dataUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить файл.");
    }
  };

  if (value) {
    return (
      <div
        className={cn("group relative overflow-hidden rounded-xl border bg-muted/40", className)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt="Загруженное изображение"
          className="mx-auto max-h-[340px] w-auto max-w-full object-contain"
        />
        <div className="absolute right-2 top-2 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
            Заменить
          </Button>
          <Button
            size="icon"
            variant="destructive"
            className="h-8 w-8"
            onClick={() => onChange(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-accent/40",
        className,
      )}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <UploadCloud className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
