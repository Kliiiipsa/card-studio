"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, ShieldCheck, Zap, X, ListOrdered, Users, Clapperboard, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { ACTION_LABELS } from "@/core/billing/prices";
import type { SparkTransaction } from "@/core/billing/billing";
import { cn } from "@/lib/utils";
import { ALL_VIDEO_PRESETS } from "@/core/video/presets";
import { INFOGRAPHIC_TYPES, INFOGRAPHIC_STYLES } from "@/core/infographics/types";

type AdminUser = {
  email: string;
  role: "admin" | "user";
  verified: boolean;
  createdAt: string;
  balance: number | null;
  /** IP at registration (from the consent journal); null for pre-journal accounts */
  ip: string | null;
};

const TX_LABEL: Record<string, string> = {
  welcome: "Бонус",
  topup: "Пополнение",
  charge: "Списание",
  refund: "Возврат",
  admin: "Корректировка",
};

/* ----------------------------- генерации ----------------------------- */

type Generation = {
  id: string;
  email: string;
  kind: string;
  status: "processing" | "completed" | "failed";
  resultUrl: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
};

const KIND_LABEL: Record<string, string> = {
  infographic: "Инфографика",
  generator: "Фото товара",
  video: "Видео",
  improve: "Улучшение",
  turnkey: "Под ключ",
};

const STATUS_LABEL: Record<string, string> = {
  processing: "В работе",
  completed: "Готово",
  failed: "Ошибка",
};

type Field = { label: string; value: unknown };
type Section = { title: string; fields: Field[] };

const labelOf = (list: { id: string; label: string }[], id?: string) =>
  list.find((x) => x.id === id)?.label ?? id;

/** Короткая подпись строки в таблице. */
function genTitle(g: Generation): string {
  const p = g.payload ?? {};
  return (
    p.userInput?.productName ||
    p.productName ||
    p.brief?.headline ||
    (typeof p.prompt === "string" ? p.prompt.slice(0, 60) : "") ||
    "—"
  );
}

/** Разложить задачу на понятные разделы: что ввёл человек, что выбрал, что ушло в модель. */
function genSections(g: Generation): Section[] {
  const p = g.payload ?? {};
  const out: Section[] = [];

  if (g.kind === "infographic") {
    const u = p.userInput ?? {};
    out.push({
      title: "Что заполнил пользователь",
      fields: [
        { label: "Название товара", value: u.productName },
        { label: "Категория", value: u.category },
        { label: "Аудитория", value: u.targetAudience },
        { label: "Преимущества", value: u.benefits },
        { label: "Боли клиента", value: u.painPoints },
        { label: "Пожелание (свой текст)", value: u.userNote },
      ],
    });
    out.push({
      title: "Что выбрал",
      fields: [
        { label: "Тип карточки", value: labelOf(INFOGRAPHIC_TYPES, u.type) },
        { label: "Стиль", value: labelOf(INFOGRAPHIC_STYLES, u.style) },
        { label: "Стиль-профиль", value: p.styleProfileName ?? u.styleSource },
        {
          label: "Источник стиля",
          value:
            p.styleProfileSource === "reference"
              ? "свой референс"
              : p.styleProfileSource === "library"
                ? "готовый стиль"
                : undefined,
        },
        { label: "Фото товара приложено", value: p.hasProductPhoto },
        { label: "Референс стиля приложен", value: p.hasStyleReference },
      ],
    });
    out.push({
      title: "Что сгенерировал ИИ",
      fields: [
        { label: "Заголовок", value: p.brief?.headline },
        { label: "Подзаголовок", value: p.brief?.subheadline },
        {
          label: "Плашки",
          value: Array.isArray(p.brief?.blocks)
            ? p.brief.blocks.map((b: { title: string; text?: string }) =>
                [b.title, b.text].filter(Boolean).join(" — "),
              )
            : undefined,
        },
        { label: "Текст впечён моделью", value: p.textBaked },
        { label: "Аварийный путь (Flux)", value: p.fallback },
        { label: "Предупреждения", value: p.brief?.warnings },
      ],
    });
    out.push({
      title: "Промпт в модель",
      fields: [{ label: "Изображение", value: p.imagePrompt ?? p.brief?.imagePrompt }],
    });
  } else if (g.kind === "video") {
    out.push({
      title: "Что заполнил пользователь",
      fields: [
        { label: "Название товара", value: p.productName },
        { label: "Категория", value: p.category },
      ],
    });
    out.push({
      title: "Что выбрал",
      fields: [
        { label: "Движение", value: labelOf(ALL_VIDEO_PRESETS, p.presetId) },
        { label: "Модель", value: p.model },
      ],
    });
    out.push({ title: "Промпт в модель", fields: [{ label: "Видео", value: p.videoPrompt }] });
  } else if (g.kind === "generator") {
    out.push({
      title: "Что заполнил пользователь",
      fields: [
        { label: "Описание (промпт)", value: p.prompt },
        { label: "Текст на карточке", value: p.cardText },
      ],
    });
    out.push({
      title: "Что выбрал",
      fields: [
        { label: "Режим", value: p.mode },
        { label: "Формат", value: p.aspectRatio },
        { label: "Сила изменения", value: p.strength },
        { label: "Что исключить", value: p.negativePrompt },
        { label: "Из пакета «под ключ»", value: p.turnkey },
      ],
    });
  } else {
    out.push({
      title: "Данные задачи",
      fields: [
        { label: "Название товара", value: p.productName },
        { label: "Шагов", value: Array.isArray(p.steps) ? p.steps.length : undefined },
      ],
    });
  }
  return out;
}

