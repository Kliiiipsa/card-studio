import * as React from "react";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Gem } from "lucide-react";

/**
 * Renders a legal document from content/legal/<slug>.md. The three documents
 * only use a tiny markdown subset (headings, paragraphs, bullet lists, **bold**,
 * bare URLs), so a hand-rolled renderer keeps us dependency-free (npm is
 * unreliable in this environment) and the output fully under our control.
 */
export type LegalSlug = "terms" | "offer" | "privacy";

export const LEGAL_TITLES: Record<LegalSlug, string> = {
  terms: "Пользовательское соглашение",
  offer: "Публичная оферта",
  privacy: "Политика обработки персональных данных",
};

export function readLegal(slug: LegalSlug): string {
  return readFileSync(join(process.cwd(), "content", "legal", `${slug}.md`), "utf8");
}

type Block =
  | { kind: "h1" | "h2"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] };

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) {
      blocks.push({ kind: "p", text: para.join("\n") });
      para = [];
    }
    if (list) {
      blocks.push({ kind: "ul", items: list });
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith("# ")) {
      flush();
      blocks.push({ kind: "h1", text: line.slice(2) });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: line.slice(3) });
    } else if (line.startsWith("- ")) {
      if (para.length) {
        blocks.push({ kind: "p", text: para.join("\n") });
        para = [];
      }
      (list ??= []).push(line.slice(2));
    } else {
      if (list) {
        blocks.push({ kind: "ul", items: list });
        list = null;
      }
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** Inline: **bold**, bare https:// links, and hard line breaks inside a paragraph. */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+|\n)/g);
  parts.forEach((part, i) => {
    if (!part) return;
    if (part === "\n") out.push(<br key={i} />);
    else if (part.startsWith("**") && part.endsWith("**"))
      out.push(<strong key={i}>{part.slice(2, -2)}</strong>);
    else if (/^https?:\/\//.test(part)) {
      const href = part.replace(/[.,;]+$/, "");
      const trail = part.slice(href.length);
      out.push(
        <React.Fragment key={i}>
          <a href={href} className="text-primary underline-offset-2 hover:underline">
            {href}
          </a>
          {trail}
        </React.Fragment>,
      );
    } else out.push(part);
  });
  return out;
}

export function LegalDocument({ slug }: { slug: LegalSlug }) {
  const blocks = parse(readLegal(slug));
  const others = (Object.keys(LEGAL_TITLES) as LegalSlug[]).filter((s) => s !== slug);
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
          {others.map((s) => (
            <Link key={s} href={`/${s}`} className="hover:text-foreground">
              {LEGAL_TITLES[s]}
            </Link>
          ))}
        </nav>
      </header>
      <main className="container max-w-3xl pb-20 pt-6">
        <article className="space-y-4 text-[15px] leading-7">
          {blocks.map((b, i) => {
            if (b.kind === "h1")
              return (
                <h1 key={i} className="text-2xl font-bold tracking-tight sm:text-3xl [text-wrap:balance]">
                  {b.text}
                </h1>
              );
            if (b.kind === "h2")
              return (
                <h2 key={i} className="pt-4 text-lg font-semibold">
                  {b.text}
                </h2>
              );
            if (b.kind === "ul")
              return (
                <ul key={i} className="list-disc space-y-1 pl-6">
                  {b.items.map((it, j) => (
                    <li key={j}>{inline(it)}</li>
                  ))}
                </ul>
              );
            return <p key={i}>{inline(b.text)}</p>;
          })}
        </article>
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
          Конфиденциальность
        </Link>
      </footer>
    </div>
  );
}
