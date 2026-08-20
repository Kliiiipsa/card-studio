import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { getLLMProvider } from "@/core/ai/providers";
import { validateDataUrl } from "@/lib/image-validation";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({ productImage: z.string().min(1) });

/**
 * Бесплатная vision-проверка фото перед генерацией видео: есть ли на снимке
 * человек. Seedance на фото с людьми ведёт себя непредсказуемо (позирует,
 * «переодевает» модель — боевые тесты 2026-08-20), поэтому UI честно
 * предупреждает ДО списания искр. Ошибка проверки не блокирует генерацию.
 */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    const { productImage } = await parseBody(req, schema);
    if (productImage.startsWith("data:")) validateDataUrl(productImage);

    let hasPerson = false;
    try {
      const llm = getLLMProvider();
      const res = await llm.complete({
        task: "analyze",
        json: true,
        vision: true,
        temperature: 0,
        maxTokens: 60,
        messages: [
          {
            role: "system",
            content:
              'Ты определяешь, есть ли на фото человек (модель, части тела). Ответ строго JSON: {"hasPerson": true|false}',
          },
          {
            role: "user",
            content: "Есть ли на этом фото человек или части тела человека?",
            imageDataUrl: productImage,
          },
        ],
      });
      const parsed = JSON.parse(
        res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim(),
      ) as { hasPerson?: boolean };
      hasPerson = parsed.hasPerson === true;
    } catch {
      // не смогли проверить — не мешаем пользователю
    }
    return ok({ hasPerson });
  } catch (err) {
    return fail(err);
  }
}
