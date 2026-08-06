import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { generateSeoTexts } from "@/core/ai/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const list = z.array(z.string().trim().min(1).max(200)).max(12);

const schema = z.object({
  productName: z.string().trim().min(1, "Укажите название товара").max(200),
  category: z.string().max(120).optional(),
  benefits: list.min(1, "Добавьте хотя бы одно преимущество"),
  materials: list.default([]),
});

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "seo");
    const body = await parseBody(req, schema);
    const seo = await generateSeoTexts({
      productName: body.productName,
      category: body.category,
      benefits: body.benefits,
      materials: body.materials ?? [],
    });
    const balance = await chargeSparks(bill);
    return ok({ seo, balance });
  } catch (err) {
    return fail(err);
  }
}
