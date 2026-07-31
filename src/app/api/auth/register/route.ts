import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { validateRussianEmail, normalizeEmail } from "@/core/auth/domains";
import { startRegistration } from "@/core/auth/store";
import { isSmtpConfigured, sendVerificationEmail } from "@/core/auth/mailer";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().min(3).max(120),
  password: z
    .string()
    .min(8, "Пароль должен быть не короче 8 символов.")
    .max(72, "Пароль слишком длинный."),
});

export async function POST(req: Request) {
  try {
    if (!process.env.AUTH_SECRET) {
      throw new AppError("Регистрация не настроена: AUTH_SECRET не задан.", 500);
    }
    const body = await parseBody(req, schema);
    const emailError = validateRussianEmail(body.email);
    if (emailError) throw new AppError(emailError);
    const email = normalizeEmail(body.email);

    const started = await startRegistration(email, body.password);
    if (started.status === "exists") {
      throw new AppError("Эта почта уже зарегистрирована — войдите с паролем.", 409);
    }
    if (started.status === "cooldown") {
      throw new AppError(
        `Код уже отправлен. Повторная отправка через ${started.retryInSec} с.`,
        429,
      );
    }

    if (isSmtpConfigured()) {
      await sendVerificationEmail(email, started.code);
      return ok({ sent: true });
    }
    // Local testing without a mailbox: never in production.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log(`[auth] dev verification code for ${email}: ${started.code}`);
      return ok({ sent: false, devCode: started.code });
    }
    throw new AppError("Отправка почты не настроена. Обратитесь к администратору.", 500);
  } catch (err) {
    return fail(err);
  }
}
