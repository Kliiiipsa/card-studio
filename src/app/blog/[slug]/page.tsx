import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, CalendarDays, HelpCircle, PenLine } from "lucide-react";
import { getPost, allPosts, readPostBody } from "@/core/blog/posts";
import { Markdown } from "@/components/blog/markdown";
import { BlogHeader, BlogFooter } from "@/components/blog/blog-chrome";
import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";

const SITE = "https://kartogen.ru";

export function generateStaticParams() {
  return allPosts().map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = getPost(params.slug);
  if (!post) return {};
  const url = `${SITE}/blog/${post.slug}`;
  return {
    title: `${post.title} — Kartogen`,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      images: [{ url: post.cover }],
    },
  };
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

export default function BlogArticle({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) notFound();
  const body = readPostBody(post.slug);
  const url = `${SITE}/blog/${post.slug}`;
  const others = allPosts().filter((p) => p.slug !== post.slug).slice(0, 2);

  const structured: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      image: `${SITE}${post.cover}`,
      datePublished: post.date,
      dateModified: post.date,
      inLanguage: "ru-RU",
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: "Kartogen", url: SITE },
      publisher: {
        "@type": "Organization",
        name: "Kartogen",
        logo: { "@type": "ImageObject", url: `${SITE}/icon.png` },
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Блог", item: `${SITE}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];
  if (post.faq.length) {
    structured.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: post.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  return (
    <div className="min-h-screen surface-gradient">
      <JsonLd data={structured} />
      <BlogHeader />

      <main className="container max-w-3xl pb-20 pt-6">
        <Link
          href="/blog"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Все статьи
        </Link>

        <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {post.category}
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl [text-wrap:balance]">
          {post.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <PenLine className="h-3.5 w-3.5" /> Редакция Kartogen
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> {fmtDate(post.date)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {post.readingMinutes} мин чтения
          </span>
        </div>

        <div className="my-7 overflow-hidden rounded-2xl border bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.cover} alt={post.title} className="w-full" />
        </div>

        <Markdown md={body} />

        {post.faq.length > 0 && (
          <section className="mt-12">
            <div className="mb-4 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold tracking-tight">Частые вопросы</h2>
            </div>
            <div className="space-y-3">
              {post.faq.map((f) => (
                <details key={f.q} className="group rounded-xl border bg-card p-4 open:shadow-sm">
                  <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
                    {f.q}
                  </summary>
                  <p className="mt-2 text-[14px] leading-6 text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="mt-12 overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-indigo-600 to-blue-600 p-8 text-center text-white">
          <h2 className="text-2xl font-bold tracking-tight">Соберите продающую карточку сами</h2>
          <p className="mx-auto mt-2 max-w-lg text-white/85">
            Загрузите фото товара — ИИ подберёт стиль, напишет русский текст и соберёт готовую
            инфографику за пару минут. Приветственные гены в подарок при регистрации.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-6">
            <Link href="/register">
              Начать бесплатно <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </section>

        {others.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-lg font-bold tracking-tight">Читайте также</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {others.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="group rounded-xl border bg-card p-4 transition hover:shadow-md"
                >
                  <span className="text-xs font-medium text-primary">{p.category}</span>
                  <h3 className="mt-1 text-sm font-semibold [text-wrap:balance] group-hover:text-primary">
                    {p.title}
                  </h3>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <BlogFooter />
    </div>
  );
}
