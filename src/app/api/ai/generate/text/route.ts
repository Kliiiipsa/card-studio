import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { persistGeneration } from "@/core/jobs/persist";
import { generateTextRequestSchema } from "@/core/ai/schemas";
import { generateImageFromText } from "@/core/ai/service";
import { readFalBalance, settleFalCostInBackground, falJobsInFlight } from "@/core/ai/fal-cost";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "generate");
    const body = await parseBody(req, generateTextRequestSchema);
    const concurrentAtStart = falJobsInFlight();
    const falBalanceBefore = await readFalBalance();
    const result = await generateImageFromText(body);
    // permanent copies in our S3 + «Мои карточки» records (fal URLs expire)
    for (const img of result.images) {
      // id задаём сами: fal списывает деньги с задержкой, и фоновый замер
      // допишет реальную стоимость именно в эту запись
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
          mode: "по описанию",
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
