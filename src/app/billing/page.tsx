"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Zap, Loader2, CreditCard, X, Gift, ShoppingCart, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { useProfileStore } from "@/store/profile-store";
import { Input } from "@/components/ui/input";
import {
  TOPUP_PACKAGES,
  PRICES,
  ACTION_LABELS,
  CUSTOM_TOPUP,
  customTopup,
  type TopupPackage,
} from "@/core/billing/prices";
import type { SparkTransaction } from "@/core/billing/billing";

const TX_LABEL: Record<string, string> = {
  welcome: "Бонус за регистрацию",
  topup: "Пополнение",
  charge: "Списание",
  refund: "Возврат",
  admin: "Корректировка",
};

export default function BillingPage() {
  const { balance, role, fetchMe } = useProfileStore();
  const [buying, setBuying] = React.useState<TopupPackage | null>(null);
  const [paying, setPaying] = React.useState(false);
  const [customAmount, setCustomAmount] = React.useState("");
  const customPack = customTopup(Number(customAmount));
  const [history, setHistory] = React.useState<SparkTransaction[] | null>(null);

  const loadHistory = React.useCallback(() => {
    fetch("/api/billing/history")
      .then((r) => r.json())
      .then((d: { transactions?: SparkTransaction[] }) => setHistory(d.transactions ?? []))
      .catch(() => setHistory([]));
  }, []);

  React.useEffect(() => {
    void fetchMe();
    loadHistory();
  }, [fetchMe, loadHistory]);

  // Возврат со страницы оплаты ЮKassa: paymentId лежит в sessionStorage,
  // проверяем статус (сервер перепроверит у ЮKassa и зачислит идемпотентно).
  React.useEffect(() => {
    const paymentId = sessionStorage.getItem("yk_payment");
    if (!paymentId) return;
    let cancelled = false;
    let attempts = 0;
    const check = async () => {
      attempts++;
      try {
        const res = await fetch("/api/billing/topup/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId }),
        });
        const data = (await res.json()) as {
          status?: string;
          sparks?: number;
          balance?: number;
          error?: string;
        };
        if (cancelled) return;
        if (res.ok && data.status === "succeeded") {
          sessionStorage.removeItem("yk_payment");
          if (typeof data.balance === "number") useProfileStore.getState().setBalance(data.balance);
          toast.success(`Оплата прошла — зачислено ${data.sparks ?? ""} искр`.replace("  ", " "));
          loadHistory();
          return;
        }
        if (res.ok && data.status === "canceled") {
          sessionStorage.removeItem("yk_payment");
          toast.error("Платёж отменён — деньги не списаны.");
          return;
        }
        // pending / временная ошибка — подождём и спросим ещё раз
        if (attempts < 6) setTimeout(check, 2500);
        else sessionStorage.removeItem("yk_payment"); // зачислит вебхук, когда банк подтвердит
      } catch {
        if (!cancelled && attempts < 6) setTimeout(check, 2500);
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [loadHistory]);

  const pay = async () => {
    if (!buying) return;
    setPaying(true);
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buying.id === CUSTOM_TOPUP.id
            ? { packageId: buying.id, amountRub: buying.priceRub }
            : { packageId: buying.id },
        ),
      });
      const data = (await res.json()) as {
        balance?: number;
        confirmationUrl?: string;
        paymentId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Оплата не прошла");
      if (data.confirmationUrl && data.paymentId) {
        // реальный платёж: запоминаем id и уходим на страницу оплаты ЮKassa
        sessionStorage.setItem("yk_payment", data.paymentId);
        window.location.href = data.confirmationUrl;
        return; // не снимаем спиннер — идёт переход
      }
      if (typeof data.balance === "number") useProfileStore.getState().setBalance(data.balance);
      toast.success(`Зачислено ${buying.sparks + buying.bonus} искр`);
      setBuying(null);
      loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Оплата не прошла");
    } finally {
      setPaying(false);
    }
  };

  return (
    <AppShell title="Баланс и пополнение">
      <div className="mx-auto max-w-4xl space-y-5">
        {/* Balance */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 p-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
              <Zap className="h-7 w-7 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Ваш баланс</p>
              <p className="text-2xl font-bold">
                {role === "admin" ? "∞" : (balance ?? "…")}{" "}
                <span className="text-base font-medium text-muted-foreground">искр</span>
              </p>
            </div>
            <p className="ml-auto max-w-xs text-xs text-muted-foreground">
              1 искра = 1 ₽. Искры списываются только за успешный результат — за ошибки сервиса вы
              не платите.
            </p>
          </CardContent>
        </Card>

        {/* Packages */}
        <div>
          <h2 className="mb-3 text-sm font-semibold">Пакеты пополнения</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TOPUP_PACKAGES.map((p) => (
              <Card key={p.id} className="relative overflow-hidden">
                {p.bonus > 0 && (
                  <Badge className="absolute right-3 top-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Gift className="mr-1 h-3 w-3" />+{p.bonus} бонус
                  </Badge>
                )}
                <CardContent className="flex flex-col items-start gap-3 p-5">
                  <p className="flex items-center gap-1.5 text-2xl font-bold">
                    <Zap className="h-5 w-5 text-amber-500" />
                    {p.sparks}
                  </p>
                  <p className="text-sm text-muted-foreground">{p.priceRub} ₽</p>
                  <Button
                    variant={p.bonus > 0 ? "gradient" : "outline"}
                    className="w-full"
                    onClick={() => setBuying(p)}
                    disabled={role === "admin"}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Купить
                  </Button>
                </CardContent>
              </Card>
            ))}
            {/* Arbitrary amount: 1 ₽ = 1 spark, no bonus */}
            <Card className="relative overflow-hidden">
              <CardContent className="flex flex-col items-start gap-3 p-5">
                <p className="flex items-center gap-1.5 text-2xl font-bold">
                  <Zap className="h-5 w-5 text-amber-500" />
                  {customPack ? customPack.sparks : "Своя"}
                </p>
                <div className="flex w-full items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={CUSTOM_TOPUP.minRub}
                    max={CUSTOM_TOPUP.maxRub}
                    step={1}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value.replace(/\D/g, ""))}
                    placeholder={`от ${CUSTOM_TOPUP.minRub}`}
                    disabled={role === "admin"}
                    className="h-9"
                    aria-label="Сумма пополнения в рублях"
                  />
                  <span className="text-sm text-muted-foreground">₽</span>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => customPack && setBuying(customPack)}
                  disabled={role === "admin" || !customPack}
                >
                  <ShoppingCart className="h-4 w-4" />
                  Купить
                </Button>
              </CardContent>
            </Card>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Своя сумма — от {CUSTOM_TOPUP.minRub} до {CUSTOM_TOPUP.maxRub.toLocaleString("ru-RU")} ₽,
            1 ₽ = 1 искра, без бонуса.
          </p>
          {role === "admin" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Администратор пользуется студией без списаний — пополнение не требуется.
            </p>
          )}
        </div>

        {/* Prices */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Стоимость действий</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-1.5 text-sm sm:grid-cols-2">
              {(Object.keys(PRICES) as (keyof typeof PRICES)[])
                .filter((a) => PRICES[a] > 0 && a !== "turnkey") // turnkey скрыт на доработке
                .map((a) => (
                  <div key={a} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-muted-foreground">{ACTION_LABELS[a]}</span>
                    <span className="flex items-center gap-1 font-semibold">
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      {PRICES[a]}
                    </span>
                  </div>
                ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Все текстовые действия — идеи, промпты, брифы, анализ фото для заполнения формы —
              бесплатны.
            </p>
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">История операций</CardTitle>
          </CardHeader>
          <CardContent>
            {history === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Операций пока не было.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {history.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {TX_LABEL[t.type] ?? t.type}
                        {t.action ? ` · ${ACTION_LABELS[t.action as keyof typeof ACTION_LABELS] ?? t.action}` : ""}
                      </p>
                      {t.comment && (
                        <p className="truncate text-xs text-muted-foreground">{t.comment}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={t.amount > 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-foreground"}>
                        {t.amount > 0 ? `+${t.amount}` : t.amount} ⚡
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(t.createdAt).toLocaleString("ru-RU")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* YooKassa checkout dialog */}
      <Dialog.Root open={!!buying} onOpenChange={(o) => !o && !paying && setBuying(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-6 shadow-2xl data-[state=open]:animate-in data-[state=open]:zoom-in-95"
            aria-describedby={undefined}
          >
            <div className="flex items-start justify-between">
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
                <CreditCard className="h-5 w-5 text-primary" />
                Оплата через ЮKassa
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Закрыть" disabled={paying}>
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
            {buying && (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border bg-card/60 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Пакет</span>
                    <span className="font-medium">
                      {buying.sparks} искр{buying.bonus ? ` + ${buying.bonus} бонус` : ""}
                    </span>
                  </div>
                  <div className="mt-1.5 flex justify-between">
                    <span className="text-muted-foreground">К оплате</span>
                    <span className="font-semibold">{buying.priceRub} ₽</span>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/40 px-3 py-3 text-xs leading-5 text-muted-foreground">
                  <p className="font-medium text-foreground">Безопасная оплата через ЮKassa</p>
                  <p className="mt-1">
                    После нажатия вы перейдёте на защищённую страницу ЮKassa — банковская карта,
                    СБП и другие способы. Искры зачислятся автоматически сразу после оплаты.
                    Вопросы —{" "}
                    <a href="mailto:admin@kartogen.ru" className="text-primary hover:underline">
                      admin@kartogen.ru
                    </a>
                    .
                  </p>
                </div>
                <Button variant="gradient" className="w-full" onClick={pay} disabled={paying}>
                  {paying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Оплатить {buying.priceRub} ₽
                </Button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AppShell>
  );
}
