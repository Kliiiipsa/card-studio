import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import {
  acquireGenerationSlot,
  releaseGenerationSlot,
  GEN_BUSY_MESSAGE,
} from "@/lib/concurrency-gate";
import { reserveSparks, refundReservation } from "@/core/billing/api";
import { persistGeneration } from "@/core/jobs/persist";
import { generateTextRequestSchema } from "@/core/ai/schemas";
import { generateImageFromText } from "@/core/ai/service";
import { readFalBalance, settleFalCostInBackground, falJobsInFlight } from "@/core/ai/fal-cost";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  // клапан нагрузки (см. generate/image): подождать слот, а не свалить сервер
  if (!(await acquireGenerationSlot())) return fail(new AppError(GEN_BUSY_MESSAGE, 503));
  try {
    const body = await parseBody(req, generateTextRequestSchema);
    // РЕЗЕРВ до вызова fal (см. generate/image): параллельные запросы не жгут баланс
    const bill = await reserveSparks(req, "generate", `gen:${uid("g")}`);
    try {
      const concurrentAtStart = falJobsInFlight();
      const falBalanceBefore = await readFalBalance();
      // Ровно одно изображение за одно списание: cnt из тела мог быть до 4, а
      // списание идёт один раз (аудит 2026-08-26 — «плати за одну, получи четыре»).
      // Дополнительные варианты клиент берёт повторной оплаченной генерацией.
      const result = await generateImageFromText({ ...body, count: 1 });
      // permanent copies in our S3 + «Мои карточки» records (fal URLs expire)
      for (const img of result.images) {
        // id задаём сами: fal списывает деньги с задержкой, и фоновый замер
        // допишет реальную стоимость именно в эту запись
        const cardId = uid("card");
        img.url = await persistGeneration({
          id: cardId,
          email: bill.ctx.email,
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
      return ok({ ...result, balance: bill.balance ?? undefined });
    } catch (err) {
      await refundReservation(bill).catch(() => undefined);
      throw err;
    }
  } catch (err) {
    return fail(err);
  } finally {
    releaseGenerationSlot();
  }
}
