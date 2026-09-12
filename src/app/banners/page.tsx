"use client";
import * as React from "react";
import Link from "next/link";
import {
  Loader2,
  Sparkles,
  Download,
  Images,
  Megaphone,
  Lock,
  Plus,
  X,
  Shuffle,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/media/image-uploader";
import { EmptyState } from "@/components/project/empty-state";
import { toast } from "@/components/ui/toaster";
import { api } from "@/lib/client-api";
import { reachGoal, GOALS } from "@/components/analytics/yandex-metrica";
import { PRICES, SPARK, gens } from "@/core/billing/prices";
import { useProfileStore } from "@/store/profile-store";
import { CREATIVE_TYPES, getCreativeType, getFormat } from "@/core/banners/formats";
import {
  compositionsFor,
  orientationOf,
  COMPOSITION_LABELS,
} from "@/core/banners/composition-variants";
import {
  CTA_PRESETS,
  LOOK_LABELS,
  LOOK_HINTS,
  OPTIONAL_FIELDS,
  type BannerLook,
  type CreativeTypeId,
  type OptionalFieldId,
} from "@/core/banners/types";
import { BannerPreview, type BannerPreviewHandle } from "@/components/banners/banner-preview";
import { LogoUploader } from "@/components/banners/logo-uploader";

type HeadlineOption = { headline: string; subheadline?: string };
type Result = { imageUrl: string; width: number; height: number; jobId?: string };

/** Плашка выбора — одинаковая для типа, формата и оформления. */
function Chip({
  active,
  onClick,
  children,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card hover:bg-accent"
      }`}
    >
      <span className="block font-medium">{children}</span>
      {sub ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{sub}</span> : null}
    </button>
  );
}

/** Шаг появляется, только когда до него дошли — чтобы экран не пугал с порога. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          {n}. {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

export default function BannersPage() {
  const { banners: allowed, loaded } = useProfileStore();

  // шаг 1 — фото
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [skipPhoto, setSkipPhoto] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [myCards, setMyCards] = React.useState<{ id: string; url: string }[] | null>(null);

  // шаг 2 — свободное описание задачи
  const [description, setDescription] = React.useState("");
  const [planning, setPlanning] = React.useState(false);
  const [planned, setPlanned] = React.useState(false);
  /** текстовая модель не ответила — черновика нет, поля заполняются руками */
  const [degraded, setDegraded] = React.useState(false);

  // разобранная задача
  const [creativeType, setCreativeType] = React.useState<CreativeTypeId>("banner");
  const [format, setFormat] = React.useState<string>("square");
  const [subject, setSubject] = React.useState("");
  const [fields, setFields] = React.useState<OptionalFieldId[]>([]);

  // тексты
  const [options, setOptions] = React.useState<HeadlineOption[] | null>(null);
  const [headline, setHeadline] = React.useState("");
  const [subheadline, setSubheadline] = React.useState("");
  const [suggesting, setSuggesting] = React.useState(false);
  const [benefit, setBenefit] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [oldPrice, setOldPrice] = React.useState("");
  const [cta, setCta] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [site, setSite] = React.useState("");
  const [logo, setLogo] = React.useState<string | null>(null);
  const [logoCorner, setLogoCorner] = React.useState<"top-left" | "top-right">("top-left");

  const [look, setLook] = React.useState<BannerLook>("adaptive");
  /** пустая строка = композицию выбирает сид по предмету рекламы */
  const [compositionId, setCompositionId] = React.useState("");
  /** сдвиг связки вариантов; растёт по кнопке «Другая композиция» */
  const [variantSeed, setVariantSeed] = React.useState(0);

  const [generating, setGenerating] = React.useState(false);
  const generatingRef = React.useRef(false);
  const [result, setResult] = React.useState<Result | null>(null);
  const previewRef = React.useRef<BannerPreviewHandle>(null);

  const type = getCreativeType(creativeType);
  const fmt = getFormat(creativeType, format);
  const priceTag = PRICES.banner;

  const has = (f: OptionalFieldId) => fields.includes(f);
  const toggleField = (f: OptionalFieldId) =>
    setFields((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  // Шаги открываются по мере заполнения. Фото НЕ обязательно: креатив
  // прекрасно рисуется по описанию, поэтому есть явный выход «без фото».
  const step1done = Boolean(photo) || skipPhoto;
  const step2done = step1done && planned && subject.trim().length > 0;
  const step3done = step2done;
  const step4done = step3done && headline.trim().length > 0;

  const logoObj = React.useMemo(
    () => (has("logo") && logo ? { image: logo, corner: logoCorner } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logo, logoCorner, fields],
  );

  const openPicker = async () => {
    setPickerOpen((v) => !v);
    if (myCards) return;
    try {
      const res = await fetch("/api/cards");
      const data = (await res.json()) as { cards?: { id: string; url: string }[] };
      setMyCards((data.cards ?? []).slice(0, 12));
    } catch {
      setMyCards([]);
    }
  };

  /** Берём карточку через свой прокси как data URL — не зависим от прав на S3. */
  const pickCard = async (url: string) => {
    try {
      const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("read failed"));
        fr.readAsDataURL(blob);
      });
      setPhoto(dataUrl);
      setPickerOpen(false);
      toast.success("Карточка подставлена");
    } catch {
      toast.error("Не удалось взять карточку — загрузите файл");
    }
  };

  const handlePlan = async () => {
    if (description.trim().length < 3) {
      toast.error("Опишите задачу хотя бы парой слов.");
      return;
    }
    setPlanning(true);
    try {
      const p = await api.banner.plan(description.trim());
      setCreativeType(p.creativeType);
      setFormat(getCreativeType(p.creativeType).formats[0].id);
      setSubject(p.subject);
      if (p.benefit) setBenefit(p.benefit);
      const known = p.fields.filter((f): f is OptionalFieldId =>
        OPTIONAL_FIELDS.some((o) => o.id === f),
      );
      setFields(known);
      setOptions(p.degraded ? null : p.headlines);
      if (p.headlines[0] && !p.degraded) {
        setHeadline(p.headlines[0].headline);
        setSubheadline(p.headlines[0].subheadline ?? "");
      }
      setDegraded(Boolean(p.degraded));
      if (p.degraded) {
        toast.info("ИИ сейчас не отвечает — поля заполните сами, шаги открыты");
      }
      setPlanned(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось разобрать задачу");
    } finally {
      setPlanning(false);
    }
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const r = await api.banner.headlines({
        subject: subject.trim(),
        benefit: benefit.trim() || undefined,
        price: price.trim() || undefined,
        oldPrice: oldPrice.trim() || undefined,
      });
      setOptions(r.options);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось предложить заголовок");
    } finally {
      setSuggesting(false);
    }
  };

  const handleGenerate = async (seedOverride?: number) => {
    if (generatingRef.current) return;
    if (!subject.trim() || !headline.trim()) {
      toast.error("Нужны предмет рекламы и заголовок.");
      return;
    }
    const seed = seedOverride ?? variantSeed;
    generatingRef.current = true;
    setGenerating(true);
    try {
      const r = await api.banner.generate({
        variantSeed: seed,
        compositionId: compositionId || undefined,
        creativeType,
        format,
        look,
        subject: subject.trim(),
        headline: headline.trim(),
        subheadline: subheadline.trim() || undefined,
        benefit: has("benefit") ? benefit.trim() || undefined : undefined,
        price: has("price") ? price.trim() || undefined : undefined,
        oldPrice: has("oldPrice") ? oldPrice.trim() || undefined : undefined,
        cta: cta.trim() || undefined,
        phone: has("phone") ? phone.trim() || undefined : undefined,
        site: has("site") ? site.trim() || undefined : undefined,
        productImage: photo ?? undefined,
        logoCorner: logoObj ? logoCorner : undefined,
      });
      setResult(r);
      reachGoal(GOALS.generation, { kind: "banner" });
      toast.success("Креатив готов");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка генерации");
    } finally {
      setGenerating(false);
      generatingRef.current = false;
    }
  };

  /**
   * Логотип кладётся поверх на клиенте, поэтому сохранённый файл надо заменить
   * готовым кадром — иначе в «Моих карточках» останется версия без логотипа.
   */
  React.useEffect(() => {
    if (!result?.jobId || !logoObj) return;
    const t = setTimeout(() => {
      const data = previewRef.current?.toDataUrl();
      if (!data) return;
      void api.banner.finalize(result.jobId!, data).catch(() => undefined);
    }, 1200);
    return () => clearTimeout(t);
  }, [result, logoObj]);

  if (loaded && !allowed) {
    return (
      <AppShell title="Рекламные креативы">
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title="Раздел ещё не открыт"
          description="Раздел пока в разработке и доступен не всем аккаунтам."
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Рекламные креативы">
      {/* Плашка-ориентир: раздел путают с «Инфографикой». Инфографика — слайд
          ВНУТРИ карточки маркетплейса, креатив — реклама СНАРУЖИ, и всё, за что
          WB/Ozon снимают карточку (лого, цена, кнопка, контакты), здесь и есть смысл. */}
      <div className="mb-5 flex gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="font-medium [text-wrap:balance]">
            Это реклама за пределами маркетплейса, а не карточка товара
          </p>
          <p className="text-muted-foreground">
            Баннер для Директа и VK, пост в соцсети, шапка профиля, визитка. На креативе есть
            логотип, цена, кнопка, телефон и сайт — то, что на карточке Wildberries и Ozon
            запрещено. Нужна карточка с плашками для маркетплейса? Это раздел{" "}
            <Link href="/infographics" className="font-medium text-primary hover:underline">
              «Инфографика»
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr_0.9fr]">
        {/* ---------------- ЛЕВАЯ КОЛОНКА: шаги 1–2 ---------------- */}
        <div className="space-y-5">
          <Step n={1} title="Фото">
            <ImageUploader
              value={photo}
              onChange={(v) => {
                setPhoto(v);
                if (v) setSkipPhoto(false);
              }}
              label="Загрузите фото"
              hint="Товар, услуга, объект — что покажем на креативе"
            />
            <Button variant="outline" className="w-full" onClick={openPicker}>
              <Images className="h-4 w-4" />
              Выбрать из «Моих карточек»
            </Button>
            {pickerOpen ? (
              myCards === null ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : myCards.length ? (
                <div className="grid grid-cols-4 gap-2">
                  {myCards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickCard(c.url)}
                      className="overflow-hidden rounded-md border transition-opacity hover:opacity-80"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/proxy-image?url=${encodeURIComponent(c.url)}`}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Готовых карточек пока нет.</p>
              )
            ) : null}
            {!photo ? (
              <button
                type="button"
                onClick={() => setSkipPhoto(true)}
                className={`w-full rounded-lg border border-dashed px-3 py-2 text-xs transition-colors ${
                  skipPhoto
                    ? "border-primary/50 bg-primary/5 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {skipPhoto ? "Идём без фото — сцену нарисует ИИ" : "Продолжить без фото"}
              </button>
            ) : null}
          </Step>

          {step1done ? (
            <Step n={2} title="Что рекламируем">
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Своими словами: «стоматология, нужен баннер на сайт, работаем без боли» или «сдаю трактор в аренду, нужна визитка»"
              />
              <Button className="w-full" onClick={handlePlan} disabled={planning}>
                {planning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Разобрать задачу — бесплатно
              </Button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                ИИ поймёт, что вам нужно, выберет тип креатива и заполнит поля черновиком. Всё можно
                поправить руками.
              </p>
              {degraded ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
                  ИИ сейчас не ответил, поэтому черновика нет — заполните поля сами. Заголовок
                  особенно: он печатается прямо в картинку.
                </p>
              ) : null}
              {planned ? (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="bsubject">Предмет рекламы</Label>
                  <Input
                    id="bsubject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Стоматология"
                  />
                </div>
              ) : null}
            </Step>
          ) : null}
        </div>

        {/* ---------------- СРЕДНЯЯ КОЛОНКА: шаги 3–5 ---------------- */}
        <div className="space-y-5">
          {step2done ? (
            <Step n={3} title="Тип и формат">
              <div className="grid grid-cols-2 gap-2">
                {CREATIVE_TYPES.map((t) => (
                  <Chip
                    key={t.id}
                    active={creativeType === t.id}
                    onClick={() => {
                      setCreativeType(t.id);
                      setFormat(getCreativeType(t.id).formats[0].id);
                    }}
                    sub={t.hint}
                  >
                    {t.label}
                  </Chip>
                ))}
              </div>
              <div className="grid gap-2 pt-1">
                {type.formats.map((f) => (
                  <Chip
                    key={f.id}
                    active={format === f.id}
                    onClick={() => setFormat(f.id)}
                    sub={`${f.width} × ${f.height} · ${f.hint}`}
                  >
                    {f.label}
                  </Chip>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Файл придёт ровно в этом размере — мы просим его у модели напрямую.
                {creativeType === "profile-header" ? (
                  <>
                    {" "}
                    Обложки сообщества ВК (1590 × 400) пока нет: модель не берёт кадры вытянутее
                    3:1.
                  </>
                ) : null}
              </p>
            </Step>
          ) : null}

          {step3done ? (
            <Step n={4} title="Тексты на креативе">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleSuggest}
                disabled={suggesting}
              >
                {suggesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Другие варианты заголовка — бесплатно
              </Button>
              {options?.length ? (
                <div className="space-y-2">
                  {options.map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setHeadline(o.headline);
                        setSubheadline(o.subheadline ?? "");
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        headline === o.headline
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      <span className="block text-sm font-medium">{o.headline}</span>
                      {o.subheadline ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {o.subheadline}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="bheadline">Заголовок</Label>
                <Input
                  id="bheadline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Здоровая улыбка без боли"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bsub">Вторая строка</Label>
                <Input
                  id="bsub"
                  value={subheadline}
                  onChange={(e) => setSubheadline(e.target.value)}
                  placeholder="Профессиональная помощь"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bcta">Надпись на кнопке</Label>
                <Input
                  id="bcta"
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  placeholder="Оставьте пустым, если кнопка не нужна"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {CTA_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCta(p)}
                      className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </Step>
          ) : null}

          {step4done ? (
            <Step n={5} title="Что ещё показать">
              <div className="flex flex-wrap gap-1.5">
                {OPTIONAL_FIELDS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleField(f.id)}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      has(f.id)
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {has(f.id) ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {f.label}
                  </button>
                ))}
              </div>

              {has("benefit") ? (
                <div className="space-y-1.5">
                  <Label htmlFor="bbenefit">Преимущество</Label>
                  <Input
                    id="bbenefit"
                    value={benefit}
                    onChange={(e) => setBenefit(e.target.value)}
                    placeholder="Без боли и очередей"
                  />
                </div>
              ) : null}
              {has("price") || has("oldPrice") ? (
                <div className="grid grid-cols-2 gap-3">
                  {has("price") ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="bprice">Цена</Label>
                      <Input
                        id="bprice"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="от 2 490 ₽"
                      />
                    </div>
                  ) : null}
                  {has("oldPrice") ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="boldprice">Старая цена</Label>
                      <Input
                        id="boldprice"
                        value={oldPrice}
                        onChange={(e) => setOldPrice(e.target.value)}
                        placeholder="3 900 ₽"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {has("phone") ? (
                <div className="space-y-1.5">
                  <Label htmlFor="bphone">Телефон</Label>
                  <Input
                    id="bphone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 495 123-45-67"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Печатается на креативе. В журнал генераций не сохраняем.
                  </p>
                </div>
              ) : null}
              {has("site") ? (
                <div className="space-y-1.5">
                  <Label htmlFor="bsite">Адрес сайта</Label>
                  <Input
                    id="bsite"
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    placeholder="kartogen.ru"
                  />
                </div>
              ) : null}
              {has("logo") ? (
                <div className="space-y-2">
                  <LogoUploader value={logo} onChange={setLogo} />
                  <div className="grid grid-cols-2 gap-2">
                    <Chip
                      active={logoCorner === "top-left"}
                      onClick={() => setLogoCorner("top-left")}
                    >
                      Слева сверху
                    </Chip>
                    <Chip
                      active={logoCorner === "top-right"}
                      onClick={() => setLogoCorner("top-right")}
                    >
                      Справа сверху
                    </Chip>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Логотип накладывается вашими пикселями — модель фирменный знак не копирует, а
                    перерисовывает по мотивам.
                  </p>
                </div>
              ) : null}

              <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                Цену и скидку печатаем ровно такими, как вы их написали. Реклама должна показывать
                настоящую цену.
              </p>
            </Step>
          ) : null}

          {step4done ? (
            <Step n={6} title="Оформление">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(LOOK_LABELS) as BannerLook[]).map((l) => (
                  <Chip key={l} active={look === l} onClick={() => setLook(l)} sub={LOOK_HINTS[l]}>
                    {LOOK_LABELS[l]}
                  </Chip>
                ))}
              </div>

              <div className="space-y-1.5 pt-2">
                <Label htmlFor="bcomp">Композиция</Label>
                <select
                  id="bcomp"
                  value={compositionId}
                  onChange={(e) => setCompositionId(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Автоматически — своя под каждый предмет</option>
                  {compositionsFor(orientationOf(fmt.width, fmt.height)).map((c) => (
                    <option key={c.id} value={c.id}>
                      {COMPOSITION_LABELS[c.id] ?? c.id}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  На автомате раскладка, типографика и декор подбираются под предмет рекламы, а
                  кнопка «Другая композиция» под результатом сдвигает их на следующий вариант.
                </p>
              </div>
            </Step>
          ) : null}
        </div>

        {/* ---------------- ПРАВАЯ КОЛОНКА: запуск и результат ---------------- */}
        <div className="space-y-4">
          {step4done ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Проверьте перед запуском</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-xs">
                  {[
                    ["Заголовок", headline],
                    ["Вторая строка", subheadline],
                    ["Кнопка", cta],
                    ["Цена", has("price") ? price : ""],
                    ["Старая цена", has("oldPrice") ? oldPrice : ""],
                    ["Телефон", has("phone") ? phone : ""],
                    ["Сайт", has("site") ? site : ""],
                  ]
                    .filter(([, v]) => String(v).trim())
                    .map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="w-24 shrink-0 text-muted-foreground">{k}</span>
                        <span className="font-medium">{v}</span>
                      </div>
                    ))}
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Всё это нейросеть напечатает прямо в картинке. Поменять текст потом можно только
                  новой генерацией за {gens(priceTag)} — проверьте телефон и адрес сейчас.
                </p>
                <Button className="w-full" onClick={() => handleGenerate()} disabled={generating}>
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Megaphone className="h-4 w-4" />
                  )}
                  Создать — {priceTag} {SPARK}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  {fmt.label} · {fmt.width} × {fmt.height} · около полутора минут
                </p>
              </CardContent>
            </Card>
          ) : null}

          {result ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Результат</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <BannerPreview
                  ref={previewRef}
                  imageUrl={result.imageUrl}
                  width={result.width}
                  height={result.height}
                  logo={logoObj}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => previewRef.current?.download()}
                >
                  <Download className="h-4 w-4" />
                  Скачать PNG {result.width} × {result.height}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={generating || Boolean(compositionId)}
                  onClick={() => {
                    const next = variantSeed + 1;
                    setVariantSeed(next);
                    void handleGenerate(next);
                  }}
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Shuffle className="h-4 w-4" />
                  )}
                  Другая композиция — {priceTag} {SPARK}
                </Button>
                {compositionId ? (
                  <p className="text-[11px] text-muted-foreground">
                    Композиция выбрана вручную — чтобы перебирать варианты, верните «Автоматически»
                    в шаге 6.
                  </p>
                ) : null}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Тот же файл лежит в «Моих карточках».
                </p>
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={<Megaphone className="h-6 w-6" />}
              title="Креатива пока нет"
              description="Опишите задачу своими словами — остальное подскажем по шагам."
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
