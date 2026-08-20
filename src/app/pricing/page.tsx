import type { Metadata } from "next";
import Link from "next/link";
import { Gem, Zap } from "lucide-react";
import {
  PRICES,
  TOPUP_PACKAGES,
  WELCOME_SPARKS,
  ACTION_LABELS,
  CUSTOM_TOPUP,
} from "@/core/billing/prices";

export const metadata: Metadata = {
  title: "Тарифы — Kartogen",
  description: "Стоимость услуг сервиса Kartogen: пакеты искр и цены на генерации.",
};

/**
 * Public price list. Payment providers (ЮKassa) require prices to be openly
 * published on the site; the offer (п. 3.4, 6.8, 7.2) points here. Numbers come
 * straight from the billing config, so the page can never drift from what the
 * app actually charges.
 */
const PAID: { key: keyof typeof PRICES; what: string }[] = [
  { key: "infographic", what: "Готовая карточка с русским текстом, плашками и композицией под ваш товар (3:4 или 4:5)." },
  { key: "generate", what: "Чистое фото товара: новый фон, свет и подача — по описанию или из вашего снимка." },
  { key: "video", what: "5-секундный видеоролик товара из одного фото: движение камеры и «оживление» кадра, 1080p, вертикальный формат." },
  { key: "analyze", what: "Разбор текущей карточки: оценка, слабые места, что мешает продажам." },
  { key: "seo", what: "SEO-название, продающее описание и 12–15 поисковых запросов для карточки." },
];

const FREE: (keyof typeof PRICES)[] = [
  "ideas",
  "write_prompt",
  "improve_prompt",
  "build_prompt",
  "brief",
  "autofill",
  "extract_style",
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-500 text-white shadow-md">
            <Gem className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold sm:text-base">Kartogen</span>
        </Link>
        <nav className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/offer" className="hover:text-foreground">
            Оферта
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Соглашение
          </Link>
        </nav>
      </header>

      <main className="container max-w-3xl space-y-12 pb-20 pt-6">
        <section className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl [text-wrap:balance]">
            Тарифы
          </h1>
          <p className="text-[15px] leading-7 text-muted-foreground">
            Расчёты в сервисе ведутся в искрах: <strong className="text-foreground">1 искра = 1 ₽</strong>.
            Вы пополняете баланс пакетом, а затем оплачиваете искрами отдельные операции. Подписок и
            автоматических списаний нет. Искры не сгорают. Списание происходит только за успешно
            выполненную операцию — за ошибки сервиса или отклонение модерацией искры не списываются.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Пакеты искр</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {TOPUP_PACKAGES.map((p) => (
              <div key={p.id} className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-1.5 text-2xl font-bold">
                  <Zap className="h-5 w-5 text-amber-500" />
                  {p.sparks + p.bonus}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {p.sparks} искр{p.bonus > 0 ? ` + ${p.bonus} бонусом` : ""}
                </div>
                <div className="mt-3 text-lg font-semibold">{p.priceRub} ₽</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Также можно пополнить баланс на произвольную сумму от {CUSTOM_TOPUP.minRub} до{" "}
            {CUSTOM_TOPUP.maxRub.toLocaleString("ru-RU")} ₽ по курсу 1 ₽ = 1 искра (без бонуса).
          </p>
          <p className="text-sm text-muted-foreground">
            Новым пользователям при регистрации начисляется {WELCOME_SPARKS} приветственных искр.
            Бонусные искры используются на тех же условиях, что и купленные, но не подлежат возврату
            деньгами.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Стоимость операций</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Операция</th>
                  <th className="px-4 py-2.5 font-medium">Что входит</th>
                  <th className="px-4 py-2.5 text-right font-medium">Цена</th>
                </tr>
              </thead>
              <tbody>
                {PAID.map((row) => (
                  <tr key={row.key} className="border-b last:border-0 align-top">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{ACTION_LABELS[row.key]}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.what}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold [font-variant-numeric:tabular-nums]">
                      {PRICES[row.key]} ⚡ = {PRICES[row.key]} ₽
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            Цена операции показывается на кнопке до её запуска. Одна операция = один результат
            (одно изображение или один текстовый блок).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Бесплатно</h2>
          <p className="text-sm text-muted-foreground">
            Все текстовые помощники сервиса не расходуют искры:
          </p>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {FREE.map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {ACTION_LABELS[k]}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2 rounded-xl border bg-muted/30 p-5 text-sm text-muted-foreground">
          <p>
            Оплата — банковской картой или через СБП с выдачей электронного чека. Неизрасходованные
            купленные искры можно вернуть по заявлению на{" "}
            <a href="mailto:admin@kartogen.ru" className="text-primary hover:underline">
              admin@kartogen.ru
            </a>{" "}
            — порядок описан в{" "}
            <Link href="/offer" className="text-primary hover:underline">
              Публичной оферте
            </Link>
            .
          </p>
          <p>
            Исполнитель вправе изменять тарифы; изменения не затрагивают уже зачисленные искры.
            Актуальная редакция тарифов всегда доступна на этой странице.
          </p>
        </section>
      </main>

      <footer className="container border-t py-8 text-center text-sm text-muted-foreground">
        Kartogen ·{" "}
        <Link href="/terms" className="hover:text-foreground">
          Соглашение
        </Link>{" "}
        ·{" "}
        <Link href="/offer" className="hover:text-foreground">
          Оферта
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="hover:text-foreground">
          Персональные данные
        </Link>{" "}
        ·{" "}
        <Link href="/pricing" className="hover:text-foreground">
          Тарифы
        </Link>
      </footer>
    </div>
  );
}
