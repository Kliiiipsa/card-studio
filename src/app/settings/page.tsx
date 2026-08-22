"use client";
import * as React from "react";
import { KeyRound, Loader2, Moon, Sun, Trash2, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { useProfileStore } from "@/store/profile-store";

export default function SettingsPage() {
  const { email, role, fetchMe } = useProfileStore();
  const [dark, setDark] = React.useState(false);

  const [oldPassword, setOldPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [newPassword2, setNewPassword2] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // удаление аккаунта: idle → код отправлен (ввод) → удаление
  const [deleteStep, setDeleteStep] = React.useState<"idle" | "code">("idle");
  const [deleteCode, setDeleteCode] = React.useState("");
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  React.useEffect(() => {
    void fetchMe();
    setDark(localStorage.getItem("wb-theme") === "dark");
  }, [fetchMe]);

  const toggleTheme = (next: boolean) => {
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("wb-theme", next ? "dark" : "light");
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (newPassword.length < 8) return void toast.error("Новый пароль — минимум 8 символов.");
    if (newPassword !== newPassword2) return void toast.error("Пароли не совпадают.");
    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сменить пароль");
      toast.success("Пароль изменён");
      setOldPassword("");
      setNewPassword("");
      setNewPassword2("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сменить пароль");
    } finally {
      setSaving(false);
    }
  };

  const requestDeletion = async () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/auth/delete-account", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; devCode?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось отправить код");
      setDeleteStep("code");
      if (data.devCode) setDeleteCode(data.devCode); // локальная разработка без почты
      toast.success("Код подтверждения отправлен на вашу почту");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось отправить код");
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/auth/delete-account/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: deleteCode.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось удалить аккаунт");
      toast.success("Аккаунт удалён");
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось удалить аккаунт");
      setDeleteBusy(false);
    }
  };

  return (
    <AppShell title="Настройки">
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserRound className="h-4 w-4 text-primary" />
              Аккаунт
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{email ?? "…"}</span>
            {role === "admin" ? <Badge>администратор</Badge> : <Badge variant="secondary">пользователь</Badge>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              {dark ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-primary" />}
              Оформление
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Тёмная тема</p>
              <p className="text-xs text-muted-foreground">Действует на этом устройстве</p>
            </div>
            <Switch checked={dark} onCheckedChange={toggleTheme} aria-label="Тёмная тема" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <KeyRound className="h-4 w-4 text-primary" />
              Смена пароля
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={changePassword} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="oldpass">Текущий пароль</Label>
                <Input
                  id="oldpass"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="newpass">Новый пароль</Label>
                  <Input
                    id="newpass"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newpass2">Повторите</Label>
                  <Input
                    id="newpass2"
                    type="password"
                    value={newPassword2}
                    onChange={(e) => setNewPassword2(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <Button type="submit" disabled={saving || !oldPassword || !newPassword}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Сменить пароль
              </Button>
            </form>
          </CardContent>
        </Card>

        {role !== "admin" && (
          <Card className="border-destructive/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                <Trash2 className="h-4 w-4" />
                Удаление аккаунта
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                <li>Все сгенерированные карточки и видео будут удалены безвозвратно.</li>
                <li>Остаток баланса сгорает и не возвращается.</li>
                <li>Персональные данные удаляются из базы (записи о платежах обезличиваются — этого требует налоговый учёт).</li>
                <li>При повторной регистрации на эту почту приветственный бонус не начисляется.</li>
              </ul>
              {deleteStep === "idle" ? (
                <Button type="button" variant="destructive" disabled={deleteBusy} onClick={requestDeletion}>
                  {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Удалить аккаунт…
                </Button>
              ) : (
                <form onSubmit={confirmDeletion} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="delcode">Код из письма</Label>
                    <Input
                      id="delcode"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6 цифр"
                      value={deleteCode}
                      onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, ""))}
                      className="max-w-[160px]"
                      autoComplete="one-time-code"
                    />
                    <p className="text-xs text-muted-foreground">
                      Мы отправили код подтверждения на {email ?? "вашу почту"}. Это последний шаг —
                      после ввода кода аккаунт будет удалён навсегда.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="destructive" disabled={deleteBusy || deleteCode.length !== 6}>
                      {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Удалить навсегда
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={deleteBusy}
                      onClick={() => {
                        setDeleteStep("idle");
                        setDeleteCode("");
                      }}
                    >
                      Отмена
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
