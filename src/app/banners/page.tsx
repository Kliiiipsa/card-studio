"use client";
import * as React from "react";
import { Loader2, Sparkles, Download, Images, Megaphone, Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/media/image-uploader";
import { EmptyState } from "@/components/project/empty-state";
import { toast } from "@/components/ui/toaster";
import { api } from "@/lib/client-api";
import { reachGoal, GOALS } from "@/components/analytics/yandex-metrica";
import { PRICES, SPARK, gens } from "@/core/billing/prices";
import { useProfileStore } from "@/store/profile-store";
import { BANNER_FORMATS, getBannerFormat } from "@/core/banners/formats";
import {
  CTA_PRESETS,
  LOOK_LABELS,
  type BannerFormatId,
  type BannerLook,
} from "@/core/banners/types";
import { BannerPreview, type BannerPreviewHandle } from "@/components/banners/banner-preview";

type HeadlineOption = { headline: string; subheadline?: string };
type Result = { imageUrl: string; width: number; height: number; look: BannerLook };

/** Кнопка-плашка выбора — одинаковая для оформления и формата. */
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

export default function BannersPage() {
  const { banners: allowed, loaded } = useProfileStore();

  // 1. товар
  const [productImage, setProductImage] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [myCards, setMyCards] = React.useState<{ id: string; url: string }[] | null>(null);

  // 2. предложение
  const [productName, setProductName] = React.useState("");
  const [benefit, setBenefit] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [oldPrice, setOldPrice] = React.useState("");

  // 3. заголовок (утверждается ДО генерации)
  const [options, setOptions] = React.useState<HeadlineOption[] | null>(null);
  const [headline, setHeadline] = React.useState("");
  const [subheadline, setSubheadline] = React.useState("");
  const [suggesting, setSuggesting] = React.useState(false);

  // 4. оформление и формат
  const [look, setLook] = React.useState<BannerLook>("light");
  const [format, setFormat] = React.useState<BannerFormatId>("square");

  // 5. накладка — меняется без перегенерации
  const [cta, setCta] = React.useState("Подробнее");
  const [site, setSite] = React.useState("");
  const [logo, setLogo] = React.useState<string | null>(null);

  const [generating, setGenerating] = React.useState(false);
  const generatingRef = React.useRef(false);
  const [result, setResult] = React.useState<Result | null>(null);
  const previewRef = React.useRef<BannerPreviewHandle>(null);

  const fmt = getBannerFormat(format);
  const priceTag = PRICES.banner;

  // накладка передаётся в превью одним объектом — мемо, чтобы холст не
  // перерисовывался на каждый рендер страницы
  const overlay = React.useMemo(
    () => ({
      price: price.trim() || undefined,
      oldPrice: oldPrice.trim() || undefined,
      cta: cta.trim() || undefined,
      site: site.trim() || undefined,
      logo: logo ?? undefined,
    }),
    [price, oldPrice, cta, site, logo],
  );

  const reserveBand = Boolean(price.trim() || cta.trim() || site.trim());

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

  /** Берём карточку через свой прокси и кладём как data URL — не зависим от прав на S3. */
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
      setProductImage(dataUrl);
      setPickerOpen(false);
      toast.success("Карточка подставлена");
    } catch {
      toast.error("Не удалось взять карточку — загрузите файл");
    }
  };

  const handleSuggest = async () => {
    if (!productName.trim()) {
      toast.error("Сначала напишите название товара.");
      return;
    }
    setSuggesting(true);
    try {
      const r = await api.banner.headlines({
        productName: productName.trim(),
        benefit: benefit.trim() || undefined,
        price: price.trim() || undefined,
        oldPrice: oldPrice.trim() || undefined,
      });
      setOptions(r.options);
      if (r.options[0] && !headline.trim()) {
        setHeadline(r.options[0].headline);
        setSubheadline(r.options[0].subheadline ?? "");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось предложить заголовок");
    } finally {
      setSuggesting(false);
    }
  };

  const handleGenerate = async () => {
    if (generatingRef.current) return;
    if (!productName.trim()) {
      toast.error("Напишите название товара.");
      return;
    }
    if (!headline.trim()) {
      toast.error("Утвердите заголовок — он печатается прямо в картинку.");
      return;
    }
    generatingRef.current = true;
    setGenerating(true);
    try {
      const r = await api.banner.generate({
        productName: productName.trim(),
        headline: headline.trim(),
        subheadline: subheadline.trim() || undefined,
        look,
        format,
        productImage: productImage ?? undefined,
        reserveBand,
        userInput: {
          benefit: benefit.trim() || undefined,
          price: price.trim() || undefined,
          oldPrice: oldPrice.trim() || undefined,
          cta: cta.trim() || undefined,
          site: site.trim() || undefined,
          hasLogo: Boolean(logo),
        },
      });
      setResult({ imageUrl: r.imageUrl, width: r.width, height: r.height, look });
      reachGoal(GOALS.generation, { kind: "banner" });
      toast.success("Баннер готов");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка генерации");
    } finally {
      setGenerating(false);
      generatingRef.current = false;
    }
  };

  if (loaded && !allowed) {
    return (
      <AppShell title="Рекламные баннеры">
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title="Раздел ещё не открыт"
          description="«Рекламные баннеры» пока в разработке и доступны не всем аккаунтам."
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Рекламные баннеры">
      <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
        Раздел в разработке и виден только вам. Клиенты его не видят.
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ---------------- LEFT: товар и предложение ---------------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">1. Товар</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ImageUploader
                value={productImage}
                onChange={setProductImage}
                label="Загрузите фото товара"
                hint="Или возьмите готовую карточку ниже. Без фото баннер нарисуется по названию."
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
                  <p className="text-xs text-muted-foreground">
                    Готовых карточек пока нет — загрузите фото файлом.
                  </p>
                )
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">2. Предложение</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bname">Название товара</Label>
                <Input
                  id="bname"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Термокружка"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bbenefit">Главное преимущество</Label>
                <Input
                  id="bbenefit"
                  value={benefit}
                  onChange={(e) => setBenefit(e.target.value)}
                  placeholder="Напиток остаётся горячим 8 часов"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bprice">Цена</Label>
                  <Input
                    id="bprice"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="990 ₽"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="boldprice">Старая цена</Label>
                  <Input
                    id="boldprice"
                    value={oldPrice}
                    onChange={(e) => setOldPrice(e.target.value)}
                    placeholder="1 490 ₽"
                  />
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Цена и скидка попадут на баннер ровно такими, как вы их написали — мы ничего не
                придумываем. Реклама должна показывать настоящую цену.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ---------------- MIDDLE: заголовок, оформление, накладка ---------------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">3. Заголовок</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                Предложить заголовок — бесплатно
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
                <Label htmlFor="bheadline">Заголовок на баннере</Label>
                <Input
                  id="bheadline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Тепло 8 часов"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bsub">Вторая строка (необязательно)</Label>
                <Input
                  id="bsub"
                  value={subheadline}
                  onChange={(e) => setSubheadline(e.target.value)}
                  placeholder="Термокружка 480 мл"
                />
              </div>
              <p className="rounded-md bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                Заголовок рисует нейросеть прямо в картинке — поэтому проверьте его до запуска.
                Поменять его потом можно только новой генерацией за {gens(priceTag)}. Цена, кнопка,
                адрес и логотип — другое дело: они накладываются поверх и правятся бесплатно.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">4. Оформление и формат</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Оформление</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(LOOK_LABELS) as BannerLook[]).map((l) => (
                    <Chip key={l} active={look === l} onClick={() => setLook(l)}>
                      {LOOK_LABELS[l]}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Формат</Label>
                <div className="grid gap-2">
                  {BANNER_FORMATS.map((f) => (
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
                  Файл придёт ровно в этом размере — мы просим его у модели напрямую, а не режем
                  потом.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">5. Поверх картинки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bcta">Кнопка</Label>
                <Input
                  id="bcta"
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  placeholder="Подробнее"
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
              <div className="space-y-1.5">
                <Label htmlFor="bsite">Адрес сайта</Label>
                <Input
                  id="bsite"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  placeholder="kartogen.ru"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Логотип</Label>
                <ImageUploader
                  value={logo}
                  onChange={setLogo}
                  label="Загрузите логотип"
                  hint="PNG с прозрачным фоном — лучше всего"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ---------------- RIGHT: результат ---------------- */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-5">
              <Button className="w-full" onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Megaphone className="h-4 w-4" />
                )}
                Создать баннер — {priceTag} {SPARK}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                {fmt.label} · {fmt.width} × {fmt.height} · генерация около полутора минут
              </p>
            </CardContent>
          </Card>

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
                  look={result.look}
                  overlay={overlay}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => previewRef.current?.download()}
                >
                  <Download className="h-4 w-4" />
                  Скачать PNG {result.width} × {result.height}
                </Button>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Цену, кнопку, адрес и логотип можно менять сколько угодно — превью и файл
                  пересобираются мгновенно и бесплатно. Баннер сохранён в «Моих карточках».
                </p>
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={<Megaphone className="h-6 w-6" />}
              title="Баннера пока нет"
              description="Заполните предложение, утвердите заголовок и нажмите «Создать баннер»."
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
