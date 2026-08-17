import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { isSmtpConfigured, sendVerificationEmail } from "@/core/auth/mailer";

export const runtime = "nodejs";

/** Admin-only: send a test verification email to prove SMTP works from prod. */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!isSmtpConfigured()) throw new AppError("SMTP не настроен (нет SMTP_HOST/USER/PASS).", 400);
    const { to } = (await req.json().catch(() => ({}))) as { to?: string };
    const target = to ?? session.email;
    await sendVerificationEmail(target, "000000");
    return ok({ sent: true, to: target });
  } catch (err) {
    return fail(err);
  }
}
