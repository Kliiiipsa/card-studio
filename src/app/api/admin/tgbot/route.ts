import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { botStats } from "@/core/tgbot/limits";
import { attributionSummary } from "@/core/analytics/attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ADMIN: цифры публичного Telegram-бота — люди, проверки, переходы, регистрации. */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    const [stats, sources] = await Promise.all([botStats(), attributionSummary().catch(() => [])]);
    const tg = sources.find((s) => s.source === "telegram");
    return ok({
      ...stats,
      registrations: tg
        ? { registrations: tg.registrations, verified: tg.verified, paying: tg.paying, revenueRub: tg.revenueRub }
        : { registrations: 0, verified: 0, paying: 0, revenueRub: 0 },
    });
  } catch (err) {
    return fail(err);
  }
}
