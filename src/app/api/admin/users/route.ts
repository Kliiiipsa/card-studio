import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { listUsers } from "@/core/auth/store";
import { billingEnabled, balancesFor } from "@/core/billing/billing";
import { registrationIps } from "@/core/auth/consent";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    const users = await listUsers();
    const emails = users.map((u) => u.email);
    const [balances, ips] = await Promise.all([
      billingEnabled() ? balancesFor(emails) : Promise.resolve({} as Record<string, number>),
      registrationIps(emails),
    ]);
    return ok({
      users: users.map((u) => ({
        email: u.email,
        role: u.role,
        verified: u.verified,
        createdAt: u.createdAt,
        balance: billingEnabled() ? (balances[u.email] ?? 0) : null,
        ip: ips[u.email] ?? null,
      })),
    });
  } catch (err) {
    return fail(err);
  }
}
