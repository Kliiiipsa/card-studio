import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { saveTicket } from "@/core/support/support";
import { notifyOwner } from "@/core/notify/owner";

export const runtime = "nodejs";

const schema = z.object({
  subject: z.string().trim().max(200).default(""),
  message: z.string().trim().min(5, "Опишите вопрос подробнее.").max(4000),
});

export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    // защита от спама: не больше 5 обращений за 10 минут с аккаунта
    enforceRateLimit(`support:${session.email}`, {
      limit: 5,
      windowMs: 10 * 60_000,
      message: "Вы отправили несколько обращений подряд. Мы уже их видим — ответим на почту.",
    });
    const body = await parseBody(req, schema);

    const subject = body.subject ?? "";
    const id = await saveTicket({
      email: session.email,
      subject,
      message: body.message,
    });

    // уведомление владельцу (почта + Telegram), best-effort и НЕ блокируя клиента:
    // на постоянном next-start сервере промис досчитывается в фоне после ответа.
    const parts = [`От: ${session.email}`];
    if (subject) parts.push(`Тема: ${subject}`);
    parts.push("", body.message);
    if (id) parts.push("", `#${id}`);
    void notifyOwner("🆘 Новое обращение в поддержку", parts.join("\n")).catch(() => undefined);

    return ok({ sent: true });
  } catch (err) {
    return fail(err);
  }
}
