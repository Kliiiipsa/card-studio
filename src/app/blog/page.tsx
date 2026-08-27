import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { allPosts } from "@/core/blog/posts";
import { BlogHeader, BlogFooter } from "@/components/blog/blog-chrome";
import { JsonLd } from "@/components/seo/json-ld";

const SITE = "https://kartogen.ru";

export const metadata: Metadata = {
  title: "Блог Kartogen — карточки и инфографика для маркетплейсов",
  description:
    "Гайды и разборы для селлеров Wildberries и Ozon: как оформлять карточки, делать инфографику, проходить модерацию и поднимать продажи.",
  alternates: { canonical: `${SITE}/blog` },
};

export default function BlogIndex() {
  const posts = allPosts();
  const structured = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Блог Kartogen",
    url: `${SITE}/blog`,
    inLanguage: "ru-RU",
    description:
      "Гайды и разборы для селлеров Wildberries и Ozon: карточки, инфографика, модерация, продажи.",
  };

  return (
    <div className="min-h-screen surface-gradient">
      <JsonLd data={structured} />
      <BlogHeader />

      <main className="container max-w-5xl pb-20 pt-10">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Блог</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl [text-wrap:balance]">
            Карточки и инфографика для маркетплейсов
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Гайды и разборы для селлеров Wildberries и Ozon: как оформлять карточки, делать
            инфографику, проходить модерацию и продавать больше.
          </p>
        </div>

        {posts.length === 0 ? (
          <p className="text-center text-muted-foreground">Скоро здесь появятся статьи.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {posts.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition hover:shadow-md"
              >
                <div className="aspect-[16/9] overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.cover}
                    alt={p.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <span className="mb-2 inline-flex w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {p.category}
                  </span>
                  <h2 className="text-lg font-semibold tracking-tight [text-wrap:balance] group-hover:text-primary">
                    {p.title}
                  </h2>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">{p.description}</p>
                  <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {p.readingMinutes} мин
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                      Читать <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <BlogFooter />
    </div>
  );
}
