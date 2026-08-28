"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck, UserPlus, Eye, EyeOff } from "lucide-react";
import { reachGoal, GOALS } from "@/components/analytics/yandex-metrica";
import { getAttribution } from "@/lib/attribution";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateRussianEmail, ALLOWED_DOMAINS_HINT } from "@/core/auth/domains";
import { WELCOME_SPARKS, SPARK } from "@/core/billing/prices";

type Step = "form" | "code";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("form");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [inviteCode, setInviteCode] = React.useState("");
  // поле инвайт-кода показываем только если сервер его требует (регистрация
  // публично открыта 2026-08-26 → по умолчанию скрыто)
  const [inviteRequired, setInviteRequired] = React.useState(false);
  const [agreed, setAgreed] = React.useState(false);
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d: { inviteRequired?: boolean }) => setInviteRequired(d.inviteRequired === true))
      .catch(() => undefined);
  }, []);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      sent?: boolean;
      devCode?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Что-то пошло не так.");
    return data;
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const emailError = validateRussianEmail(email);
    if (emailError) return setError(emailError);
    if (password.length < 8) return setError("Пароль должен быть не короче 8 символов.");
    if (!agreed)
      return setError("Чтобы зарегистрироваться, примите Пользовательское соглашение и Политику.");
    setBusy(true);
    try {
      const data = (await post("/api/auth/register", {
        email: email.trim(),
        password,
        inviteCode: inviteCode.trim() || undefined,
        acceptTerms: agreed,
        attribution: getAttribution(),
      })) as {
        sent?: boolean;
        devCode?: string;
        registered?: boolean;
      };
      // open mode: the account is created immediately, no email code
      if (data.registered) {
        reachGoal(GOALS.register);
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      setDevCode(data.devCode ?? null);
      setNotice(
        data.sent
          ? `Письмо с кодом отправлено на ${email.trim()}. Код действует 15 минут.`
          : "Тестовый режим: почта не настроена, код показан ниже.",
      );
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Что-то пошло не так.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || code.trim().length !== 6) return;
    setError(null);
    setBusy(true);
    try {
      await post("/api/auth/verify", { email: email.trim(), code: code.trim() });
      reachGoal(GOALS.register);
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Что-то пошло не так.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {step === "form" ? <UserPlus className="h-5 w-5" /> : <MailCheck className="h-5 w-5" />}
          </div>
          <CardTitle className="text-base">Kartogen</CardTitle>
          <p className="text-sm text-muted-foreground">
            {step === "form" ? "Регистрация" : "Подтверждение почты"}
          </p>
        </CardHeader>
        <CardContent>
          {step === "form" ? (
            <form onSubmit={submitForm} className="space-y-3">
              {/* ценность: холодный посетитель должен видеть, ЗАЧЕМ регистрируется */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-5">
                <p className="font-medium text-foreground">
                  {SPARK} {WELCOME_SPARKS} генов в подарок · первое фото — бесплатно
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Фото товара, инфографика с текстом, SEO и видео — за минуты. Тексты, идеи и
                  заполнение по фото бесплатны.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">
                  Российская почта
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  autoComplete="email"
                  placeholder="you@yandex.ru"
                />
                <p className="text-[11px] leading-4 text-muted-foreground">
                  Принимаются: {ALLOWED_DOMAINS_HINT}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">
                  Пароль (от 8 символов)
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {inviteRequired && (
                <div className="space-y-1.5">
                  <Label htmlFor="invite" className="text-xs">
                    Инвайт-код
                  </Label>
                  <Input
                    id="invite"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Код приглашения"
                  />
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Сервис в закрытом тестировании — регистрация по приглашениям.
                  </p>
                </div>
              )}
              {/* consent must be an explicit, unchecked-by-default action (152-ФЗ) */}
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
                />
                <span>
                  Я принимаю{" "}
                  <Link href="/terms" target="_blank" className="font-medium text-primary hover:underline">
                    Пользовательское соглашение
                  </Link>{" "}
                  и даю согласие на обработку персональных данных согласно{" "}
                  <Link href="/privacy" target="_blank" className="font-medium text-primary hover:underline">
                    Политике
                  </Link>
                  .
                </span>
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy || !agreed} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Получить код
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Уже есть аккаунт?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Войти
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={submitCode} className="space-y-3">
              {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
              {devCode && (
                <p className="rounded-md bg-amber-500/10 px-3 py-2 text-center font-mono text-lg tracking-widest text-amber-600 dark:text-amber-400">
                  {devCode}
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="code" className="text-xs">
                  Код из письма
                </Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  placeholder="000000"
                  className="text-center font-mono text-lg tracking-widest"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Подтвердить и войти
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => {
                  setStep("form");
                  setCode("");
                  setError(null);
                }}
              >
                Изменить данные
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
