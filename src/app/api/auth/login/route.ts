import { z } from "zod";
import { parseBody, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { checkLogin } from "@/core/auth/store";
import { respondWithSession } from "@/core/auth/cookies";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().min(3).max(120),
  password: z.string().min(1, "Введите пароль.").max(72),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema);
    const result = await checkLogin(body.email, body.password);
    switch (result.status) {
      case "ok":
        return respondWithSession({ ok: true, role: result.user.role }, result.user);
      case "locked":
        throw new AppError(
          `Слишком много неудачных попыток. Повторите через ${Math.ceil(result.retryInSec / 60)} мин.`,
          429,
        );
      case "bad_credentials":
        throw new AppError("Неверная почта или пароль.", 401);
    }
  } catch (err) {
    return fail(err);
  }
}
