import "server-only";
import { getLLMProvider } from "@/core/ai/providers";

/**
 * ИИ-советник по рекламе (кнопка «Получить анализ» в админке): по read-only
 * OAuth-токену (env YANDEX_ADS_TOKEN, scopes direct:api + metrika:read) тянет
 * НАСТРОЙКИ кампаний и статистику Директа + цели Метрики, сшивает и просит LLM
 * дать оценку и советы. Жёсткое правило промпта: каждый совет — со ссылкой на
 * цифру, «данных мало» — говорить прямо, ничего не выдумывать.
 *
 * Директ может быть ещё не подключён (заявка на API не одобрена) — тогда
 * анализ честно строится только по Метрике, а блок Директа помечается
 * «недоступен» с причиной.
 */

const DIRECT_API = "https://api.direct.yandex.com/json/v5";
const METRIKA_API = "https://api-metrika.yandex.net";
const COUNTER = process.env.METRIKA_COUNTER ?? "111825975";

function token(): string {
  return process.env.YANDEX_ADS_TOKEN ?? "";
}

export function adsAdvisorEnabled(): boolean {
  return Boolean(token());
}

/* ------------------------------- Директ ------------------------------- */

async function directCall(resource: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${DIRECT_API}/${resource}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      "Accept-Language": "ru",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return res.json();
}

type DirectError = { error_code?: number; error_detail?: string; error_string?: string };

function directErrorText(e: DirectError | undefined): string {
  if (!e) return "неизвестная ошибка";
  return `${e.error_string ?? ""} ${e.error_detail ?? ""}`.trim() || `код ${e.error_code}`;
}

/** Настройки кампаний: стратегия, бюджет, минус-слова — то, что оценивает ИИ. */
async function fetchCampaigns(): Promise<{ text: string; ok: boolean }> {
  const data = (await directCall("campaigns", {
    method: "get",
    params: {
      SelectionCriteria: {},
      FieldNames: ["Id", "Name", "State", "Status", "Type", "DailyBudget", "NegativeKeywords", "StartDate"],
      TextCampaignFieldNames: ["BiddingStrategy", "Settings"],
    },
  })) as { result?: { Campaigns?: Record<string, unknown>[] }; error?: DirectError };
  if (!data.result) return { text: `Директ недоступен: ${directErrorText(data.error)}`, ok: false };
  const rows = (data.result.Campaigns ?? []).map((c) => JSON.stringify(c));
  return { text: rows.length ? rows.join("\n") : "Кампаний нет.", ok: true };
}

