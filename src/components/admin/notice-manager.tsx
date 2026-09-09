"use client";
import * as React from "react";
import { Bell, Loader2, Megaphone, Info, Wrench, Trash2, Eye, EyeOff, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

/**
 * Уведомления сервиса: владелец пишет здесь, клиент видит в колокольчике.
 * Пока колокольчик показан только админу (гейт NOTICES=all раскатывает всем).
 */

type Kind = "info" | "promo" | "maintenance";
type Notice = {
  id: number;
  kind: Kind;
  title: string;
  body: string;
  url: string | null;
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
  reads: number;
};

const KINDS: { id: Kind; label: string; hint: string; icon: typeof Info }[] = [
  { id: "info", label: "Информация", hint: "новая функция, изменение в сервисе", icon: Info },
  { id: "promo", label: "Акция", hint: "скидка, промокод, бонус", icon: Megaphone },
  { id: "maintenance", label: "Техработы", hint: "сервис будет недоступен", icon: Wrench },
];

export function NoticeManager() {
  const [list, setList] = React.useState<Notice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [kind, setKind] = React.useState<Kind>("info");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [expires, setExpires] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notices");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить");
      setList(data.notices ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    if (title.trim().length < 3) {
      toast.error("Заголовок слишком короткий.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || null,
          expiresAt: expires ? new Date(expires).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось опубликовать");
      toast.success("Уведомление опубликовано");
      setTitle("");
      setBody("");
      setUrl("");
      setExpires("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (n: Notice) => {
    await fetch("/api/admin/notices", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: n.id, active: !n.active }),
    }).catch(() => undefined);
    await load();
  };

  const remove = async (n: Notice) => {
    if (!confirm(`Удалить «${n.title}»? Отметки о прочтении тоже сотрутся.`)) return;
    await fetch(`/api/admin/notices?id=${n.id}`, { method: "DELETE" }).catch(() => undefined);
    await load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Новое уведомление</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  kind === k.id ? "border-primary bg-primary/5" : "bg-card/60 hover:border-primary/40",
                )}
              >
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <k.icon className="h-4 w-4" /> {k.label}
                </p>
                <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{k.hint}</p>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="n-title">Заголовок</Label>
            <Input
              id="n-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: 10 сентября с 3:00 до 5:00 — технические работы"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="n-body">Текст</Label>
            <Textarea
              id="n-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Пара предложений: что происходит и что делать пользователю."
              className="min-h-[90px]"
              maxLength={2000}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="n-url">Ссылка «Подробнее» (необязательно)</Label>
              <Input
                id="n-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/billing"
              />
              <p className="text-[11px] text-muted-foreground">
                Только внутренний путь сайта, начиная с «/».
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-exp">Скрыть после (необязательно)</Label>
              <Input
                id="n-exp"
                type="datetime-local"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Уведомление само пропадёт — удобно для акций и техработ.
              </p>
            </div>
          </div>

          <Button onClick={publish} disabled={busy} variant="gradient" className="w-full sm:w-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Опубликовать
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <p className="mb-3 text-sm font-semibold">Опубликованные</p>
          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : !list.length ? (
            <p className="text-sm text-muted-foreground">Пока ни одного уведомления.</p>
          ) : (
            <div className="space-y-2">
              {list.map((n) => {
                const k = KINDS.find((x) => x.id === n.kind) ?? KINDS[0];
                const expired = n.expiresAt && new Date(n.expiresAt) < new Date();
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex flex-wrap items-start gap-3 rounded-xl border px-3 py-2.5",
                      (!n.active || expired) && "opacity-60",
                    )}
                  >
                    <k.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body && (
                        <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{new Date(n.createdAt).toLocaleString("ru-RU")}</span>
                        <span>· прочитали: {n.reads}</span>
                        {n.url && <span>· ссылка: {n.url}</span>}
                        {n.expiresAt && (
                          <span>
                            · {expired ? "истекло" : "до"}{" "}
                            {new Date(n.expiresAt).toLocaleString("ru-RU")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={n.active && !expired ? "default" : "secondary"}>
                        {expired ? "истекло" : n.active ? "показывается" : "скрыто"}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => toggle(n)} title="Показать/скрыть">
                        {n.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(n)}
                        className="text-destructive hover:text-destructive"
                        title="Удалить"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
