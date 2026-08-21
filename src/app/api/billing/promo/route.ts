import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { redeemPromo, activePerks, promoEnabled, PromoError } from "@/core/billing/promo";
import { clientIp } from "@/lib/request-ip";

export const runtime = "nodejs";

const schema = z.object({ code: z.string().min(1).max(40) });

/** Применить промокод (клиент). */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    if (!promoEnabled()) throw new AppError("Промокоды сейчас недоступны.", 503);
    const { code } = await parseBody(req, schema);
    const result = await redeemPromo({
      code,
      email: session.email,
      ip: clientIp(req),
    });
    return ok(result);
  } catch (err) {
    // отказ по правилам промокода — это не сбой сервиса, а понятное сообщение
    if (err instanceof PromoError) return fail(new AppError(err.message, 400));
    return fail(err);
  }
}

/** Что сейчас действует у пользователя (для страницы баланса). */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    return ok({ perks: await activePerks(session.email) });
  } catch (err) {
    return fail(err);
  }
}
