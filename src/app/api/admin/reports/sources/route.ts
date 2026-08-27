import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { attributionSummary } from "@/core/analytics/attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ADMIN: сводка регистраций/оплат по каналам (UTM-источникам). Отвечает на
 * вопрос «какой канал приносит платящих и почём» — CAC считаете, поделив
 * расход канала на число платящих из него.
 */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    const rows = await attributionSummary();
    return ok({ rows });
  } catch (err) {
    return fail(err);
  }
}
