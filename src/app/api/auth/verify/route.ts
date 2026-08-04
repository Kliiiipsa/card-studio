import { z } from "zod";
import { parseBody, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { confirmRegistration } from "@/core/auth/store";
import { respondWithSession } from "@/core/auth/cookies";
import { grantWelcomeBonus } from "@/core/billing/welcome";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().min(3).max(120),
  code: z.string().regex(/^\d{6}$/, "Код — 6 цифр из письма."),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema);
    const result = await confirmRegistration(body.email, body.code);
    switch (result.status) {
      case "ok": {
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
