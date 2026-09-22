import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled } from "@/core/billing/billing";
import { buildSpendReport } from "@/core/billing/spend-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * «Расходы» в админке: подарочные и оплаченные гены по дням, себестоимость
 * fal в рублях. ?days=7|30|90, ?all=1 — включая тестовые аккаунты.
 */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!billingEnabled()) throw new AppError("Биллинг не настроен.", 503);
    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") ?? 30);
    const includeHidden = url.searchParams.get("all") === "1";
    const report = await buildSpendReport({
      days: Number.isFinite(days) ? days : 30,
      includeHidden,
    });
    return ok(report);
  } catch (err) {
    return fail(err);
  }
}
