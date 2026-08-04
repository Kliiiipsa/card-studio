import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, listTransactions } from "@/core/billing/billing";

export const runtime = "nodejs";

/** The caller's own sparks history. */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    if (!billingEnabled()) return ok({ transactions: [] });
    const transactions = await listTransactions({ email: session.email, limit: 100 });
    return ok({ transactions });
  } catch (err) {
    return fail(err);
  }
}
