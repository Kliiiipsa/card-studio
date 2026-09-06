import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import {
  acquireGenerationSlot,
  releaseGenerationSlot,
  GEN_BUSY_MESSAGE,
} from "@/lib/concurrency-gate";
import { reserveSparks, refundReservation } from "@/core/billing/api";
import { persistGeneration } from "@/core/jobs/persist";
import { generateImageRequestSchema } from "@/core/ai/schemas";
import { generateImageFromReference } from "@/core/ai/service";
import { validateDataUrl } from "@/lib/image-validation";
import { readFalBalance, settleFalCostInBackground, falJobsInFlight } from "@/core/ai/fal-cost";
import { sanitizeImagePrompt, sanitizeImagePromptV2 } from "@/core/ai/improve-prompt";
import { photoFixEnabled, scenarioDirectives } from "@/core/ai/photo-fix";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  // клапан нагрузки: под пиком лишний запрос подождёт слот (визуально — чуть
  // дольше спиннер), а не свалит сервер; мягкое сообщение только если не дождался
  if (!(await acquireGenerationSlot())) return fail(new AppError(GEN_BUSY_MESSAGE, 503));
  try {
    const body = await parseBody(req, generateImageRequestSchema);
    validateDataUrl(body.referenceImageDataUrl);
    // РЕЗЕРВ до вызова fal: параллельные запросы одного аккаунта не смогут
    // все проскочить и сжечь наш баланс — лишние получат 402 ещё до fal.
    const bill = await reserveSparks(req, "generate", `gen:${uid("g")}`);
    try {
      const concurrentAtStart = falJobsInFlight();
      const falBalanceBefore = await readFalBalance();
      // Предохранитель: советы вида «добавить плашку „Размеры S-XL“» до модели
      // не доходят — она рисует их нечитаемой кашей.
      //
      // Под гейтом photoFix (разбор 2026-09-06): фильтр с границами слов и
      // ТОЛЬКО для потока «Улучшить по советам». Промпт из «Фото товара» не
      // режем вовсе — старый фильтр выкидывал описание товара из-за слов
      // «текстура»/«контекст»/«для заголовка» у 84 из 115 генераций.
      const fix = photoFixEnabled(bill.ctx.role);
      const safePrompt = !fix
        ? sanitizeImagePrompt(body.prompt)
        : body.purpose === "improve"
          ? sanitizeImagePromptV2(body.prompt)
          : body.prompt;
      // Под гейтом к сценарию дописываем конкретику (товар целиком в кадре,
      // чистая поверхность, фон заменён) — иначе Seedream оставляет пыль и
      // кабели с исходного фото. Английский: этот кусок переводчику не нужен.
      const modelPrompt =
        fix && body.purpose === "photo"
          ? `${safePrompt}\n\n${scenarioDirectives(body.scenario)}`
          : safePrompt;
      const result = await generateImageFromReference({
        prompt: modelPrompt,
        // Seedream не имеет поля негатива и вклеивает его в инструкцию как
        // «Avoid: random text, logos, watermark» — по нашему же уроку «запрет =
        // приглашение» под гейтом негатив в «Фото товара» не передаём
        negativePrompt: fix && body.purpose === "photo" ? undefined : body.negativePrompt,
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
            prompt: modelPrompt.slice(0, 2000),
            promptRaw: safePrompt === body.prompt ? undefined : body.prompt.slice(0, 2000),
            purpose: body.purpose,
            scenario: body.scenario,
            photoFix: fix || undefined,
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
  } finally {
    releaseGenerationSlot();
  }
}
