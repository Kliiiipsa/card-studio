import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import {
  listMarketingConsents,
  marketingSubscribers,
} from "@/core/auth/marketing-consent";
import { isHiddenAccount } from "@/core/auth/hidden-accounts";

export const runtime = "nodejs";

/** ADMIN: журнал согласий на рассылку + текущее число подписчиков. */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);

    const [rows, subs] = await Promise.all([listMarketingConsents(), marketingSubscribers()]);
    return ok({
      subscribers: subs.filter((e) => !isHiddenAccount(e)).length,
      rows: rows.filter((r) => !isHiddenAccount(r.email)),
    });
  } catch (err) {
    return fail(err);
  }
}
