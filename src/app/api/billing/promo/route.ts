import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import {
  redeemPromo,
  activePerks,
  promoEnabled,
  PromoError,
  PromoNotFoundError,
} from "@/core/billing/promo";
import {
  applyInviteCode,
  inviteStatus,
  referralsVisible,
  InviteCodeError,
  InviteCodeNotFound,
} from "@/core/referrals/referrals";
import { peekRateLimit, rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

export const runtime = "nodejs";

const schema = z.object({ code: z.string().min(1).max(40) });

/** неверных кодов подряд с одного аккаунта — защита от перебора */
const MISS_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

/**
 * Применить код (клиент). Поле одно на два вида кодов: сначала пробуем строку
 * как промокод, и только если такого промокода нет — как код приглашения
 * друга. Промокод главнее, потому что его название выбирает владелец, а код
 * приглашения случайный и с промокодами не пересекается (см. getOrCreateCode).
 */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    if (!promoEnabled()) throw new AppError("Промокоды сейчас недоступны.", 503);
    const { code } = await parseBody(req, schema);

    const missKey = `code-miss:${session.email}`;
    if (!peekRateLimit(missKey, MISS_LIMIT).ok) {
      throw new AppError("Слишком много неверных кодов. Попробуйте через час.", 429);
    }

    try {
      const result = await redeemPromo({ code, email: session.email, ip: clientIp(req) });
      return ok(result);
    } catch (err) {
      if (!(err instanceof PromoNotFoundError)) throw err;
    }

    try {
      const invite = await applyInviteCode({ code, email: session.email, ip: clientIp(req) });
      return ok({ type: "invite", message: invite.message });
    } catch (err) {
      if (err instanceof InviteCodeNotFound) {
        rateLimit(missKey, MISS_LIMIT);
        // пока раздел приглашений закрыт, про код приглашения людям не пишем
        throw new AppError(
          referralsVisible(session.role)
            ? "Такого промокода или кода приглашения нет. Проверьте написание."
            : "Такого промокода нет. Проверьте написание.",
          400,
        );
      }
      throw err;
    }
  } catch (err) {
    // отказ по правилам кода — это не сбой сервиса, а понятное сообщение
    if (err instanceof PromoError || err instanceof InviteCodeError) {
      return fail(new AppError(err.message, 400));
    }
    return fail(err);
  }
}

/** Что сейчас действует у пользователя (для страницы баланса). */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    const [perks, invite] = await Promise.all([
      activePerks(session.email),
      inviteStatus(session.email),
    ]);
    return ok({ perks, invite });
  } catch (err) {
    return fail(err);
  }
}
