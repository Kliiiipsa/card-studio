"use client";
import * as React from "react";
import { Clapperboard, Download, Loader2, Sparkles, TriangleAlert, Dna } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useProfileStore } from "@/store/profile-store";
import { ImageUploader } from "@/components/media/image-uploader";
import { EmptyState } from "@/components/project/empty-state";
import { api } from "@/lib/client-api";
import { reachGoal, GOALS } from "@/components/analytics/yandex-metrica";
import { PRICES, SPARK } from "@/core/billing/prices";
import { VIDEO_PRESETS, DEFAULT_VIDEO_PRESET_ID, VIDEO_DURATION_SEC } from "@/core/video/presets";

/** Пользователю доступен один проверенный сценарий — «Оживить фото». */
const PRESET = VIDEO_PRESETS[0];

/** Этапы «съёмки» — по прошедшему времени (сек). Реального прогресса fal не
 * отдаёт, поэтому бар — честная асимптота к ~93%, добивается при завершении. */
const STAGES: { at: number; text: string }[] = [
  { at: 0, text: "Отправляем фото на съёмочную площадку…" },
  { at: 6, text: "Модель изучает товар и планирует движение…" },
  { at: 16, text: "Выставляем свет и траекторию камеры…" },
  { at: 30, text: "Рендерим кадры — 120 кадров в 1080p…" },
  { at: 60, text: "Сводим плавность движения…" },
  { at: 95, text: "Финальная полировка ролика…" },
];

function VideoLoading({ image }: { image: string | null }) {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(t);
  }, []);

  // асимптотический прогресс: быстро в начале, плавно замирает у ~93%
  const progress = Math.min(93, Math.round(100 * (1 - Math.exp(-elapsed / 45))));
  const stage = [...STAGES].reverse().find((s) => elapsed >= s.at) ?? STAGES[0];
  const mm = Math.floor(elapsed / 60);
  const ss = String(Math.floor(elapsed % 60)).padStart(2, "0");

  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-xl border bg-muted">
      {/* «съёмка»: фото товара с медленным наездом + бегущий скан-луч */}
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="animate-kenburns h-full w-full object-cover opacity-90"
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-primary/15 via-muted to-primary/10" />
      )}
      <div
        className="animate-scanline pointer-events-none absolute left-0 h-[10%] w-full"
        style={{
          background:
            "linear-gradient(to bottom, transparent, hsl(var(--primary) / 0.25), transparent)",
        }}
      />

      {/* нижняя панель с этапом и прогрессом */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/45 to-transparent p-4 pt-12 text-white">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <span key={stage.text} className="leading-5">
            {stage.text}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-blue-400 transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-white/80">
          <span>{progress}%</span>
          <span>
            {mm}:{ss} · обычно 1–3 минуты
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-white/70">
          Можно закрыть страницу — готовый ролик появится в «Мои карточки».
        </p>
      </div>
    </div>
  );
}

