import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { compareRequestSchema } from "@/core/ai/schemas";
import { compareCards } from "@/core/ai/service";
import { validateDataUrl } from "@/lib/image-validation";
import { analysisHash, getCachedAnalysis, putCachedAnalysis } from "@/core/ai/analysis-cache";
import type { ComparisonReport } from "@/core/ai/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * «Сравнение карточек»: моя vs конкурента. Кеш — как у анализа: та же пара
 * картинок с теми же данными обязана давать тот же вердикт, повтор бесплатен.
 */
export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "compare");
    const body = await parseBody(req, compareRequestSchema);
    validateDataUrl(body.mineDataUrl);
    validateDataUrl(body.competitorDataUrl);

    const hash = analysisHash({
      // "cmp2:" отделяет ключи сравнения от ключей обычного анализа; цифра —
      // версия промпта: меняем формулировки → старый кеш не должен отдаваться
      imageDataUrl: `cmp2:${body.mineDataUrl}|${body.competitorDataUrl}`,
      product: body.product,
      concern: body.concern,
    });
    const cached = (await getCachedAnalysis(hash, bill.email)) as ComparisonReport | null;
    if (cached && "verdict" in cached) return ok({ ...cached, cached: true });

    const report = await compareCards(
      body.mineDataUrl,
      body.competitorDataUrl,
      body.product,
      body.concern,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await putCachedAnalysis(hash, bill.email, report as any);
    const balance = await chargeSparks(bill);
    return ok({ ...report, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
