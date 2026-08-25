"use client";
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Download, Loader2, Package, XCircle, Dna } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/media/image-uploader";
import { ListField } from "@/components/generator/product-form";
import { toast } from "@/components/ui/toaster";
import { STYLE_LIBRARY } from "@/core/infographics/style-library";
import { PRICES } from "@/core/billing/prices";
import { useProfileStore } from "@/store/profile-store";
import { cn } from "@/lib/utils";

type Step = {
  key: string;
  label: string;
  status: "pending" | "processing" | "done" | "failed";
  url?: string;
  seo?: { title: string; description: string; keywords: string[] };
};

export default function TurnkeyPage() {
  const [image, setImage] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [benefits, setBenefits] = React.useState<string[]>([]);
  const [pains, setPains] = React.useState<string[]>([]);
  const [materials, setMaterials] = React.useState<string[]>([]);
  const [sizes, setSizes] = React.useState<string[]>([]);
  const [styleId, setStyleId] = React.useState(STYLE_LIBRARY[0].id);

  const [jobId, setJobId] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<Step[] | null>(null);
  const [finished, setFinished] = React.useState(false);
  const [starting, setStarting] = React.useState(false);

  // poll the parent job while it runs
  React.useEffect(() => {
    if (!jobId || finished) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = (await res.json()) as {
          job?: { status: string; payload?: { steps?: Step[] }; error?: string | null };
        };
        const job = data.job;
        if (!job) return;
        if (job.payload?.steps) setSteps(job.payload.steps);
        if (job.status !== "processing") {
          setFinished(true);
          void useProfileStore.getState().fetchMe();
          if (job.status === "completed") toast.success("Комплект готов!");
          else toast.error(job.error ?? "Не все изображения удалось сгенерировать");
        }
      } catch {
        // transient poll error — keep trying
      }
    }, 3000);
    return () => clearInterval(t);
  }, [jobId, finished]);

  const start = async () => {
    if (!image) return void toast.error("Загрузите фото товара.");
    if (!name.trim()) return void toast.error("Укажите название товара.");
    if (!benefits.length) return void toast.error("Добавьте преимущества (по одному на строку).");
    setStarting(true);
    try {
      const res = await fetch("/api/ai/turnkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: name.trim(),
          category: category.trim() || undefined,
          benefits,
          pains,
          materials,
          sizes,
          styleId,
          productImage: image,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) throw new Error(data.error ?? "Не удалось запустить генерацию");
      setJobId(data.jobId);
      setFinished(false);
      toast.success("Собираем комплект — это займёт 7–12 минут. Вкладку можно закрывать.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось запустить генерацию");
    } finally {
      setStarting(false);
    }
  };

  const doneUrls = (steps ?? []).filter((s) => s.status === "done" && s.url);

  return (
    <AppShell title="Карточка под ключ">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1fr_1.2fr]">
        {/* FORM */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 text-primary" />
              Один клик — полная фотоворонка
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Загрузите одно фото и заполните данные — студия соберёт комплект: SEO-тексты для
              карточки, инфографика (преимущества, боль→решение, состав), размерная сетка и три
              фото (сбоку, сзади, lifestyle). Списание — только за то, что удалось сгенерировать.
            </p>
            <ImageUploader
              value={image}
              onChange={setImage}
              label="Фото товара (обязательно)"
              hint="Лучше всего — фронтальное фото на нейтральном фоне"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tname">Название товара</Label>
                <Input id="tname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Худи оверсайз" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tcat">Категория</Label>
                <Input id="tcat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Одежда" />
              </div>
            </div>
            <ListField
              id="tben"
              label="Преимущества (по одному на строку)"
              placeholder={"Плотный хлопок 380 г\nНе скатывается\nУнисекс"}
              value={benefits}
              onChange={setBenefits}
            />
            <ListField
              id="tpain"
              label="Боли клиента (для карточки «боль → решение»)"
              placeholder={"Худи быстро теряют вид\nСложно подобрать размер"}
              value={pains}
              onChange={setPains}
            />
            <ListField
              id="tmat"
              label="Состав и материалы"
              placeholder={"80% хлопок, 20% полиэстер\nФурнитура YKK"}
              value={materials}
              onChange={setMaterials}
            />
            <ListField
              id="tsize"
              label="Размерная сетка (по строке на размер; пусто — карточка пропускается)"
              placeholder={"S — грудь 96, длина 66\nM — грудь 102, длина 68"}
              value={sizes}
              onChange={setSizes}
            />
            <div className="space-y-1.5">
              <Label className="text-xs">Стиль комплекта</Label>
              <div className="grid grid-cols-2 gap-2">
                {STYLE_LIBRARY.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyleId(s.id)}
                    className={cn(
                      "rounded-lg border p-2.5 text-left transition-all",
                      styleId === s.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:border-primary/40",
                    )}
                  >
                    <span
                      className="mb-1.5 block h-2 w-8 rounded-full"
                      style={{ background: `linear-gradient(90deg, ${s.preview.from}, ${s.preview.accent})` }}
                    />
                    <span className="text-xs font-medium">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <Button
              variant="gradient"
              className="w-full"
              onClick={start}
              disabled={starting || (!!jobId && !finished)}
            >
              {starting || (!!jobId && !finished) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Dna className="h-4 w-4" />
              )}
              Собрать комплект · {PRICES.turnkey} 🧬 (7 изображений + SEO)
            </Button>
          </CardContent>
        </Card>

        {/* PROGRESS + RESULTS */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Ход сборки</CardTitle>
            </CardHeader>
            <CardContent>
              {!steps ? (
                <p className="text-sm text-muted-foreground">
                  Заполните форму слева и нажмите «Собрать комплект». Генерация идёт на сервере —
                  можно закрыть вкладку и вернуться позже.
                </p>
              ) : (
                <ul className="space-y-2">
                  {steps.map((s) => (
                    <li key={s.key} className="flex items-center gap-2.5 text-sm">
                      {s.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : s.status === "failed" ? (
                        <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                      ) : s.status === "processing" ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                      )}
                      <span className={s.status === "failed" ? "text-muted-foreground line-through" : ""}>
                        {s.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {(() => {
            const seo = (steps ?? []).find((s) => s.key === "seo" && s.seo)?.seo;
            if (!seo) return null;
            const copy = (text: string, what: string) =>
              navigator.clipboard
                .writeText(text)
                .then(() => toast.success(`${what} — скопировано`))
                .catch(() => toast.error("Не удалось скопировать"));
            return (
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
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-card/60 p-2.5 text-xs leading-5">
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
            );
          })()}

          {doneUrls.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Готовые изображения</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {doneUrls.map((s) => (
                    <div key={s.key} className="overflow-hidden rounded-lg border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.url} alt={s.label} className="aspect-[3/4] w-full object-cover" />
                      <p className="truncate p-1.5 text-[11px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
                {finished && (
                  <Button asChild variant="outline" className="mt-3 w-full">
                    <Link href="/cards">
                      <Download className="h-4 w-4" />
                      Скачать из «Моих карточек»
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
