"use client";
import * as React from "react";
import Link from "next/link";
import { LifeBuoy, Loader2, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";

export default function SupportPage() {
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 5) return void toast.error("Опишите вопрос подробнее.");
    setBusy(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim() || undefined, message: message.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { sent?: boolean; error?: string };
      if (!res.ok || !data.sent) throw new Error(data.error ?? "Не удалось отправить обращение");
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось отправить обращение");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Поддержка">
      <div className="mx-auto max-w-lg">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <LifeBuoy className="h-4 w-4 text-primary" /> Написать в поддержку
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                <p className="text-sm font-medium">Обращение отправлено</p>
                <p className="text-sm text-muted-foreground">
                  Мы получили ваш вопрос и ответим на почту вашего аккаунта в течение часа в
                  рабочее время (10:00–20:00 МСК).
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSent(false);
                    setSubject("");
                    setMessage("");
                  }}
                >
                  Написать ещё
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <p className="text-xs leading-5 text-muted-foreground">
                  Опишите вопрос — ответ придёт на почту вашего аккаунта. Поддержка работает
                  с 10:00 до 20:00 по Москве, отвечаем в течение часа. Если это жалоба на
                  генерацию, укажите, что вводили и что получили.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="subject" className="text-xs">
                    Тема (необязательно)
                  </Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Например: не пришёл код, вопрос по оплате"
                    maxLength={200}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="message" className="text-xs">
                    Сообщение
                  </Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Расскажите, что случилось или что нужно"
                    className="min-h-[140px]"
                    maxLength={4000}
                  />
                </div>
                <Button type="submit" disabled={busy} variant="gradient" className="w-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LifeBuoy className="h-4 w-4" />}
                  Отправить
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Или напишите на{" "}
                  <a href="mailto:admin@kartogen.ru" className="text-primary hover:underline">
                    admin@kartogen.ru
                  </a>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          <Link href="/help" className="text-primary hover:underline">
            Как это работает
          </Link>{" "}
          · частые вопросы там же
        </p>
      </div>
    </AppShell>
  );
}
