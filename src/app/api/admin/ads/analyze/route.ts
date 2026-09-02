import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { adsAdvisorEnabled, analyzeAds } from "@/core/ads/ads-advisor";

export const runtime = "nodejs";
// Директ-отчёты могут строиться офлайн с ретраями + LLM-разбор — даём запас
export const maxDuration = 120;

/** ADMIN: ИИ-анализ рекламы по кнопке (настройки Директа + статистика + Метрика). */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!adsAdvisorEnabled()) {
      throw new AppError("Не задан YANDEX_ADS_TOKEN — советник по рекламе выключен.", 503);
    }
    return ok(await analyzeAds());
  } catch (err) {
    return fail(err);
  }
}
