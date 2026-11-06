import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { ackAuditFinding, billingEnabled } from "@/core/billing/billing";
import { runMoneyAudit } from "@/core/billing/money-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * ADMIN: сверка денег вручную.
 *  GET  — прогнать сверку сейчас и вернуть все расхождения за окно, включая
 *         уже принятые (тревога не шлётся: её шлёт только фоновый прогон).
 *  POST — «Принято»: владелец разобрал случай, больше не показывать.
 */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!billingEnabled()) return ok({ findings: [], open: [], paymentsChecked: false });
    return ok(await runMoneyAudit());
  } catch (err) {
    return fail(err);
  }
}

const schema = z.object({ key: z.string().min(1).max(300) });

export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    const { key } = await parseBody(req, schema);
    const acked = await ackAuditFinding(key);
    return ok({ acked });
  } catch (err) {
    return fail(err);
  }
}
