import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { listUsers } from "@/core/auth/store";
import { billingEnabled, balancesFor } from "@/core/billing/billing";
import { registrationIps } from "@/core/auth/consent";
import { isHiddenAccount } from "@/core/auth/hidden-accounts";
import { attributionFor } from "@/core/analytics/attribution";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    // По умолчанию прячем аккаунты владельца/тестовые; ?all=1 показывает всё.
    const showAll = new URL(req.url).searchParams.get("all") === "1";
    const allUsers = await listUsers();
    const hiddenCount = allUsers.filter((u) => isHiddenAccount(u.email)).length;
    const users = showAll ? allUsers : allUsers.filter((u) => !isHiddenAccount(u.email));
    const emails = users.map((u) => u.email);
    const [balances, ips, attr] = await Promise.all([
      billingEnabled() ? balancesFor(emails) : Promise.resolve({} as Record<string, number>),
      registrationIps(emails),
      attributionFor(emails).catch(() => ({}) as Awaited<ReturnType<typeof attributionFor>>),
    ]);
    return ok({
      users: users.map((u) => ({
        email: u.email,
        role: u.role,
        verified: u.verified,
        createdAt: u.createdAt,
        balance: billingEnabled() ? (balances[u.email] ?? 0) : null,
        ip: ips[u.email] ?? null,
        // откуда пришёл: UTM-метки первого визита, страница входа, реферер
        source: attr[u.email]?.source ?? null,
        medium: attr[u.email]?.medium ?? null,
        campaign: attr[u.email]?.campaign ?? null,
        landing: attr[u.email]?.landing ?? null,
        referrer: attr[u.email]?.referrer ?? null,
      })),
      hiddenCount,
    });
  } catch (err) {
    return fail(err);
  }
}
