import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { persistGeneration } from "@/core/jobs/persist";
import { generateImageRequestSchema } from "@/core/ai/schemas";
import { generateImageFromReference } from "@/core/ai/service";
import { validateDataUrl } from "@/lib/image-validation";
import { readFalBalance, settleFalCostInBackground, falJobsInFlight } from "@/core/ai/fal-cost";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "generate");
    const body = await parseBody(req, generateImageRequestSchema);
    validateDataUrl(body.referenceImageDataUrl);
    const concurrentAtStart = falJobsInFlight();
    const falBalanceBefore = await readFalBalance();
    const result = await generateImageFromReference({
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      referenceImageDataUrl: body.referenceImageDataUrl,
      strength: body.strength,
      aspectRatio: body.aspectRatio,
      count: body.count,
      cardText: body.cardText,
    });
    // permanent copies in our S3 + «Мои карточки» records (fal URLs expire)
    for (const img of result.images) {
      // id задаём сами — фоновый замер допишет сюда реальную цену от fal
      const cardId = uid("card");
      img.url = await persistGeneration({
        id: cardId,
        email: bill.email,
        kind: "generator",
        sourceUrl: img.url,
        payload: {
          prompt: body.prompt.slice(0, 2000),
          cardText: body.cardText,
          // для разбора жалоб в админке
          negativePrompt: body.negativePrompt?.slice(0, 500),
          aspectRatio: body.aspectRatio,
          strength: body.strength,
          mode: "по фото",
        },
      });
      settleFalCostInBackground(cardId, falBalanceBefore, { concurrentAtStart });
    }
    const balance = await chargeSparks(bill);
    return ok({ ...result, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
