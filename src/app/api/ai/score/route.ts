import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { enforceAiRateLimit } from "@/core/billing/api";
import { scoreRequestSchema } from "@/core/ai/schemas";
import { scoreGeneratedCard } from "@/core/ai/service";
import { validateDataUrl } from "@/lib/image-validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // раньше роут не проверял сессию сам (полагался на middleware) и был без
    // лимита — vision-вызов даром (аудит 2026-08-26)
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    enforceAiRateLimit(session.email, session.role);
    const body = await parseBody(req, scoreRequestSchema);
    // generated cards may be remote URLs (fal.ai); only validate uploaded data URLs
    if (body.imageDataUrl.startsWith("data:")) validateDataUrl(body.imageDataUrl);
    const score = await scoreGeneratedCard(body);
    return ok(score);
  } catch (err) {
    return fail(err);
  }
}