function FieldRow({ field }: { field: Field }) {
  const v = field.value;
  if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) return null;
  return (
    <div className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-3 border-b py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{field.label}</span>
      <span className="min-w-0 text-xs">
        {Array.isArray(v) ? (
          <ul className="list-disc space-y-0.5 pl-4">
            {v.map((item, i) => (
              <li key={i} className="break-words">
                {String(item)}
              </li>
            ))}
          </ul>
        ) : typeof v === "boolean" ? (
          v ? "да" : "нет"
        ) : (
          <span className="whitespace-pre-wrap break-words">{String(v)}</span>
        )}
      </span>
    </div>
  );
}

export default function AdminPage() {
  const [users, setUsers] = React.useState<AdminUser[] | null>(null);
  const [txs, setTxs] = React.useState<SparkTransaction[] | null>(null);
  const [storage, setStorage] = React.useState<{ count: number; bytes: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  // «Генерации»: журнал для разбора жалоб
  const [gens, setGens] = React.useState<Generation[] | null>(null);
  const [genEmail, setGenEmail] = React.useState("");
  const [genKind, setGenKind] = React.useState("");
  const [genStatus, setGenStatus] = React.useState("");
  const [openGen, setOpenGen] = React.useState<Generation | null>(null);

  // credit dialog state
  const [target, setTarget] = React.useState<AdminUser | null>(null);
  const [amount, setAmount] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [applying, setApplying] = React.useState(false);

  const loadUsers = React.useCallback(() => {
    fetch("/api/admin/users")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { users?: AdminUser[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить пользователей.");
        setUsers(data.users ?? []);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const loadTxs = React.useCallback(() => {
    fetch("/api/admin/transactions")
      .then((r) => r.json())
      .then((d: { transactions?: SparkTransaction[] }) => setTxs(d.transactions ?? []))
      .catch(() => setTxs([]));
  }, []);

  const loadGens = React.useCallback(() => {
    setGens(null);
    const qs = new URLSearchParams();
    if (genEmail.trim()) qs.set("email", genEmail.trim());
    if (genKind) qs.set("kind", genKind);
    if (genStatus) qs.set("status", genStatus);
    fetch(`/api/admin/generations?${qs.toString()}`)
      .then((r) => r.json())
      .then((d: { generations?: Generation[] }) => setGens(d.generations ?? []))
      .catch(() => setGens([]));
  }, [genEmail, genKind, genStatus]);

  React.useEffect(() => {
    loadUsers();
    loadTxs();
    fetch("/api/admin/storage")
      .then((r) => r.json())
      .then((d: { count?: number; bytes?: number }) =>
        setStorage({ count: d.count ?? 0, bytes: d.bytes ?? 0 }),
      )
      .catch(() => undefined);
  }, [loadUsers, loadTxs]);

  // журнал генераций: перезапрос при смене фильтров (почта — с задержкой,
  // чтобы не дёргать сервер на каждую букву)
  React.useEffect(() => {
    const t = setTimeout(loadGens, 350);
    return () => clearTimeout(t);
  }, [loadGens]);

  const applySparks = async () => {
    const value = Number(amount);
    if (!target || !Number.isInteger(value) || value === 0) {
      toast.error("Введите целое число: положительное — начислить, отрицательное — списать.");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/admin/sparks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target.email, amount: value, comment: comment || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; balance?: number };
      if (!res.ok) throw new Error(data.error ?? "Не удалось изменить баланс");
      toast.success(
        `${value > 0 ? "Начислено" : "Списано"} ${Math.abs(value)} ⚡ — баланс ${data.balance}`,
      );
      setTarget(null);
      setAmount("");
      setComment("");
      loadUsers();
      loadTxs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setApplying(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered =
    users?.filter((u) => u.email.includes(q) || (u.ip ?? "").toLowerCase().includes(q)) ?? null;
  // how many accounts share each registration IP — the fraud tell at a glance
  const ipCounts = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of users ?? []) if (u.ip) m[u.ip] = (m[u.ip] ?? 0) + 1;
    return m;
  }, [users]);

  return (
    <AppShell title="Админка">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold">Управление студией</h2>
          {storage && (
            <span className="ml-auto text-xs text-muted-foreground">
              Хранилище: {storage.count} карточек ·{" "}
              {(storage.bytes / 1024 / 1024).toFixed(0)} МБ из 10 240 МБ
            </span>
          )}
        </div>

        <Tabs defaultValue="users">
          <TabsList className="mb-4">
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-4 w-4" /> Пользователи
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-1.5">
              <ListOrdered className="h-4 w-4" /> Транзакции
            </TabsTrigger>
            <TabsTrigger value="generations" className="gap-1.5">
              <Clapperboard className="h-4 w-4" /> Генерации
            </TabsTrigger>
          </TabsList>

          {/* USERS */}
          <TabsContent value="users">
            <Card>
              <CardContent className="p-4">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по почте или IP…"
                  className="mb-3 max-w-sm"
                />
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : filtered === null ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Никого не найдено.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-4 font-medium">Почта</th>
                          <th className="py-2 pr-4 font-medium">Роль</th>
                          <th className="py-2 pr-4 font-medium">Баланс</th>
                          <th className="py-2 pr-4 font-medium">IP регистрации</th>
                          <th className="py-2 pr-4 font-medium">Создан</th>
                          <th className="py-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((u) => (
                          <tr key={u.email} className="border-b last:border-0">
                            <td className="py-2 pr-4">{u.email}</td>
                            <td className="py-2 pr-4">
                              {u.role === "admin" ? (
                                <Badge>админ</Badge>
                              ) : (
                                <Badge variant="secondary">пользователь</Badge>
                              )}
                            </td>
                            <td className="py-2 pr-4">
                              {u.role === "admin" ? (
                                <span className="text-muted-foreground">∞</span>
                              ) : u.balance === null ? (
                                "—"
                              ) : (
                                <span className="flex items-center gap-1 font-medium">
                                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                                  {u.balance}
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-4">
                              {u.ip ? (
                                <button
                                  type="button"
                                  onClick={() => setSearch(u.ip ?? "")}
                                  title="Показать все аккаунты с этого IP"
                                  className={cn(
                                    "font-mono text-xs hover:underline",
                                    (ipCounts[u.ip] ?? 0) > 1
                                      ? "font-semibold text-amber-600 dark:text-amber-400"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {u.ip}
                                  {(ipCounts[u.ip] ?? 0) > 1 ? ` ×${ipCounts[u.ip]}` : ""}
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">
                              {new Date(u.createdAt).toLocaleDateString("ru-RU")}
                            </td>
                            <td className="py-2 text-right">
                              {u.role !== "admin" && (
                                <Button variant="outline" size="sm" onClick={() => setTarget(u)}>
                                  <Zap className="h-3.5 w-3.5" />
                                  Искры
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TRANSACTIONS */}
          <TabsContent value="transactions">
            <Card>
              <CardContent className="p-4">
                {txs === null ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
                  </div>
                ) : txs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Транзакций пока нет.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-4 font-medium">Когда</th>
                          <th className="py-2 pr-4 font-medium">Кто</th>
                          <th className="py-2 pr-4 font-medium">Что</th>
                          <th className="py-2 text-right font-medium">Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txs.map((t) => (
                          <tr key={t.id} className="border-b last:border-0">
                            <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">
                              {new Date(t.createdAt).toLocaleString("ru-RU")}
                            </td>
                            <td className="py-2 pr-4">{t.email}</td>
                            <td className="py-2 pr-4">
                              {TX_LABEL[t.type] ?? t.type}
                              {t.action
                                ? ` · ${ACTION_LABELS[t.action as keyof typeof ACTION_LABELS] ?? t.action}`
                                : ""}
                              {t.comment && (
                                <span className="block text-xs text-muted-foreground">{t.comment}</span>
                              )}
                            </td>
                            <td
                              className={`py-2 text-right font-semibold ${
                                t.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : ""
                              }`}
                            >
                              {t.amount > 0 ? `+${t.amount}` : t.amount} ⚡
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* GENERATIONS — разбор жалоб: что человек вводил и что получилось */}
          <TabsContent value="generations">
            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={genEmail}
                      onChange={(e) => setGenEmail(e.target.value)}
                      placeholder="Почта клиента…"
                      className="w-56 pl-8"
                    />
                  </div>
                  <select
                    value={genKind}
                    onChange={(e) => setGenKind(e.target.value)}
                    className="h-10 rounded-md border bg-card px-3 text-sm"
                    aria-label="Тип генерации"
                  >
                    <option value="">Все типы</option>
                    <option value="infographic">Инфографика</option>
                    <option value="generator">Фото товара</option>
                    <option value="video">Видео</option>
                    <option value="turnkey">Под ключ</option>
                  </select>
                  <select
                    value={genStatus}
                    onChange={(e) => setGenStatus(e.target.value)}
                    className="h-10 rounded-md border bg-card px-3 text-sm"
                    aria-label="Статус"
                  >
                    <option value="">Любой статус</option>
                    <option value="completed">Готово</option>
                    <option value="failed">Ошибка</option>
                    <option value="processing">В работе</option>
                  </select>
                  <Button variant="outline" size="sm" onClick={loadGens}>
                    Обновить
                  </Button>
                </div>

                {gens === null ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
                  </div>
                ) : gens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Генераций не найдено.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-4 font-medium">Когда</th>
                          <th className="py-2 pr-4 font-medium">Клиент</th>
                          <th className="py-2 pr-4 font-medium">Тип</th>
                          <th className="py-2 pr-4 font-medium">Товар / запрос</th>
                          <th className="py-2 pr-4 font-medium">Статус</th>
                          <th className="py-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {gens.map((g) => (
                          <tr key={g.id} className="border-b last:border-0">
                            <td className="whitespace-nowrap py-2 pr-4 text-xs text-muted-foreground">
                              {new Date(g.createdAt).toLocaleString("ru-RU")}
                            </td>
                            <td className="py-2 pr-4 text-xs">
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() => setGenEmail(g.email)}
                                title="Показать все генерации этого клиента"
                              >
                                {g.email}
                              </button>
                            </td>
                            <td className="py-2 pr-4">
                              <Badge variant="secondary" className="whitespace-nowrap font-normal">
                                {KIND_LABEL[g.kind] ?? g.kind}
                              </Badge>
                            </td>
                            <td className="max-w-[260px] truncate py-2 pr-4" title={genTitle(g)}>
                              {genTitle(g)}
                            </td>
                            <td className="py-2 pr-4 text-xs">
                              <span
                                className={cn(
                                  g.status === "failed" && "font-medium text-destructive",
                                  g.status === "processing" && "text-amber-600 dark:text-amber-400",
                                  g.status === "completed" && "text-muted-foreground",
                                )}
                              >
                                {STATUS_LABEL[g.status] ?? g.status}
                              </span>
                            </td>
                            <td className="py-2 text-right">
                              <Button variant="outline" size="sm" onClick={() => setOpenGen(g)}>
                                Детали
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Показываются последние 50 генераций по фильтру. Загруженные клиентом фото не
                  сохраняются — видны только введённые данные, настройки и промпт, ушедший в модель.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* generation details */}
      <Dialog.Root open={!!openGen} onOpenChange={(o) => !o && setOpenGen(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[94vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border bg-background p-6 shadow-2xl data-[state=open]:animate-in data-[state=open]:zoom-in-95"
            aria-describedby={undefined}
          >
            <div className="flex items-start justify-between gap-3">
              <Dialog.Title className="text-base font-semibold">
                {openGen ? (KIND_LABEL[openGen.kind] ?? openGen.kind) : ""} · {openGen?.email}
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Закрыть">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            {openGen && (
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
                  {/* результат */}
                  <div className="space-y-2">
                    {openGen.resultUrl ? (
                      openGen.kind === "video" ? (
                        <video
                          src={openGen.resultUrl}
                          controls
                          muted
                          playsInline
                          className="w-full rounded-lg border bg-black"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={openGen.resultUrl}
                          alt="Результат генерации"
                          className="w-full rounded-lg border"
                        />
                      )
                    ) : (
                      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                        Результата нет
                      </div>
                    )}
                    <div className="space-y-0.5 text-[11px] text-muted-foreground">
                      <p>Начало: {new Date(openGen.createdAt).toLocaleString("ru-RU")}</p>
                      {openGen.finishedAt && (
                        <p>
                          Готово: {new Date(openGen.finishedAt).toLocaleString("ru-RU")} (
                          {Math.round(
                            (new Date(openGen.finishedAt).getTime() -
                              new Date(openGen.createdAt).getTime()) /
                              1000,
                          )}{" "}
                          с)
                        </p>
                      )}
                      <p className="font-mono break-all">{openGen.id}</p>
                    </div>
                    {openGen.resultUrl && (
                      <a
                        href={openGen.resultUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-xs text-primary hover:underline"
                      >
                        Открыть файл
                      </a>
                    )}
                  </div>

                  {/* детали */}
                  <div className="min-w-0 space-y-4">
                    {openGen.status === "failed" && (
                      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
                        <p className="font-medium text-destructive">Генерация не удалась</p>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">
                          {openGen.error ?? "без описания"}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          За неудачные генерации искры не списываются.
                        </p>
                      </div>
                    )}
                    {genSections(openGen).map((s) => {
                      const rows = s.fields.filter(
                        (f) =>
                          f.value !== undefined &&
                          f.value !== null &&
                          f.value !== "" &&
                          !(Array.isArray(f.value) && f.value.length === 0),
                      );
                      if (!rows.length) return null;
                      return (
                        <div key={s.title}>
                          <p className="mb-1 text-xs font-semibold">{s.title}</p>
                          <div className="rounded-lg border px-3 py-1">
                            {rows.map((f) => (
                              <FieldRow key={f.label} field={f} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Технические данные (JSON)
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-[11px] leading-4">
                        {JSON.stringify(openGen.payload, null, 2)}
                      </pre>
                    </details>
                  </div>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* credit/debit dialog */}
      <Dialog.Root open={!!target} onOpenChange={(o) => !o && !applying && setTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-6 shadow-2xl data-[state=open]:animate-in data-[state=open]:zoom-in-95"
            aria-describedby={undefined}
          >
            <div className="flex items-start justify-between">
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
                <Zap className="h-5 w-5 text-amber-500" />
                Искры: {target?.email}
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Закрыть" disabled={applying}>
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Сумма (минус — списать)</Label>
                <Input
                  id="amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9-]/g, ""))}
                  placeholder="Например: 500 или -50"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comment">Комментарий</Label>
                <Input
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Оплата переводом от 04.08"
                />
              </div>
              <Button variant="gradient" className="w-full" onClick={applySparks} disabled={applying}>
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Применить
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AppShell>
  );
}
