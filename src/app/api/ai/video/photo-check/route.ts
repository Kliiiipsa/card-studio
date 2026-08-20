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
    let hasText = false;
    try {
      const llm = getLLMProvider();
      const res = await llm.complete({
        task: "analyze",
        json: true,
        vision: true,
        temperature: 0,
        maxTokens: 80,
        messages: [
          {
            role: "system",
            content:
              'Ты проверяешь фото для видео-генерации. Ответ строго JSON: {"hasPerson": true|false, "hasText": true|false}. hasPerson — есть ли человек или части тела. hasText — есть ли НАЛОЖЕННЫЕ надписи, заголовки, плашки, цены (как на готовой карточке маркетплейса); мелкий текст на этикетке самого товара НЕ считается.',
          },
          {
            role: "user",
            content: "Проверь фото: есть ли человек и есть ли наложенный текст/плашки?",
            imageDataUrl: productImage,
          },
        ],
      });
      const parsed = JSON.parse(
        res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim(),
      ) as { hasPerson?: boolean; hasText?: boolean };
      hasPerson = parsed.hasPerson === true;
      hasText = parsed.hasText === true;
    } catch {
      // не смогли проверить — не мешаем пользователю
    }
    return ok({ hasPerson, hasText });
  } catch (err) {
    return fail(err);
  }
}
