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

  const extract = async () => {
    if (!refImage) {
      toast.error("Загрузите изображение референса.");
      return;
    }
    setExtracting(true);
    try {
      const profile = await api.infographic.extractStyle(refImage);
      onChange(profile);
      onReferenceImageChange?.(refImage);
      toast.success("Стиль референса извлечён");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось извлечь стиль");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Tabs defaultValue="library">
      <TabsList className="mb-3">
        <TabsTrigger value="library">Библиотека</TabsTrigger>
        <TabsTrigger value="upload">Свой референс</TabsTrigger>
      </TabsList>

      <TabsContent value="library" className="mt-0">
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
                  className="relative flex h-16 items-end p-2"
                  style={{
                    background: `linear-gradient(135deg, ${item.preview.from}, ${item.preview.to})`,
                  }}
                >
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ background: item.preview.accent }}
                  />
                  {active && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-0.5 text-primary-foreground">
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
          onChange={setRefImage}
          label="Загрузите референс-инфографику"
          hint="Например, удачная карточка конкурента — возьмём только её стиль. Работает точнее вместе с фото вашего товара"
        />
        <Button
          onClick={extract}
          disabled={extracting || !refImage}
          variant="outline"
          className="w-full"
        >
          {extracting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          Извлечь стиль референса
        </Button>
        {value?.source === "reference" && (
          <p className="text-xs text-emerald-600">Стиль «{value.name}» применён.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
