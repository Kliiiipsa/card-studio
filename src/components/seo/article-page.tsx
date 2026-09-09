import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, CheckCircle2, Dna, Gem } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JsonLd } from "@/components/seo/json-ld";
import { SESSION_COOKIE, verifySessionToken } from "@/core/auth/session";
import { WELCOME_SPARKS } from "@/core/billing/prices";

/**
 * Каркас справочной SEO-страницы («размер карточки WB», «требования к фото
 * Ozon»…): шапка, заголовок, статья, FAQ со схемой FAQPage, призыв и подвал.
 * Контент статьи приходит детьми — у каждой страницы своя уникальная суть
 * (см. память seo-content-safety: Баден-Баден не любит шаблонную воду).
 */
export const SITE = "https://kartogen.ru";

export type Faq = { q: string; a: string };

export async function ArticlePage(props: {
  path: string;
  badge: string;
  title: React.ReactNode;
  /** plain-text title for schema/breadcrumbs */
  titleText: string;
  lead: string;
  description: string;
  updated: string;
  faq: Faq[];
  /** заголовок и подпись финального призыва */
  cta: { title: string; text: string; button: string; href?: string };
  related: { href: string; label: string }[];
  disclaimer: string;
  children: React.ReactNode;
}) {
  const secret = process.env.AUTH_SECRET;
  const token = cookies().get(SESSION_COOKIE)?.value;
  const authed = secret ? Boolean(await verifySessionToken(secret, token)) : false;
  const url = `${SITE}${props.path}`;

  const structured: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: props.titleText,
      description: props.description,
      inLanguage: "ru-RU",
      dateModified: props.updated,
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: "Kartogen", url: SITE },
      publisher: { "@type": "Organization", name: "Kartogen", url: SITE },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: props.titleText, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: props.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  const ctaHref = authed ? "/dashboard" : (props.cta.href ?? "/register");

  return (
    <div className="min-h-screen surface-gradient">
      <JsonLd data={structured} />

      <header className="container flex h-16 items-center justify-between gap-2">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-500 text-white shadow-md">
            <Gem className="h-5 w-5" />
          </div>
          <span className="whitespace-nowrap text-sm font-semibold sm:text-base">Kartogen</span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {authed ? (
            <Button asChild variant="gradient" size="sm">
              <Link href="/dashboard">
                В студию <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Войти</Link>
              </Button>
              <Button asChild variant="gradient" size="sm">
                <Link href="/register">
                  <span className="sm:hidden">Начать</span>
                  <span className="hidden sm:inline">Начать бесплатно</span>
                </Link>
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="container max-w-3xl pb-8 pt-12">
        <Badge variant="secondary" className="mb-4">
          {props.badge}
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{props.title}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{props.lead}</p>
        <p className="mt-2 text-xs text-muted-foreground">Обновлено: {props.updated}</p>

        <article className="mt-10 space-y-8 text-[15px] leading-7">{props.children}</article>

        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight">Частые вопросы</h2>
          <div className="mt-6 grid gap-3">
            {props.faq.map((f) => (
              <details key={f.q} className="group rounded-xl border bg-card p-4 open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-start gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {f.q}
                </summary>
                <p className="mt-2 pl-6 text-[13px] leading-6 text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-indigo-600 to-blue-600 p-8 text-center text-white sm:p-12">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{props.cta.title}</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/85">{props.cta.text}</p>
            <Button asChild size="lg" variant="secondary" className="mt-6">
              <Link href={ctaHref}>
                {authed ? "Открыть студию" : props.cta.button}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {!authed && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-white/80">
                <Dna className="h-4 w-4" />
                {WELCOME_SPARKS} генов в подарок при регистрации
              </p>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-muted-foreground">Читайте также</h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {props.related.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="text-primary hover:underline">
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="container flex flex-col items-center gap-3 border-t py-8 text-center text-sm text-muted-foreground">
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/" className="hover:text-foreground">Главная</Link>
          <Link href="/wildberries" className="hover:text-foreground">Для Wildberries</Link>
          <Link href="/ozon" className="hover:text-foreground">Для Ozon</Link>
          <Link href="/check" className="hover:text-foreground">Бесплатный анализ карточки</Link>
          <Link href="/blog" className="hover:text-foreground">Блог</Link>
          <Link href="/help" className="hover:text-foreground">Как это работает</Link>
          <Link href="/pricing" className="hover:text-foreground">Тарифы</Link>
          <a href="mailto:admin@kartogen.ru" className="hover:text-foreground">admin@kartogen.ru</a>
        </nav>
        <p className="max-w-2xl text-xs">{props.disclaimer}</p>
      </footer>
    </div>
  );
}

/* ---------- мелкие элементы статьи, чтобы страницы читались одинаково ---------- */

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold tracking-tight">{children}</h2>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-muted-foreground">{children}</p>;
}

export function Table({ head, rows }: { head: string[]; rows: (React.ReactNode | string)[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0 align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 ${j === 0 ? "font-medium" : "text-muted-foreground"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">{children}</div>
  );
}
