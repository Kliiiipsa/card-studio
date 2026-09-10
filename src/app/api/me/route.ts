import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, getBalance } from "@/core/billing/billing";
import { photoFixEnabled, photoV2Enabled } from "@/core/ai/photo-fix";
import { bannersEnabled } from "@/core/banners/banner-service";

export const runtime = "nodejs";

/** Who am I + sparks balance (null when billing is disabled or user is admin-free). */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    const balance =
      billingEnabled() && session.role !== "admin" ? await getBalance(session.email) : null;
    return ok({
      email: session.email,
      role: session.role,
      balance,
      // клиентские фичи под гейтом (сейчас — пакет исправлений «Фото товара»)
      photoFix: photoFixEnabled(session.role),
      // вторая волна «Фото товара»: «Подсказать задание» + готовые задачи
      photoV2: photoV2Enabled(session.role),
      // «Рекламные баннеры» — новый раздел, пока только админ (BANNERS=all раскатает)
      banners: bannersEnabled(session.role),
    });
  } catch (err) {
    return fail(err);
  }
}
