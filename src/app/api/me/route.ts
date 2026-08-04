import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, getBalance } from "@/core/billing/billing";

export const runtime = "nodejs";

/** Who am I + sparks balance (null when billing is disabled or user is admin-free). */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    const balance =
      billingEnabled() && session.role !== "admin" ? await getBalance(session.email) : null;
    return ok({ email: session.email, role: session.role, balance });
  } catch (err) {
    return fail(err);
  }
}
