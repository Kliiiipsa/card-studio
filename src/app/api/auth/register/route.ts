import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { validateRussianEmail, normalizeEmail } from "@/core/auth/domains";
import { startRegistration, confirmRegistration } from "@/core/auth/store";
import { isSmtpConfigured, sendVerificationEmail } from "@/core/auth/mailer";
import { respondWithSession } from "@/core/auth/cookies";
import { grantWelcomeBonus } from "@/core/billing/welcome";
import { recordConsent } from "@/core/auth/consent";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().min(3).max(120),
  password: z
    .string()
    .min(8, "Пароль должен быть не короче 8 символов.")
    .max(72, "Пароль слишком длинный."),
  inviteCode: z.string().max(64).optional(),
  acceptTerms: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    if (!process.env.AUTH_SECRET) {
      throw new AppError("Регистрация не настроена: AUTH_SECRET не задан.", 500);
    }
    const body = await parseBody(req, schema);
    // Explicit consent is required server-side too — the checkbox alone can be
    // bypassed by a crafted request, and 152-ФЗ wants a real affirmative act.
    if (body.acceptTerms !== true) {
      throw new AppError(
        "Для регистрации необходимо принять Пользовательское соглашение и Политику обработки персональных данных.",
        400,
      );
    }
    // Тестовый режим: пока сервис не открыт публично, регистрация только по
    // инвайт-коду — чтобы посторонние не оставляли свои email (обязательства
    // по ПДн наступают с первого чужого адреса). Убрать код = убрать env.
    const invite = process.env.REGISTRATION_INVITE_CODE;
    if (invite && (body.inviteCode ?? "").trim() !== invite) {
      throw new AppError(
        "Сервис в закрытом тестировании — регистрация по инвайт-коду. Напишите нам, чтобы получить доступ.",
        403,
      );
    }
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

    // Open mode (temporary, until SMTP): the account is created right away,
    // no email code — the server confirms the registration itself.
    if (process.env.REGISTRATION_OPEN === "true") {
      const confirmed = await confirmRegistration(email, started.code);
      if (confirmed.status !== "ok") {
        throw new AppError("Не удалось создать аккаунт. Попробуйте ещё раз.", 500);
      }
      await recordConsent({
        email,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent"),
      });
      const balance = await grantWelcomeBonus(email);
      return respondWithSession({ registered: true, balance: balance ?? undefined }, confirmed.user);
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
