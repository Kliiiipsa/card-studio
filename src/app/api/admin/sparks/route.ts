import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, applyTx } from "@/core/billing/billing";
import { getUser } from "@/core/auth/store";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().min(3).max(120),
  /** positive = начислить, negative = списать */
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0, "Сумма не может быть нулевой")
    .refine((n) => Math.abs(n) <= 100000, "Слишком большая сумма"),
  comment: z.string().max(300).optional(),
});

/** Manual sparks adjustment by the admin (the top-up channel until ЮKassa). */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!billingEnabled()) throw new AppError("Биллинг не настроен.", 500);

    const body = await parseBody(req, schema);
    const user = await getUser(body.email);
    if (!user) throw new AppError("Пользователь не найден.", 404);

    const { balance } = await applyTx({
      email: user.email,
      amount: body.amount,
      type: "admin",
      reference: uid("adm"),
      comment: body.comment || `Ручная корректировка администратором`,
    });
    return ok({ email: user.email, balance });
  } catch (err) {
    return fail(err);
  }
}
