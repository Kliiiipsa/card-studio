import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, listTransactions } from "@/core/billing/billing";

export const runtime = "nodejs";

/** Full sparks ledger (optionally filtered by ?email=) for the admin. */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!billingEnabled()) return ok({ transactions: [] });
    const email = new URL(req.url).searchParams.get("email") ?? undefined;
    const transactions = await listTransactions({ email, limit: 200 });
    return ok({ transactions });
  } catch (err) {
    return fail(err);
  }
}
