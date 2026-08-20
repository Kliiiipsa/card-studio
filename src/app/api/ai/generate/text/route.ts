import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { persistGeneration } from "@/core/jobs/persist";
import { generateTextRequestSchema } from "@/core/ai/schemas";
import { generateImageFromText } from "@/core/ai/service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "generate");
    const body = await parseBody(req, generateTextRequestSchema);
    const result = await generateImageFromText(body);
    // permanent copies in our S3 + «Мои карточки» records (fal URLs expire)
    for (const img of result.images) {
      img.url = await persistGeneration({
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
    }
    const balance = await chargeSparks(bill);
    return ok({ ...result, balance: balance ?? undefined });
  } catch (err) {
    return fail(err);
  }
}
