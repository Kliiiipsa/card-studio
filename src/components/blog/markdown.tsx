import * as React from "react";

/**
 * Dependency-free Markdown renderer for blog posts (npm ненадёжен в этой среде,
 * поэтому свой парсер — как у юр-документов, но богаче: заголовки h1–h3, списки,
 * картинки, таблицы, **жирный**, [ссылки](url) и цитаты). Поддерживаемого
 * подмножества хватает для статей; всё под нашим контролем.
 */

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "img"; src: string; alt: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "hr" };

const IMG_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const t = line.trim();

    if (!t) {
      flush();
      continue;
    }
    // table: header row followed by a |---|---| separator
    if (t.startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      flush();
      const head = splitRow(t);
      const rows: string[][] = [];
      i += 2; // skip separator
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i].trim()));
        i++;
      }
      i--; // step back, loop will ++
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    if (IMG_RE.test(t)) {
      flush();
      const m = t.match(IMG_RE)!;
      blocks.push({ kind: "img", alt: m[1], src: m[2] });
    } else if (t === "---") {
      flush();
      blocks.push({ kind: "hr" });
    } else if (t.startsWith("### ")) {
      flush();
      blocks.push({ kind: "h3", text: t.slice(4) });
    } else if (t.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: t.slice(3) });
    } else if (t.startsWith("# ")) {
      flush();
      blocks.push({ kind: "h1", text: t.slice(2) });
    } else if (t.startsWith("> ")) {
      flush();
      blocks.push({ kind: "quote", text: t.slice(2) });
    } else if (t.startsWith("- ")) {
      if (para.length) {
        blocks.push({ kind: "p", text: para.join("\n") });
        para = [];
      }
      (list ??= []).push(t.slice(2));
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

/** Inline: **bold**, [text](url), bare https:// links, hard line breaks. */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+|\n)/g);
  parts.forEach((part, i) => {
    if (!part) return;
    if (part === "\n") {
      out.push(<br key={i} />);
      return;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      out.push(<strong key={i}>{part.slice(2, -2)}</strong>);
      return;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      out.push(
        <a key={i} href={link[2]} className="text-primary underline-offset-2 hover:underline">
          {link[1]}
        </a>,
      );
      return;
    }
    if (/^https?:\/\//.test(part)) {
      const href = part.replace(/[.,;]+$/, "");
      out.push(
        <a key={i} href={href} className="text-primary underline-offset-2 hover:underline">
          {href}
        </a>,
      );
      return;
    }
    out.push(part);
  });
  return out;
}

export function Markdown({ md }: { md: string }) {
  const blocks = parse(md);
  return (
    <article className="space-y-4 text-[15px] leading-7 text-foreground/90">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h1":
            return (
              <h1 key={i} className="pt-2 text-2xl font-bold tracking-tight sm:text-3xl [text-wrap:balance]">
                {b.text}
              </h1>
            );
          case "h2":
            return (
              <h2 key={i} className="pt-6 text-xl font-bold tracking-tight [text-wrap:balance]">
                {b.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="pt-3 text-lg font-semibold">
                {b.text}
              </h3>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1.5 pl-6">
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it)}</li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-4 border-primary/40 bg-primary/5 px-4 py-3 text-muted-foreground">
                {inline(b.text)}
              </blockquote>
            );
          case "img":
            return (
              <figure key={i} className="my-6 overflow-hidden rounded-2xl border bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.src} alt={b.alt} loading="lazy" className="w-full" />
                {b.alt && (
                  <figcaption className="border-t px-4 py-2 text-xs text-muted-foreground">{b.alt}</figcaption>
                )}
              </figure>
            );
          case "table":
            return (
              <div key={i} className="my-6 overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      {b.head.map((h, j) => (
                        <th key={j} className="px-3 py-2 font-semibold">
                          {inline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b last:border-0">
                        {r.map((c, k) => (
                          <td key={k} className="px-3 py-2 align-top">
                            {inline(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "hr":
            return <hr key={i} className="my-8 border-t" />;
        }
      })}
    </article>
  );
}
