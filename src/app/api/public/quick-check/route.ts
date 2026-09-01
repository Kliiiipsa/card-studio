import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { analyzeProductCard } from "@/core/ai/service";
import { validateDataUrl } from "@/lib/image-validation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * ПУБЛИЧНАЯ бесплатная экспресс-проверка карточки (лид-магнит на /check).
 * Без логина, поэтому эндпоинт защищён лимитами, а наружу уходит только ТИЗЕР отчёта:
 * общий балл + диагноз + один совет. Полный разбор сознательно НЕ покидает
 * сервер — иначе блюр на клиенте обходится через DevTools.
 */

const bodySchema = z.object({ imageDataUrl: z.string().min(1) });

/* ------------------------- лимиты против абьюза ------------------------- */
// Один инстанс на Timeweb → in-memory достаточно; рестарт сбрасывает счётчики,
// это осознанный компромисс (хуже не станет — лимит просто начнётся заново).
const PER_IP_PER_DAY = 3;
const GLOBAL_PER_DAY = 300; // потолок расходов на LLM в худший день — копейки

const ipCounts = new Map<string, number>();
let globalCount = 0;
let dayKey = "";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkLimits(ip: string): void {
  const today = todayKey();
  if (dayKey !== today) {
    dayKey = today;
    ipCounts.clear();
    globalCount = 0;
  }
  if (globalCount >= GLOBAL_PER_DAY) {
    throw new AppError(
      "Бесплатные проверки на сегодня закончились — попробуйте завтра или зарегистрируйтесь: внутри анализ полнее и без очереди.",
      429,
    );
  }
  const used = ipCounts.get(ip) ?? 0;
  if (used >= PER_IP_PER_DAY) {
    throw new AppError(
      "Лимит бесплатных проверок на сегодня исчерпан (3 в день). Зарегистрируйтесь — внутри полный разбор и 20 генов в подарок.",
      429,
    );
  }
  ipCounts.set(ip, used + 1);
  globalCount += 1;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, bodySchema);
    validateDataUrl(body.imageDataUrl);
    checkLimits(clientIp(req));

    const report = await analyzeProductCard(body.imageDataUrl);

    // Один лучший совет: самая тяжёлая проблема, иначе главная проблема отчёта
    const top =
      report.problems.find((p) => p.severity === "high") ?? report.problems[0] ?? null;
    const tip = top
      ? { issue: top.issue, fix: top.fix }
      : { issue: report.mainProblem, fix: "" };

    // Счётчики «что ещё нашли» — для замка в интерфейсе (сам контент не отдаём)
    const locked = {
      problems: Math.max(0, report.problems.length - 1),
      headlineIdeas: report.headlineIdeas.length,
      benefitTexts: report.benefitTexts.length,
      textRewrites: report.textRewrites.length,
      visualTips: report.visualTips.length,
      newCardIdeas: report.newCardIdeas.length,
    };

    return ok({
      score: report.scores.total,
      diagnosis: report.diagnosis,
      thumbnail: report.thumbnailTest,
      tip,
      locked,
    });
  } catch (err) {
    return fail(err);
  }
}
