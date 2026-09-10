import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireSparks } from "@/core/billing/api";
import { sessionFromRequest } from "@/core/auth/session";
import { creativePlanRequestSchema } from "@/core/banners/schemas";
import { bannersEnabled, planCreative } from "@/core/banners/banner-service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Человек описал задачу своими словами — модель понимает, что это за креатив,
 * и заполняет форму черновиком. Бесплатно: это текстовая модель.
 * Тип и набор полей берутся из фиксированного списка, модель только выбирает
 * из него — иначе интерфейс был бы каждый раз разным.
 */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!bannersEnabled(session?.role)) {
      throw new AppError("Раздел ещё не открыт.", 403);
    }
    await requireSparks(req, "brief");
    const { description } = await parseBody(req, creativePlanRequestSchema);
    const plan = await planCreative(description);
    return ok(plan);
  } catch (err) {
    return fail(err);
  }
}
