"use client";
import * as React from "react";
import Link from "next/link";
import { Gift, Copy, Check, Loader2, Users, Wallet, MousePointerClick } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { REFERRAL, gens, referralGenes } from "@/core/billing/prices";

/**
 * «Пригласить друга». Ссылка вида kartogen.ru/r/CODE, статистика по своим
 * приглашениям и честное объяснение, когда начисляются бонусы.
 *
 * За регистрацию не платим НИКОМУ, оба начисления — процент от суммы, которую
 * друг реально заплатил. Написано прямым текстом и в шагах, и в условиях,
 * чтобы человек не ждал гены после регистрации знакомого.
 *
 * Три правки после юридического разбора 24.09.2026, каждую не откатывать:
 *  1. Нет слов «навсегда», «бессрочно», «срока нет». Опубликованные условия —
 *     это публичная оферта (ст. 437 ГК), а обещание бессрочности при праве
 *     прекратить программу противоречило бы оферте и ст. 5 ФЗ «О рекламе».
 *     Вместо этого — срок предупреждения 30 дней, он же в оферте п. 6.17.
 *  2. Не предлагаем класть ссылку в описание ролика: публичное размещение —
 *     интернет-реклама с маркировкой erid, и мы в этой цепочке рекламодатель.
 *  3. Слово «бонус», а не «награда», «вознаграждение», «комиссия»: по такой
 *     лексике начисление физлицу квалифицируется как плата за оказанную услугу
 *     со всеми налоговыми последствиями. Счётчик — «Начислено бонусов».
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
    ? `Делаю карточки для маркетплейсов в Kartogen: фото товара, инфографика с русским текстом и SEO-тексты за минуты. По моей ссылке дают +${REFERRAL.refereeFirstTopupPercent}% генов к первому пополнению: ${stats.link}`
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
                  {REFERRAL.referrerPercent}% с каждого пополнения друга — вам
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  Друг пополняет баланс — вам приходит {REFERRAL.referrerPercent}% генами от суммы,
                  которую он заплатил. Не один раз, а с каждого его пополнения, сколько бы их ни
                  было. Ему тоже выгодно: к первому пополнению он получит +
                  {REFERRAL.refereeFirstTopupPercent}% генов сверх обычного бонуса пакета.
                  Количество друзей не ограничено.
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
                  Отправьте ссылку коллеге в личку или в рабочий чат продавцов. Сам код не меняется
                  и не перестаёт работать. Если размещаете ссылку публично — в описании ролика, в
                  канале, в посте, — маркировка рекламы на вашей стороне.
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
                label: "Начислено бонусов",
                value: `${stats.earnedGenes.toLocaleString("ru-RU")} 🧬`,
                hint: stats.paid
                  ? `${stats.paid} друзей пополняли баланс`
                  : `${REFERRAL.referrerPercent}% начислим с первого же пополнения друга`,
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
                  d: "Коллеге-продавцу в личку или в рабочий чат. Один раз скопировали — пользуйтесь всегда.",
                },
                {
                  t: "Друг регистрируется и пробует",
                  d: "Приветственные гены он получит как все — на пробу их хватает. За саму регистрацию мы не платим ни ему, ни вам: так программа не превращается в накрутку почтовых ящиков.",
                },
                {
                  t: "Друг пополняет баланс",
                  d: `Вам приходит ${REFERRAL.referrerPercent}% генами от суммы его пополнения, ему — ещё +${REFERRAL.refereeFirstTopupPercent}% к первому. Например, с пакета на 1000 ₽ вы получите ${gens(referralGenes(1000, REFERRAL.referrerPercent))}. Гены приходят автоматически.`,
                },
                {
                  t: "И дальше — с каждого пополнения",
                  d: `Второе, третье, десятое пополнение друга приносят вам те же ${REFERRAL.referrerPercent}%. Ограничения по времени или количеству нет.`,
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
                • Процент считается от <b>суммы, которую друг реально заплатил</b>. Бонусные гены
                пакета и гены по промокоду в эту сумму не входят: с пакета на 1000 ₽ вы получите{" "}
                {gens(referralGenes(1000, REFERRAL.referrerPercent))}, даже если на баланс другу
                упало больше.
              </li>
              <li>
                • За регистрацию не платим никому — ни вам, ни другу. Награда только с оплаты, и это
                защита от накрутки: иначе программа превратилась бы в станок по бесплатным генам на
                новых почтовых ящиках.
              </li>
              <li>
                • Приглашать себя на второй ящик бессмысленно. Мы смотрим на совпадение почты, на
                регистрацию друга с того же устройства и сетевого адреса, что и у вас, и на
                повторную регистрацию после удаления аккаунта. Такие связи помечаются и начислений
                не дают. Если вы с коллегой правда работаете из одного офиса — напишите на
                admin@kartogen.ru, разберёмся и начислим руками.
              </li>
              <li>
                • Гены с приглашений тратятся как обычные, но не выводятся и не возвращаются
                деньгами — это бонусные гены.
              </li>
              <li>
                • Если другу вернули деньги за пополнение, начисленные с него гены снимаются с обеих
                сторон — но только в пределах остатка на балансе. В минус баланс не уходит,
                доплачивать ничего не придётся.
              </li>
              <li>
                • Если мы решим изменить или закрыть программу, предупредим на этой странице за 30
                дней. Уже начисленные гены останутся у вас, связи с приглашёнными друзьями
                сохранятся.
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
