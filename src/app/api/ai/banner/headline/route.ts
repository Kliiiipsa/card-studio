import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireSparks } from "@/core/billing/api";
import { sessionFromRequest } from "@/core/auth/session";
import { bannerHeadlineRequestSchema } from "@/core/banners/schemas";
import { bannersEnabled, suggestHeadlines } from "@/core/banners/banner-service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Три варианта заголовка ДО генерации. Бесплатно (текстовая модель стоит
 * копейки), и смысл в том, чтобы человек утвердил текст заранее: заголовок
 * запекается в картинку, и его правка стоит новой платной генерации.
 */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!bannersEnabled(session?.role)) {
      throw new AppError("Раздел ещё не открыт.", 403);
    }
    await requireSparks(req, "brief");
    const offer = await parseBody(req, bannerHeadlineRequestSchema);
    const options = await suggestHeadlines(offer);
    return ok({ options });
  } catch (err) {
    return fail(err);
  }
}
