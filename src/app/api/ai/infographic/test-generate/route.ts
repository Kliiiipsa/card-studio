import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { buildBakedCardPrompt } from "@/core/infographics/infographic-prompt-builder";
import { resolveStyle } from "@/core/infographics/layout-presets";
import { generateYandexArt } from "@/core/ai/providers/image/yandex-art";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * ВРЕМЕННЫЙ тестовый роут для /infographics-test: та же сборка промпта, что у
 * боевой инфографики (buildBakedCardPrompt), но картинку рисует AliceAI
 * (Yandex AI Studio) вместо gpt-image. Только для админа, генов не списывает.
 * После проверки гипотезы удаляется вместе со страницей и провайдером.
 */
const schema = z.object({
  productName: z.string().trim().min(1).max(200),
  headline: z.string().trim().min(1).max(120),
  subheadline: z.string().trim().max(160).optional(),
  benefits: z.array(z.string().trim().min(1).max(80)).max(6).default([]),
  style: z.enum(["auto", "minimal", "premium", "bright", "soft", "dark"]).default("auto"),
  category: z.string().trim().max(100).optional(),
  /** свой промпт целиком — чтобы руками крутить формулировки в тесте */
  customPrompt: z.string().trim().max(4000).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);

    const body = await parseBody(req, schema);
    const prompt =
      body.customPrompt ||
      buildBakedCardPrompt({
        productName: body.productName,
        headline: body.headline,
        subheadline: body.subheadline,
        benefits: body.benefits ?? [],
        type: "benefits",
        style: resolveStyle(body.style ?? "auto", body.category),
        hasProductImage: false, // AliceAI через этот эндпоинт — только text-to-image
        variantSeed: 0,
      });

    const imageDataUrl = await generateYandexArt(prompt);
    return ok({ imageDataUrl, prompt });
  } catch (err) {
    return fail(err);
  }
}
