"use client";
import * as React from "react";
import { Loader2, Plus, Ticket, Dices } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { PRICES, ACTION_LABELS, type SparkAction } from "@/core/billing/prices";

type PromoType = "sparks" | "topup_bonus" | "price_list";
type PromoGroup = "general" | "nsdream";

export type PromoCode = {
  code: string;
  type: PromoType;
  group: PromoGroup;
  sparks: number | null;
  bonusPercent: number | null;
  prices: Record<string, number> | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  usesLimit: number | null;
  requireTopup: boolean;
  expiresAt: string | null;
  active: boolean;
  comment: string | null;
  createdAt: string;
};

export type PromoRedemption = {
  id: number;
  code: string;
  email: string;
  type: PromoType;
  group: PromoGroup;
  redeemedAt: string;
  sparksGranted: number | null;
  bonusPercent: number | null;
  bonusUsed: boolean;
  usesLeft: number | null;
  revoked: boolean;
};

const TYPE_LABEL: Record<PromoType, string> = {
  sparks: "Искры в подарок",
  topup_bonus: "Бонус к пополнению",
  price_list: "Свои цены на услуги",
};

/** услуги, для которых можно задать свою цену (бесплатные не показываем) */
const PRICED_ACTIONS = (Object.keys(PRICES) as SparkAction[]).filter(
  (a) => PRICES[a] > 0 && a !== "turnkey",
);

/** себестоимость генерации в рублях — чтобы сразу видеть, не уходим ли в минус */
const COST_RUB: Partial<Record<SparkAction, number>> = {
  analyze: 0.37,
  seo: 0.15,
  generate: 2.62,
  infographic: 4.58,
  video: 29.62,
};
/** выручка с искры в худшем случае (пакет 1000 после комиссии и налога) */
const RUB_PER_SPARK = 0.832;

