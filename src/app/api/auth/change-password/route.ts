import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { changePassword } from "@/core/auth/store";

export const runtime = "nodejs";

const schema = z.object({
  oldPassword: z.string().min(1, "Введите текущий пароль.").max(72),
  newPassword: z
    .string()
    .min(8, "Новый пароль должен быть не короче 8 символов.")
    .max(72, "Пароль слишком длинный."),
});

export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    const body = await parseBody(req, schema);
    const result = await changePassword(session.email, body.oldPassword, body.newPassword);
    if (result === "bad_password") throw new AppError("Текущий пароль неверный.", 400);
    return ok({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
