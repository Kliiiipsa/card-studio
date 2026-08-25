import "server-only";

/**
 * Живые подсказки поиска Wildberries — то, что реально набирают покупатели.
 * Эндпоинт v9 на search.wb.ru отвечает БЕЗ cookie (проверено 2026-08-25;
 * вариант на www.wildberries.ru/__internal требует анти-бот куки — не наш).
 * Порядок подсказок ≈ популярность запроса, точных частот WB не отдаёт.
 *
 * Правило: это неофициальный API — любой сбой возвращает пустой список,
 * генерация SEO обязана работать и без подсказок.
 */

/** Несколько «прощупываний» → общий список без дублей, по порядку WB. */
export async function fetchWbSuggestions(queries: string[]): Promise<string[]> {
  const probes = queries.map((q) => q.trim()).filter(Boolean).slice(0, 4);
  if (!probes.length) return [];
  const results = await Promise.all(probes.map(fetchOne));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of results) {
    for (const s of list) {
      const key = s.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out.slice(0, 30);
}

type HintResponse = {
  bl?: { t?: string; el?: { txt?: string; in?: string }[] }[];
};

async function fetchOne(query: string): Promise<string[]> {
  try {
    const url =
      "https://search.wb.ru/suggests/api/v9/hint" +
      `?ab_testing=false&gender=common&locale=ru&lang=ru&appType=1&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        accept: "*/*",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36",
        referer: "https://www.wildberries.ru/",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as HintResponse;
    const out: string[] = [];
    for (const block of data.bl ?? []) {
      for (const el of block.el ?? []) {
        // sugg: txt — готовый запрос целиком; tag: in — запрос + уточнение
        const text = (block.t === "tag" ? el.in : el.txt)?.trim();
        if (text) out.push(text);
      }
    }
    return out;
  } catch (e) {
    console.error("[wb-suggest]", query, e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Прощупывания под товар: само название, название + аудитория (усечённая
 * основа — саджест сам доскажет правильное окончание: «худи женск» →
 * «худи женское»), название + сезон, категория.
 */
export function buildProbeQueries(input: {
  productName: string;
  category?: string;
  audience?: string;
  season?: string;
}): string[] {
  const AUDIENCE_STEM: Record<string, string> = {
    women: "женск",
    men: "мужск",
    kids: "детск",
    unisex: "",
  };
  const stem = AUDIENCE_STEM[input.audience ?? ""] ?? "";
  return [
    input.productName,
    stem ? `${input.productName} ${stem}` : "",
    input.season ? `${input.productName} ${input.season}` : "",
    input.category && input.category.toLowerCase() !== input.productName.toLowerCase()
      ? input.category
      : "",
  ].filter(Boolean);
}