function randomCode(prefix: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 5; i++) tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}-${tail}`;
}

export function PromoManager() {
  const [codes, setCodes] = React.useState<PromoCode[] | null>(null);
  const [redemptions, setRedemptions] = React.useState<PromoRedemption[]>([]);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    fetch("/api/admin/promo")
      .then((r) => r.json())
      .then((d: { codes?: PromoCode[]; redemptions?: PromoRedemption[]; error?: string }) => {
        setCodes(d.codes ?? []);
        setRedemptions(d.redemptions ?? []);
      })
      .catch(() => setCodes([]));
  }, []);

  React.useEffect(load, [load]);

  const toggle = async (code: string, active: boolean) => {
    try {
      const res = await fetch("/api/admin/promo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, active }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Не удалось");
      toast.success(active ? `Промокод ${code} включён` : `Промокод ${code} выключен`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <Tabs defaultValue="general">
      <TabsList className="mb-4">
        <TabsTrigger value="general" className="gap-1.5">
          <Ticket className="h-4 w-4" /> Общие
        </TabsTrigger>
        <TabsTrigger value="nsdream">Промокоды для NSdream</TabsTrigger>
      </TabsList>

      {(["general", "nsdream"] as PromoGroup[]).map((group) => (
        <TabsContent key={group} value={group} className="space-y-4">
          <CreateForm
            group={group}
            saving={saving}
            setSaving={setSaving}
            onCreated={load}
          />
          <CodeList
            codes={(codes ?? []).filter((c) => c.group === group)}
            loading={codes === null}
            redemptions={redemptions}
            onToggle={toggle}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

/* ----------------------------- создание ----------------------------- */

function CreateForm({
  group,
  saving,
  setSaving,
  onCreated,
}: {
  group: PromoGroup;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [type, setType] = React.useState<PromoType>(group === "nsdream" ? "price_list" : "sparks");
  const [code, setCode] = React.useState("");
  const [sparks, setSparks] = React.useState("");
  const [bonusPercent, setBonusPercent] = React.useState("");
  const [prices, setPrices] = React.useState<Record<string, string>>({});
  const [maxRedemptions, setMaxRedemptions] = React.useState("");
  const [usesLimit, setUsesLimit] = React.useState("");
  const [requireTopup, setRequireTopup] = React.useState(false);
  const [expiresAt, setExpiresAt] = React.useState("");
  const [comment, setComment] = React.useState("");

  const submit = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        code: code.trim(),
        type,
        group,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
        requireTopup,
        expiresAt: expiresAt ? new Date(expiresAt + "T23:59:59").toISOString() : null,
        comment: comment.trim() || null,
      };
      if (type === "sparks") body.sparks = Number(sparks);
      if (type === "topup_bonus") body.bonusPercent = Number(bonusPercent);
      if (type === "price_list") {
        const p: Record<string, number> = {};
        for (const [k, v] of Object.entries(prices)) {
          if (v !== "" && Number.isFinite(Number(v))) p[k] = Number(v);
        }
        body.prices = p;
        body.usesLimit = usesLimit ? Number(usesLimit) : null;
      }
      const res = await fetch("/api/admin/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось создать промокод");
      toast.success(`Промокод ${data.code.code} создан`);
      setCode("");
      setSparks("");
      setBonusPercent("");
      setPrices({});
      setMaxRedemptions("");
      setUsesLimit("");
      setComment("");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  // во сколько максимум обойдётся акция
  const worstCost = React.useMemo(() => {
    const n = Number(maxRedemptions) || 0;
    if (!n) return null;
    if (type === "sparks") {
      const s = Number(sparks) || 0;
      // худший случай — искры уходят на видео: 40 ⚡ = 29,62 ₽ себестоимости
      return Math.round((s / PRICES.video) * (COST_RUB.video ?? 0) * n);
    }
    return null;
  }, [type, sparks, maxRedemptions]);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Новый промокод</p>
        </div>

        {/* тип */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABEL) as PromoType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                type === t
                  ? "border-primary bg-primary/5 font-medium text-primary"
                  : "text-muted-foreground hover:border-primary/40",
              )}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={`code-${group}`}>Код</Label>
            <div className="flex gap-1.5">
              <Input
                id={`code-${group}`}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={group === "nsdream" ? "NSDREAM" : "KARTOGEN10"}
                className="font-mono uppercase"
              />
              <Button
                variant="outline"
                size="icon"
                title="Сгенерировать случайный"
                onClick={() => setCode(randomCode(group === "nsdream" ? "NSD" : "KG"))}
              >
                <Dices className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {type === "sparks" && (
            <div className="space-y-1.5">
              <Label htmlFor={`sparks-${group}`}>Сколько искр</Label>
              <Input
                id={`sparks-${group}`}
                inputMode="numeric"
                value={sparks}
                onChange={(e) => setSparks(e.target.value.replace(/\D/g, ""))}
                placeholder="50"
              />
            </div>
          )}
          {type === "topup_bonus" && (
            <div className="space-y-1.5">
              <Label htmlFor={`bonus-${group}`}>Бонус, %</Label>
              <Input
                id={`bonus-${group}`}
                inputMode="numeric"
                value={bonusPercent}
                onChange={(e) => setBonusPercent(e.target.value.replace(/\D/g, ""))}
                placeholder="20"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`max-${group}`}>Сколько человек может применить</Label>
            <Input
              id={`max-${group}`}
              inputMode="numeric"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value.replace(/\D/g, ""))}
              placeholder="без ограничения"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`exp-${group}`}>Действует до</Label>
            <Input
              id={`exp-${group}`}
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          {type === "price_list" && (
            <div className="space-y-1.5">
              <Label htmlFor={`uses-${group}`}>Генераций по спец-цене</Label>
              <Input
                id={`uses-${group}`}
                inputMode="numeric"
                value={usesLimit}
                onChange={(e) => setUsesLimit(e.target.value.replace(/\D/g, ""))}
                placeholder="без ограничения"
              />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`comment-${group}`}>Заметка для себя</Label>
            <Input
              id={`comment-${group}`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Компенсация за сбой 21.08"
            />
          </div>
        </div>

        {/* индивидуальные цены */}
        {type === "price_list" && (
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-xs font-medium">
              Цены для этого промокода <span className="text-muted-foreground">(пусто = обычная цена)</span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PRICED_ACTIONS.map((a) => {
                const value = prices[a] ?? "";
                const num = Number(value);
                const cost = COST_RUB[a] ?? 0;
                const loss = value !== "" && num * RUB_PER_SPARK < cost;
                return (
                  <div key={a} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {ACTION_LABELS[a]}
                      <span className="ml-1 text-[11px]">(обычно {PRICES[a]} ⚡)</span>
                    </span>
                    <Input
                      inputMode="numeric"
                      value={value}
                      onChange={(e) =>
                        setPrices((p) => ({ ...p, [a]: e.target.value.replace(/\D/g, "") }))
                      }
                      placeholder={String(PRICES[a])}
                      className={cn("h-9 w-20", loss && "border-destructive text-destructive")}
                      aria-label={`Цена: ${ACTION_LABELS[a]}`}
                    />
                  </div>
                );
              })}
            </div>
            {PRICED_ACTIONS.some((a) => {
              const v = prices[a];
              return v !== "" && v !== undefined && Number(v) * RUB_PER_SPARK < (COST_RUB[a] ?? 0);
            }) && (
              <p className="mt-2 text-xs leading-5 text-destructive">
                Красным отмечены цены ниже себестоимости — такие генерации будут уходить в минус.
                Это допустимо, если так задумано, но лучше знать заранее.
              </p>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={requireTopup}
            onChange={(e) => setRequireTopup(e.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
          />
          Только для тех, кто уже пополнял баланс — защита от накрутки на новых аккаунтах
        </label>

        {worstCost !== null && (
          <p className="text-xs text-muted-foreground">
            Максимальная стоимость акции: около <strong className="text-foreground">{worstCost} ₽</strong>{" "}
            — если все применившие потратят искры на видео (самая дорогая для нас услуга).
          </p>
        )}

        <Button variant="gradient" onClick={submit} disabled={saving || !code.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Создать промокод
        </Button>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- список ----------------------------- */

function CodeList({
  codes,
  loading,
  redemptions,
  onToggle,
}: {
  codes: PromoCode[];
  loading: boolean;
  redemptions: PromoRedemption[];
  onToggle: (code: string, active: boolean) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
      </div>
    );
  }
  if (!codes.length) {
    return <p className="text-sm text-muted-foreground">Промокодов пока нет.</p>;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Код</th>
                <th className="px-4 py-2 font-medium">Тип</th>
                <th className="px-4 py-2 font-medium">Что даёт</th>
                <th className="px-4 py-2 font-medium">Применений</th>
                <th className="px-4 py-2 font-medium">Действует до</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const used = redemptions.filter((r) => r.code === c.code && !r.revoked);
                const expired = c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
                return (
                  <tr key={c.code} className="border-b last:border-0 align-top">
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-medium">{c.code}</span>
                      {c.comment && (
                        <span className="block text-xs text-muted-foreground">{c.comment}</span>
                      )}
                      {c.requireTopup && (
                        <span className="block text-[11px] text-muted-foreground">
                          только после пополнения
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{TYPE_LABEL[c.type]}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {c.type === "sparks" && `${c.sparks} ⚡`}
                      {c.type === "topup_bonus" && `+${c.bonusPercent}% к пополнению`}
                      {c.type === "price_list" && c.prices && (
                        <span>
                          {Object.entries(c.prices)
                            .map(
                              ([a, v]) =>
                                `${ACTION_LABELS[a as SparkAction] ?? a} ${v} ⚡`,
                            )
                            .join(" · ")}
                          {c.usesLimit ? ` · лимит ${c.usesLimit} генераций` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {used.length}
                      {c.maxRedemptions ? ` из ${c.maxRedemptions}` : " (без лимита)"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("ru-RU") : "бессрочно"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {expired ? (
                          <Badge variant="secondary">истёк</Badge>
                        ) : c.active ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            активен
                          </Badge>
                        ) : (
                          <Badge variant="secondary">выключен</Badge>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onToggle(c.code, !c.active)}
                        >
                          {c.active ? "Выключить" : "Включить"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
