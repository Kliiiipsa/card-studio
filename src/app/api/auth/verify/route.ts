import { z } from "zod";
import { parseBody, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { confirmRegistration } from "@/core/auth/store";
import { respondWithSession } from "@/core/auth/cookies";
import { grantWelcomeBonus } from "@/core/billing/welcome";
import { recordConsent } from "@/core/auth/consent";
import { recordMarketingConsent } from "@/core/auth/marketing-consent";
import { clientIp } from "@/lib/request-ip";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().min(3).max(120),
  code: z.string().regex(/^\d{6}$/, "Код — 6 цифр из письма."),
  /** необязательная галочка «получать советы и новости» с формы регистрации */
  newsletter: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    // лимит по IP: код 6-значный, без лимита его можно перебирать (аудит 2026-08-26).
    // Поэкаунтный лимит попыток кода есть в store, это второй слой по IP.
    enforceRateLimit(`verify:${ip ?? "unknown"}`, {
      limit: 30,
      windowMs: 10 * 60_000,
      message: "Слишком много попыток. Повторите позже.",
    });
    const body = await parseBody(req, schema);
    const result = await confirmRegistration(body.email, body.code);
    switch (result.status) {
      case "ok": {
        // the consent checkbox was ticked on the form step that started this
        // registration (server-enforced in /register); journal it on completion
        await recordConsent({
          email: result.user.email,
          ip,
          userAgent: req.headers.get("user-agent"),
        });
        // отдельное ДОБРОВОЛЬНОЕ согласие на рассылку (ст. 18 закона «О рекламе»)
        if (body.newsletter) {
          await recordMarketingConsent({
            email: result.user.email,
            granted: true,
            ip,
            userAgent: req.headers.get("user-agent"),
          });
        }
        const balance = await grantWelcomeBonus(result.user.email);
        return respondWithSession({ ok: true, balance: balance ?? undefined }, result.user);
      }
      case "invalid":
        throw new AppError(`Неверный код. Осталось попыток: ${result.attemptsLeft}.`, 400);
      case "expired":
        throw new AppError("Код истёк или попытки исчерпаны. Запросите новый код.", 410);
      case "not_found":
        throw new AppError("Регистрация не найдена. Начните заново.", 404);
    }
  } catch (err) {
    return fail(err);
  }
}