/** Отчёт Reports API (TSV). 201/202 = отчёт готовится офлайн — ждём и повторяем. */
async function fetchReport(definition: Record<string, unknown>): Promise<{ text: string; ok: boolean }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${DIRECT_API}/reports`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
        "Accept-Language": "ru",
        processingMode: "auto",
        returnMoneyInMicros: "false",
        skipReportHeader: "true",
        skipReportSummary: "true",
      },
      body: JSON.stringify({ params: definition }),
      cache: "no-store",
    });
    if (res.status === 200) return { text: (await res.text()).trim() || "(пусто)", ok: true };
    if (res.status === 201 || res.status === 202) {
      const wait = Number(res.headers.get("retryIn") ?? 5);
      await new Promise((r) => setTimeout(r, Math.min(wait, 15) * 1000));
      continue;
    }
    const err = (await res.json().catch(() => ({}))) as { error?: DirectError };
    return { text: `Отчёт Директа недоступен: ${directErrorText(err.error)}`, ok: false };
  }
  return { text: "Отчёт Директа не успел построиться — попробуйте ещё раз.", ok: false };
}

const campaignStatsReport = () =>
  fetchReport({
    SelectionCriteria: {},
    FieldNames: ["CampaignName", "Impressions", "Clicks", "Ctr", "Cost", "AvgCpc"],
    ReportName: `camp-stats-${Date.now()}`,
    ReportType: "CAMPAIGN_PERFORMANCE_REPORT",
    DateRangeType: "LAST_30_DAYS",
    Format: "TSV",
    IncludeVAT: "YES",
  });

const searchQueriesReport = () =>
  fetchReport({
    SelectionCriteria: {},
    FieldNames: ["Query", "Impressions", "Clicks", "Cost"],
    ReportName: `queries-${Date.now()}`,
    ReportType: "SEARCH_QUERY_PERFORMANCE_REPORT",
    DateRangeType: "LAST_30_DAYS",
    Format: "TSV",
    IncludeVAT: "YES",
  });

/* ------------------------------- Метрика ------------------------------- */

async function metrikaGet(path: string): Promise<unknown> {
  const res = await fetch(`${METRIKA_API}${path}`, {
    headers: { Authorization: `OAuth ${token()}` },
    cache: "no-store",
  });
  return res.json();
}

/** Сводка Метрики: трафик по источникам/кампаниям + достижение целей. */
async function fetchMetrika(): Promise<{ text: string; ok: boolean }> {
  try {
    const goalsData = (await metrikaGet(`/management/v1/counter/${COUNTER}/goals`)) as {
      goals?: { id: number; name: string }[];
    };
    const goals = goalsData.goals ?? [];

    const traffic = (await metrikaGet(
      `/stat/v1/data?ids=${COUNTER}&dimensions=ym:s:lastUTMSource,ym:s:lastUTMCampaign&metrics=ym:s:visits,ym:s:users&date1=30daysAgo&date2=yesterday&limit=25`,
    )) as { data?: { dimensions: { name: string }[]; metrics: number[] }[] };
    const trafficRows = (traffic.data ?? []).map(
      (r) => `${r.dimensions.map((d) => d.name || "(нет)").join(" / ")}: визиты ${r.metrics[0]}, юзеры ${r.metrics[1]}`,
    );

    // конверсии по каждой цели в разрезе кампаний (только цели с достижениями)
    const goalLines: string[] = [];
    for (const g of goals.slice(0, 8)) {
      const conv = (await metrikaGet(
        `/stat/v1/data?ids=${COUNTER}&dimensions=ym:s:lastUTMSource,ym:s:lastUTMCampaign&metrics=ym:s:goal${g.id}reaches&date1=30daysAgo&date2=yesterday&limit=15`,
      )) as { data?: { dimensions: { name: string }[]; metrics: number[] }[]; totals?: number[] };
      const total = conv.totals?.[0] ?? 0;
      if (!total) continue;
      const per = (conv.data ?? [])
        .filter((r) => r.metrics[0] > 0)
        .map((r) => `${r.dimensions.map((d) => d.name || "(нет)").join("/")}: ${r.metrics[0]}`)
        .join("; ");
      goalLines.push(`Цель «${g.name}»: всего ${total}. По источникам: ${per || "-"}`);
    }

    return {
      ok: true,
      text: [
        "ТРАФИК ЗА 30 ДНЕЙ по источник/кампания:",
        ...trafficRows,
        "",
        "ДОСТИЖЕНИЯ ЦЕЛЕЙ ЗА 30 ДНЕЙ:",
        ...(goalLines.length ? goalLines : ["достижений целей нет"]),
      ].join("\n"),
    };
  } catch (e) {
    return { ok: false, text: `Метрика недоступна: ${e instanceof Error ? e.message : "ошибка"}` };
  }
}

/* -------------------------------- анализ -------------------------------- */

export type AdsAnalysis = {
  report: string;
  sources: { direct: boolean; metrika: boolean };
  generatedAt: string;
};

export async function analyzeAds(): Promise<AdsAnalysis> {
  const [campaigns, stats, queries, metrika] = await Promise.all([
    fetchCampaigns(),
    campaignStatsReport(),
    searchQueriesReport(),
    fetchMetrika(),
  ]);

  const llm = getLLMProvider();
  const result = await llm.complete({
    task: "analyze",
    temperature: 0,
    maxTokens: 3000,
    messages: [
      {
        role: "system",
        content: `Ты — опытный performance-маркетолог. Анализируешь рекламу сервиса Kartogen (kartogen.ru — ИИ-генерация карточек для маркетплейсов; клиент = селлер WB/Ozon; регистрация бесплатная, монетизация — пополнение баланса «генов», 1 ген = 1 ₽; цель рекламы — регистрации и платящие).
ЖЕЛЕЗНЫЕ ПРАВИЛА:
1) Каждый совет обязан ссылаться на конкретную цифру из данных ниже. Совет без цифры — не давать.
2) Если данных для вывода мало — прямо пиши «данных мало», не выдумывай.
3) Если какой-то источник данных недоступен — скажи об этом в начале и анализируй остальное.
4) Не пересказывай данные — только выводы и действия.
Формат ответа (markdown, по-русски):
## Оценка (X/10) — одна строка почему
## Что хорошо — до 3 пунктов
## Проблемы — по убыванию потерь денег, с цифрами
## Действия на эту неделю — нумерованный список конкретных шагов (что нажать/изменить)
## Кандидаты в минус-слова — если видны запросы с расходом без пользы`,
      },
      {
        role: "user",
        content: `ДАННЫЕ.

=== НАСТРОЙКИ КАМПАНИЙ ДИРЕКТА (JSON построчно) ===
${campaigns.text.slice(0, 6000)}

=== СТАТИСТИКА ДИРЕКТА ЗА 30 ДНЕЙ (TSV: кампания, показы, клики, CTR, расход, ср.CPC) ===
${stats.text.slice(0, 4000)}

=== ПОИСКОВЫЕ ЗАПРОСЫ ЗА 30 ДНЕЙ (TSV: запрос, показы, клики, расход) ===
${queries.text.slice(0, 5000)}

=== МЕТРИКА (счётчик ${COUNTER}) ===
${metrika.text.slice(0, 5000)}`,
      },
    ],
  });

  return {
    report: result.text.trim(),
    sources: { direct: campaigns.ok, metrika: metrika.ok },
    generatedAt: new Date().toISOString(),
  };
}
