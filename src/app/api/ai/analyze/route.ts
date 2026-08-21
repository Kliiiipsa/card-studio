import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { analyzeRequestSchema } from "@/core/ai/schemas";
import { analyzeProductCard } from "@/core/ai/service";
import { validateDataUrl } from "@/lib/image-validation";
import { analysisHash, getCachedAnalysis, putCachedAnalysis } from "@/core/ai/analysis-cache";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "analyze");
    const body = await parseBody(req, analyzeRequestSchema);
    validateDataUrl(body.imageDataUrl);

    // Тот же снимок с теми же данными → тот же отчёт, без нового списания:
    // модель на повторном запуске давала другие баллы, и это выглядело как
    // «сервис гадает» (жалоба пользователя 2026-08-21).
    const hash = analysisHash({
      imageDataUrl: body.imageDataUrl,
      product: body.product,
      concern: body.concern,
    });
    const cached = await getCachedAnalysis(hash, bill.email);
    if (cached) return ok({ ...cached, cached: true });

    const report = await analyzeProductCard(body.imageDataUrl, body.product, body.concern);
    await putCachedAnalysis(hash, bill.email, report);
    const balance = await chargeSparks(bill);
    return ok({ ...report, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
