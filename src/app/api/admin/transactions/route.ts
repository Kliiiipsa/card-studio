import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, listTransactions } from "@/core/billing/billing";
import { isHiddenAccount } from "@/core/auth/hidden-accounts";

export const runtime = "nodejs";

/** Full sparks ledger (optionally filtered by ?email=) for the admin. */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!billingEnabled()) return ok({ transactions: [] });
    const url = new URL(req.url);
    const email = url.searchParams.get("email") ?? undefined;
    const showAll = url.searchParams.get("all") === "1";
    const rows = await listTransactions({ email, limit: 200 });
    // Прячем транзакции тестовых/владельческих аккаунтов по умолчанию.
    // Если админ явно смотрит одну почту (?email=) — показываем как есть.
    const transactions =
      email || showAll ? rows : rows.filter((t) => !isHiddenAccount(t.email));
    return ok({ transactions });
  } catch (err) {
    return fail(err);
  }
}
