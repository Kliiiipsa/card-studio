"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Wand2, ScanSearch, Lightbulb, Loader2, Sparkles, ImageOff } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ProductForm } from "@/components/generator/product-form";
import { ImageUploader } from "@/components/media/image-uploader";
import { ImagePreview } from "@/components/media/image-preview";
import { EmptyState } from "@/components/project/empty-state";
import { useProjectStore } from "@/store/project-store";
import { api } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { uid, formatRelative } from "@/lib/utils";
import { CARD_TYPE_MAP } from "@/core/domain/card-types";
import type { CardIdea } from "@/core/domain/types";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { current, generations, openProject, updateCurrent, updateProduct, addUpload } =
    useProjectStore();
  const [ideas, setIdeas] = React.useState<CardIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = React.useState(false);

  React.useEffect(() => {
    openProject(id).then((p) => {
      if (!p) router.replace("/dashboard");
    });
  }, [id, openProject, router]);

  if (!current) {
    return (
      <AppShell title="Проект">
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </AppShell>
    );
  }

  const generateIdeas = async () => {
    setIdeasLoading(true);
    try {
      const { ideas } = await api.ideas(current.product);
      setIdeas(ideas);
      toast.success("Идеи готовы");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось получить идеи");
    } finally {
      setIdeasLoading(false);
    }
  };

  return (
    <AppShell title={current.title}>
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* LEFT: product data + uploads */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Название проекта</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                value={current.title}
                onChange={(e) => updateCurrent({ title: e.target.value })}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Данные товара</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductForm product={current.product} onChange={(p) => updateProduct(p)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Фото товара</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ImageUploader
                onChange={(dataUrl) =>
                  dataUrl && addUpload({ id: uid("up"), dataUrl, createdAt: Date.now() })
                }
              />
              {current.uploads.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {current.uploads.map((u) => (
                    <ImagePreview key={u.id} src={u.dataUrl} ratio="aspect-square" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: actions, ideas, history */}
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Button asChild variant="gradient" className="h-auto py-4">
              <Link href="/generator" className="flex-col gap-1">
                <Wand2 className="h-5 w-5" />
                <span>Создать карточку</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4">
              <Link href="/analysis" className="flex-col gap-1">
                <ScanSearch className="h-5 w-5" />
                <span>Анализ карточки</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-1 py-4"
              onClick={generateIdeas}
              disabled={ideasLoading}
            >
              {ideasLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Lightbulb className="h-5 w-5" />
              )}
              <span>Сгенерировать идеи</span>
            </Button>
          </div>

          {/* Ideas */}
          {ideas.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Идеи карточек
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {ideas.map((idea, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <Badge variant="secondary" className="text-[10px]">
                      {CARD_TYPE_MAP[idea.cardType as keyof typeof CARD_TYPE_MAP]?.title ??
                        idea.cardType}
                    </Badge>
                    <div className="mt-1.5 text-sm font-medium">{idea.title}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{idea.angle}</p>
                    {idea.headline && (
                      <p className="mt-1.5 text-xs italic text-foreground/70">«{idea.headline}»</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">История генераций</CardTitle>
            </CardHeader>
            <CardContent>
              {generations.length === 0 ? (
                <EmptyState
                  icon={<ImageOff className="h-6 w-6" />}
                  title="Ещё нет генераций"
                  description="Создайте первую карточку в генераторе."
                  action={
                    <Button asChild variant="gradient">
                      <Link href="/generator">
                        <Wand2 className="h-4 w-4" />В генератор
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-4">
                  {generations.map((g) => (
                    <div key={g.id}>
                      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-[10px]">
                          {CARD_TYPE_MAP[g.params.cardType]?.title}
                        </Badge>
                        <span>{g.mode === "image-to-image" ? "по фото" : "по промпту"}</span>
                        {g.score && <span>· балл {g.score.total}</span>}
                        <span className="ml-auto">{formatRelative(g.createdAt)}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {g.images.map((img) => (
                          <ImagePreview key={img.id} src={img.dataUrl} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
