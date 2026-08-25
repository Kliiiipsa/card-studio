import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks, chargeSparks } from "@/core/billing/api";
import { generateSeoTexts } from "@/core/ai/service";
import { fetchWbSuggestions, buildProbeQueries } from "@/core/ai/wb-suggest";

export const runtime = "nodejs";
export const maxDuration = 60;

const list = z.array(z.string().trim().min(1).max(200)).max(12);

const schema = z.object({
  productName: z.string().trim().min(1, "Укажите название товара").max(200),
  category: z.string().max(120).optional(),
  benefits: list.min(1, "Добавьте хотя бы одно преимущество"),
  materials: list.default([]),
  audience: z.enum(["women", "men", "kids", "unisex"]).optional(),
  season: z.string().trim().max(60).optional(),
  brand: z.string().trim().max(60).optional(),
  ownKeywords: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
});

export async function POST(req: Request) {
  try {
    const bill = await requireSparks(req, "seo");
    const body = await parseBody(req, schema);

    // Живой спрос WB: сбой подсказок не роняет генерацию (вернётся пустой список)
    const wbSuggestions = await fetchWbSuggestions(
      buildProbeQueries({
        productName: body.productName,
        category: body.category,
        audience: body.audience,
        season: body.season,
      }),
    );

    const seo = await generateSeoTexts({
      productName: body.productName,
      category: body.category,
      benefits: body.benefits,
      materials: body.materials ?? [],
      audience: body.audience,
      season: body.season,
      brand: body.brand,
      ownKeywords: body.ownKeywords ?? [],
      wbSuggestions,
    });
    const balance = await chargeSparks(bill);
    return ok({ seo, wbSuggestions, balance });
  } catch (err) {
    return fail(err);
  }
}
