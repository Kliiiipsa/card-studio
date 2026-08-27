import { parseBody, ok, fail } from "@/lib/api";
import { reserveSparks, refundReservation } from "@/core/billing/api";
import { persistGeneration } from "@/core/jobs/persist";
import { generateImageRequestSchema } from "@/core/ai/schemas";
import { generateImageFromReference } from "@/core/ai/service";
import { validateDataUrl } from "@/lib/image-validation";
import { readFalBalance, settleFalCostInBackground, falJobsInFlight } from "@/core/ai/fal-cost";
import { sanitizeImagePrompt } from "@/core/ai/improve-prompt";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, generateImageRequestSchema);
    validateDataUrl(body.referenceImageDataUrl);
    // РЕЗЕРВ до вызова fal: параллельные запросы одного аккаунта не смогут
    // все проскочить и сжечь наш баланс — лишние получат 402 ещё до fal.
    const bill = await reserveSparks(req, "generate", `gen:${uid("g")}`);
    try {
      const concurrentAtStart = falJobsInFlight();
      const falBalanceBefore = await readFalBalance();
      // предохранитель: даже если клиент прислал советы вида «добавить плашку
      // „Размеры S-XL“», до модели они не дойдут — она рисует их нечитаемой кашей
      const safePrompt = sanitizeImagePrompt(body.prompt);
      const result = await generateImageFromReference({
        prompt: safePrompt,
        negativePrompt: body.negativePrompt,
        referenceImageDataUrl: body.referenceImageDataUrl,
        strength: body.strength,
        aspectRatio: body.aspectRatio,
        // одно изображение за одно списание (аудит 2026-08-26); count из тела
        // не масштабируем — иначе 4 картинки по цене одной
        count: 1,
        cardText: body.cardText,
      });
      // permanent copies in our S3 + «Мои карточки» records (fal URLs expire)
      for (const img of result.images) {
        // id задаём сами — фоновый замер допишет сюда реальную цену от fal
        const cardId = uid("card");
        img.url = await persistGeneration({
          id: cardId,
          email: bill.ctx.email,
          kind: "generator",
          sourceUrl: img.url,
          payload: {
            // в журнал пишем то, что реально ушло в модель
            prompt: safePrompt.slice(0, 2000),
            promptRaw: safePrompt === body.prompt ? undefined : body.prompt.slice(0, 2000),
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
      return ok({ ...result, balance: bill.balance ?? undefined });
    } catch (err) {
      // генерация не удалась — возвращаем зарезервированные гены
      await refundReservation(bill).catch(() => undefined);
      throw err;
    }
  } catch (err) {
    return fail(err);
  }
}
