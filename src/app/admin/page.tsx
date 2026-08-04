"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, ShieldCheck, Zap, X, ListOrdered, Users } from "lucide-react";
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

type AdminUser = {
  email: string;
  role: "admin" | "user";
  verified: boolean;
  createdAt: string;
  balance: number | null;
};

const TX_LABEL: Record<string, string> = {
  welcome: "Бонус",
  topup: "Пополнение",
  charge: "Списание",
  refund: "Возврат",
  admin: "Корректировка",
};

export default function AdminPage() {
  const [users, setUsers] = React.useState<AdminUser[] | null>(null);
  const [txs, setTxs] = React.useState<SparkTransaction[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

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

  React.useEffect(() => {
    loadUsers();
    loadTxs();
  }, [loadUsers, loadTxs]);

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

  const filtered = users?.filter((u) => u.email.includes(search.trim().toLowerCase())) ?? null;

  return (
    <AppShell title="Админка">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold">Управление студией</h2>
        </div>

        <Tabs defaultValue="users">
          <TabsList className="mb-4">
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-4 w-4" /> Пользователи
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-1.5">
              <ListOrdered className="h-4 w-4" /> Транзакции
            </TabsTrigger>
          </TabsList>

          {/* USERS */}
          <TabsContent value="users">
            <Card>
              <CardContent className="p-4">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по почте…"
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
        </Tabs>
      </div>

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
