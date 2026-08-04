import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { listUsers } from "@/core/auth/store";
import { billingEnabled, balancesFor } from "@/core/billing/billing";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    const users = await listUsers();
    const balances = billingEnabled() ? await balancesFor(users.map((u) => u.email)) : {};
    return ok({
      users: users.map((u) => ({
        email: u.email,
        role: u.role,
        verified: u.verified,
        createdAt: u.createdAt,
        balance: billingEnabled() ? (balances[u.email] ?? 0) : null,
      })),
    });
  } catch (err) {
    return fail(err);
  }
}
