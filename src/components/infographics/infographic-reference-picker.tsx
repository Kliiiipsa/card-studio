"use client";
import * as React from "react";
import { Loader2, Check, Wand2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/media/image-uploader";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { api } from "@/lib/client-api";
import { STYLE_LIBRARY, getLibraryStyle } from "@/core/infographics/style-library";
import type { StyleProfile } from "@/core/infographics/types";

/**
 * Pick the STYLE to transfer onto the user's product: a ready library reference
 * or an uploaded reference image (analyzed by AI into a StyleProfile).
 */
export function InfographicReferencePicker({
  value,
  onChange,
  onReferenceImageChange,
}: {
  value: StyleProfile | null;
  onChange: (profile: StyleProfile | null) => void;
  /** the raw reference image (data URL) used as the i2i style anchor */
  onReferenceImageChange?: (image: string | null) => void;
}) {
  const [refImage, setRefImage] = React.useState<string | null>(null);
  const [extracting, setExtracting] = React.useState(false);

  const extract = React.useCallback(
    async (image: string) => {
      setExtracting(true);
      try {
        const profile = await api.infographic.extractStyle(image);
        onChange(profile);
        onReferenceImageChange?.(image);
        toast.success("Стиль референса применён");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось извлечь стиль");
      } finally {
        setExtracting(false);
      }
    },
    [onChange, onReferenceImageChange],
  );

  // Uploading a reference is the intent — apply it right away. Users expected
  // one step and generated with "Авто" while the reference sat unused.
  const handleUpload = (image: string | null) => {
    setRefImage(image);
    if (image) void extract(image);
    else {
      onChange(null);
      onReferenceImageChange?.(null);
    }
  };

  return (
    <Tabs defaultValue="library">
      <TabsList className="mb-3">
        <TabsTrigger value="library">Библиотека</TabsTrigger>
        <TabsTrigger value="upload">Свой референс</TabsTrigger>
      </TabsList>

      <TabsContent value="library" className="mt-0">
        <p className="mb-2 text-[11px] leading-4 text-muted-foreground">
          На карточках — реальные примеры карточек в каждом стиле.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {STYLE_LIBRARY.map((item) => {
            const active = value?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                // clicking the active card deselects it — the manual "Визуальный
                // стиль" select takes over
                onClick={() => {
                  onChange(active ? null : getLibraryStyle(item.id));
                  onReferenceImageChange?.(null);
                }}
                className={cn(
                  "overflow-hidden rounded-lg border text-left transition-all",
                  active ? "ring-2 ring-primary ring-offset-1" : "hover:border-primary/40",
                )}
              >
                <div
                  className="relative h-28 overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${item.preview.from}, ${item.preview.to})`,
                  }}
                >
                  {/* реальный пример-результат в этом стиле — «примерно так будет» */}
                  {item.example && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.example}
                      alt={`Пример в стиле «${item.name}»`}
                      loading="lazy"
                      className="h-full w-full object-cover object-top"
                    />
                  )}
                  {active && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-0.5 text-primary-foreground shadow">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-xs font-medium leading-tight">{item.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </TabsContent>

      <TabsContent value="upload" className="mt-0 space-y-3">
        <ImageUploader
          value={refImage}
          onChange={handleUpload}
          label="Загрузите референс-инфографику"
          hint="Например, удачная карточка конкурента — возьмём только её стиль. Работает точнее вместе с фото вашего товара"
        />
        {extracting ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Изучаем стиль референса…
          </p>
        ) : value?.source === "reference" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-emerald-600">Стиль «{value.name}» применён.</p>
            <Button
              onClick={() => refImage && extract(refImage)}
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
            >
              <Wand2 className="mr-1 h-3.5 w-3.5" />
              Извлечь заново
            </Button>
          </div>
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
