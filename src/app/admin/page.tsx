"use client";
import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type AdminUser = {
  email: string;
  role: "admin" | "user";
  verified: boolean;
  createdAt: string;
};

export default function AdminPage() {
  const [users, setUsers] = React.useState<AdminUser[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/admin/users")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          users?: AdminUser[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить пользователей.");
        setUsers(data.users ?? []);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <AppShell title="Админка">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Пользователи</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : users === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока никто не зарегистрировался.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Почта</th>
                      <th className="py-2 pr-4 font-medium">Роль</th>
                      <th className="py-2 pr-4 font-medium">Статус</th>
                      <th className="py-2 font-medium">Создан</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
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
                          {u.verified ? "подтверждён" : "ожидает код"}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {new Date(u.createdAt).toLocaleString("ru-RU")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
