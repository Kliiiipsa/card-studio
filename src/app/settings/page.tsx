"use client";
import * as React from "react";
import { KeyRound, Loader2, Moon, Sun, UserRound } from "lucide-react";
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
      </div>
    </AppShell>
  );
}
