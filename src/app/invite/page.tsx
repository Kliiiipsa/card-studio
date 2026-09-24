"use client";
import * as React from "react";
import Link from "next/link";
import { Gift, Copy, Check, Loader2, Users, Wallet, MousePointerClick } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { REFERRAL, WELCOME_SPARKS, gens } from "@/core/billing/prices";

/**
 * «Пригласить друга». Ссылка вида kartogen.ru/r/CODE, статистика по своим
 * приглашениям и честное объяснение, когда начисляется награда.
 *
 * Формулировки: награда пригласившему — ТОЛЬКО после первой оплаты друга.
 * Это написано прямым текстом и в шагах, и в вопросах, чтобы человек не ждал
 * гены сразу после регистрации знакомого и не считал себя обманутым.
 */

type Stats = {
  code: string;
  link: string;
  clicks: number;
  signups: number;
  paid: number;
  earnedGenes: number;
  pendingSignups: number;
};

export default function InvitePage() {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState<"link" | "text" | null>(null);

  React.useEffect(() => {
    fetch("/api/referrals")
      .then((r) => r.json())
      .then((d) => setStats(d?.code ? d : (d?.data ?? null)))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const shareText = stats
    ? `Делаю карточки для маркетплейсов в Kartogen: фото товара, инфографика с русским текстом и SEO-тексты за минуты. По моей ссылке дают ${WELCOME_SPARKS + REFERRAL.refereeBonus} генов вместо ${WELCOME_SPARKS} — хватит на несколько карточек: ${stats.link}`
    : "";

  const copy = async (what: "link" | "text") => {
    if (!stats) return;
    try {
      await navigator.clipboard.writeText(what === "link" ? stats.link : shareText);
      setCopied(what);
      toast.success(what === "link" ? "Ссылка скопирована" : "Текст скопирован");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Не удалось скопировать — выделите текст вручную");
    }
  };

  return (
    <AppShell title="Пригласить друга">
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Оффер */}
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Gift className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold [text-wrap:balance]">
                  {gens(REFERRAL.referrerReward)} вам, {REFERRAL.refereeBonus} генов другу
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  Друг регистрируется по вашей ссылке и получает{" "}
                  {WELCOME_SPARKS + REFERRAL.refereeBonus} генов вместо {WELCOME_SPARKS}. Когда он
                  первый раз пополнит баланс на любую сумму, вам начислим{" "}
                  {gens(REFERRAL.referrerReward)}. Количество друзей не ограничено.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ссылка */}
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-medium">Ваша ссылка</p>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Готовим ссылку…
              </div>
            ) : !stats ? (
              <p className="text-sm text-muted-foreground">
                Не удалось получить ссылку. Обновите страницу или напишите на{" "}
                <a href="mailto:admin@kartogen.ru" className="text-primary hover:underline">
                  admin@kartogen.ru
                </a>
                .
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input readOnly value={stats.link} className="font-mono text-sm" />
                  <Button onClick={() => copy("link")} className="shrink-0">
                    {copied === "link" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    Копировать
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => copy("text")}>
                  {copied === "text" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  Скопировать текст для чата
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">
                  Ссылку можно отправить в чат продавцов, в личное сообщение или положить в описание
                  ролика. Она работает бессрочно и не меняется.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Статистика */}
        {stats && (
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: MousePointerClick,
                label: "Переходов по ссылке",
                value: stats.clicks.toLocaleString("ru-RU"),
                hint: "считаем клики, без личных данных",
              },
              {
                icon: Users,
                label: "Зарегистрировались",
                value: stats.signups.toLocaleString("ru-RU"),
                hint: stats.pendingSignups
                  ? `${stats.pendingSignups} ещё не пополняли баланс`
                  : "все, кто пришёл по ссылке",
              },
              {
                icon: Wallet,
                label: "Заработано",
                value: `${stats.earnedGenes.toLocaleString("ru-RU")} 🧬`,
                hint: stats.paid
                  ? `${stats.paid} друзей уже пополнили баланс`
                  : "начислим после первой оплаты друга",
              },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <s.icon className="h-3.5 w-3.5" />
                    {s.label}
                  </div>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums">{s.value}</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{s.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Как это работает */}
        <Card>
          <CardContent className="space-y-4 p-5">
            <p className="text-sm font-medium">Как это работает</p>
            <ol className="space-y-3">
              {[
                {
                  t: "Отправьте ссылку",
                  d: "Коллеге-продавцу, в чат или в описание ролика. Один раз скопировали — пользуйтесь всегда.",
                },
                {
                  t: "Друг регистрируется",
                  d: `Он сразу получает ${WELCOME_SPARKS + REFERRAL.refereeBonus} генов вместо ${WELCOME_SPARKS} — это несколько карточек на пробу.`,
                },
                {
                  t: "Друг пополняет баланс",
                  d: `Как только пройдёт первая оплата на любую сумму, вам начислим ${gens(REFERRAL.referrerReward)}. Гены придут на баланс автоматически.`,
                },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{s.t}</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* Честные условия */}
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-medium">Условия без мелкого шрифта</p>
            <ul className="space-y-2 text-[13px] leading-6 text-muted-foreground">
              <li>
                • Награда приходит за <b>первую оплату</b> друга, а не за регистрацию. Так программа
                не превращается в накрутку аккаунтов, и гены достаются тем, кто правда привёл
                продавца.
              </li>
              <li>
                • Приглашать себя на второй ящик бессмысленно: такие связи мы отсекаем, гены по ним
                не начисляются.
              </li>
              <li>
                • Гены с приглашений тратятся как обычные, но не возвращаются деньгами — это
                бонусные гены.
              </li>
              <li>
                • Друг должен перейти именно по вашей ссылке и зарегистрироваться с неё. Если он
                зарегистрировался раньше, связь не засчитается.
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Вопросы по начислениям — на{" "}
              <a href="mailto:admin@kartogen.ru" className="text-primary hover:underline">
                admin@kartogen.ru
              </a>
              . Полные условия сервиса — в{" "}
              <Link href="/offer" className="text-primary hover:underline">
                оферте
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