export default function VideoPage() {
  const [image, setImage] = React.useState<string | null>(null);
  const [hasPerson, setHasPerson] = React.useState(false);
  const [hasText, setHasText] = React.useState(false);
  const [productName, setProductName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [videoUrl, setVideoUrl] = React.useState<string | null>(null);
  const [downloading, setDownloading] = React.useState(false);
  // админский тест новых моделей/промптов; обычным клиентам блок не показывается
  const role = useProfileStore((s) => s.role);
  const [customPrompt, setCustomPrompt] = React.useState("");
  const [falModel, setFalModel] = React.useState("");

  // Вкладку закрывали во время генерации? Подхватываем незавершённую задачу.
  React.useEffect(() => {
    let cancelled = false;
    api.video
      .latestJob()
      .then(async (job) => {
        if (cancelled || !job || job.status !== "processing") return;
        setBusy(true);
        try {
          const done = await api.video.resumeJob(job.id);
          if (cancelled) return;
          if (done.status === "completed" && done.resultUrl) {
            setVideoUrl(done.resultUrl);
            toast.success("Видео готово!");
          } else if (done.status === "failed") {
            toast.error(done.error ?? "Видео не получилось. Гены не списаны.");
          }
        } catch {
          /* поллинг оборвался — пользователь может сгенерировать заново */
        } finally {
          if (!cancelled) setBusy(false);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Фото с человеком → Seedance может свободно менять позу и даже «переодевать»
  // модель. Проверяем бесплатно при загрузке и честно предупреждаем ДО списания.
  const onImageChange = (dataUrl: string | null) => {
    setImage(dataUrl);
    setHasPerson(false);
    setHasText(false);
    if (!dataUrl) return;
    fetch("/api/ai/video/photo-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productImage: dataUrl }),
    })
      .then((r) => r.json())
      .then((d: { hasPerson?: boolean; hasText?: boolean }) => {
        setHasPerson(d.hasPerson === true);
        setHasText(d.hasText === true);
      })
      .catch(() => undefined);
  };

  const generate = async () => {
    if (!image) {
      toast.error("Загрузите фото товара.");
      return;
    }
    if (!productName.trim()) {
      toast.error("Укажите название товара — оно помогает модели понять, что двигать.");
      return;
    }
    setBusy(true);
    setVideoUrl(null);
    try {
      const { videoUrl } = await api.video.generate({
        productName: productName.trim(),
        presetId: DEFAULT_VIDEO_PRESET_ID,
        productImage: image,
        customPrompt: role === "admin" ? customPrompt.trim() || undefined : undefined,
        falModel: role === "admin" ? falModel.trim() || undefined : undefined,
      });
      setVideoUrl(videoUrl);
      reachGoal(GOALS.generation, { kind: "video" });
      toast.success("Видео готово! Оно также сохранено в «Мои карточки».");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сгенерировать видео.");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!videoUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(videoUrl)}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "kartogen-video.mp4";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Не удалось скачать — попробуйте ещё раз.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AppShell title="Видео товара">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* -------- form -------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">1. Фото товара</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImageUploader
                value={image}
                onChange={onImageChange}
                label="Загрузите фото товара"
                hint="Лучше всего работает чистое фото на светлом фоне · PNG, JPG, WEBP"
              />
              {hasText && (
                <div className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs leading-5">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Похоже, это готовая карточка с надписями
                    </p>
                    <p className="mt-0.5">
                      Плашки и заголовки исчезнут в первые секунды видео. Загрузите чистое фото
                      товара — без текста поверх.
                    </p>
                  </div>
                </div>
              )}
              {hasPerson && (
                <div className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs leading-5">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="text-muted-foreground">
                    <p className="font-medium text-foreground">На фото — человек</p>
                    <p className="mt-0.5">
                      Видео-модель может сама менять позу, поворачивать человека и додумывать
                      невидимые ракурсы — результат непредсказуем. Для стабильного ролика
                      рекомендуем предметное фото товара без модели.
                    </p>
                  </div>
                </div>
              )}
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Название товара, например: женское пальто из шерсти"
                maxLength={160}
                aria-label="Название товара"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">2. Оживление</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs leading-5 text-muted-foreground">{PRESET.description}.</p>

              {role === "admin" && (
                <details className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                  <summary className="cursor-pointer list-none text-xs font-medium text-amber-600 dark:text-amber-400">
                    Тест моделей и промптов (видно только администратору)
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="vprompt" className="text-xs">
                        Свой промпт (английский, уйдёт в модель как есть — без пресета и guardrails)
                      </Label>
                      <Textarea
                        id="vprompt"
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="Например: slow cinematic dolly-in, the jacket sways gently…"
                        className="min-h-[80px] font-mono text-xs"
                        maxLength={2500}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="vmodel" className="text-xs">
                        Модель fal (пусто — текущая Kling 2.5 Turbo Pro)
                      </Label>
                      <Input
                        id="vmodel"
                        value={falModel}
                        onChange={(e) => setFalModel(e.target.value)}
                        placeholder="fal-ai/kling-video/v2.5-turbo/pro/image-to-video"
                        className="font-mono text-xs"
                        maxLength={120}
                      />
                    </div>
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      Незнакомая модель пойдёт по общей схеме входа (prompt + image_url + duration) —
                      экзотические параметры могут не подойти, смотрите ошибку в журнале генераций.
                      Промпт и модель сохраняются в админском журнале.
                    </p>
                  </div>
                </details>
              )}

              <Button variant="gradient" className="w-full" onClick={generate} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {PRESET.label}
                <span className="ml-1 inline-flex items-center gap-0.5 text-xs opacity-90">
                  · {PRICES.video} <Dna className="h-3 w-3" />
                </span>
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                Ролик {VIDEO_DURATION_SEC} секунд, 1080p; формат кадра повторяет формат вашего фото
                (для карточки маркетплейса — 3:4). Генерация занимает 1–3 минуты. {SPARK} Гены списываются
                только за готовое видео — за ошибки вы не платите.
              </p>
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                <p className="font-medium text-foreground">Как получить лучший результат</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Лучше всего работает чистое фото товара крупным планом (предметная съёмка).</li>
                  <li>
                    На фото с моделью движение получается свободнее: человек может повернуться или
                    сменить позу.
                  </li>
                  <li>Не загружайте готовую инфографику — плашки и надписи с неё исчезнут.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* -------- result -------- */}
        <Card className="h-fit lg:sticky lg:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Результат</CardTitle>
          </CardHeader>
          <CardContent>
            {busy ? (
              <VideoLoading image={image} />
            ) : videoUrl ? (
              <div className="space-y-3">
                <video
                  key={videoUrl}
                  src={videoUrl}
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="mx-auto max-h-[520px] w-auto max-w-full rounded-xl border bg-black"
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={download} disabled={downloading}>
                    {downloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Скачать MP4
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Видео сохранено в «Мои карточки» — можно скачать в любой момент.
                </p>
              </div>
            ) : (
              <EmptyState
                icon={<Clapperboard className="h-6 w-6" />}
                title="Здесь появится ваш ролик"
                description="Загрузите фото — и получите живое видео товара для карточки маркетплейса."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
