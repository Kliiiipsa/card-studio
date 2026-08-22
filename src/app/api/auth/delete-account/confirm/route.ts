import { z } from "zod";
import { NextResponse } from "next/server";
import { parseBody, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest, SESSION_COOKIE } from "@/core/auth/session";
import { checkDeletionCode, eraseAccount } from "@/core/auth/deletion";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().regex(/^\d{6}$/, "Код — 6 цифр из письма."),
});

/** Шаг 2: код верный → аккаунт и персональные данные стираются, сессия закрывается. */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    if (session.role === "admin") {
      throw new AppError("Аккаунт администратора удалить нельзя.", 400);
    }
    const body = await parseBody(req, schema);

    const check = await checkDeletionCode(session.email, body.code);
    switch (check.status) {
      case "invalid":
        throw new AppError(`Неверный код. Осталось попыток: ${check.attemptsLeft}.`, 400);
      case "expired":
        throw new AppError("Код истёк или попытки исчерпаны. Запросите новый код.", 410);
      case "not_found":
        throw new AppError("Запрос на удаление не найден. Начните заново.", 404);
      case "ok":
        break;
    }

    await eraseAccount(session.email);

    const res = NextResponse.json({ deleted: true });
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    return fail(err);
  }
}
