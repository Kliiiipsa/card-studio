import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { startDeletion } from "@/core/auth/deletion";
import { isSmtpConfigured, sendDeletionEmail } from "@/core/auth/mailer";

export const runtime = "nodejs";

/** Шаг 1 удаления аккаунта: отправить код подтверждения на почту владельца. */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    // Админ создаётся из env и пересоздался бы после удаления — запрещаем,
    // заодно это защита от случайного сноса собственного служебного аккаунта.
    if (session.role === "admin") {
      throw new AppError("Аккаунт администратора удалить нельзя.", 400);
    }

    const started = await startDeletion(session.email);
    if (started.status === "cooldown") {
      throw new AppError(
        `Код уже отправлен. Повторная отправка через ${started.retryInSec} с.`,
        429,
      );
    }

    if (isSmtpConfigured()) {
      await sendDeletionEmail(session.email, started.code);
      return ok({ sent: true });
    }
    // Локальная разработка без почты: код в консоль и в ответ, как при регистрации.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log(`[auth] dev deletion code for ${session.email}: ${started.code}`);
      return ok({ sent: false, devCode: started.code });
    }
    throw new AppError("Отправка почты не настроена. Обратитесь к администратору.", 500);
  } catch (err) {
    return fail(err);
  }
}
