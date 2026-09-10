import { z } from "zod";

/** Оффер — то, что человек написал сам. Ничего не досочиняем, только режем длину. */
export const bannerOfferSchema = z.object({
  productName: z.string().min(1, "Укажите название товара").max(200),
  benefit: z.string().max(300).optional(),
  price: z.string().max(40).optional(),
  oldPrice: z.string().max(40).optional(),
});

export const bannerHeadlineRequestSchema = bannerOfferSchema;

export const bannerFormatSchema = z.enum(["square", "wide", "story"]);
export const bannerLookSchema = z.enum(["light", "dark", "bright"]);

/**
 * Оформление, формат и резерв полосы — ОБЯЗАТЕЛЬНЫЕ поля, а не поля со
 * значением по умолчанию. Через parseBody zod-овский `.default()` не сужает
 * тип (остаётся `| undefined`), а молча подставлять формат за пользователя в
 * этом разделе особенно нельзя: он выбирает размер файла осознанно.
 */
export const bannerGenerateSchema = z.object({
  productName: z.string().min(1, "Укажите название товара").max(200),
  headline: z.string().min(1, "Нужен заголовок").max(120),
  subheadline: z.string().max(120).optional(),
  look: bannerLookSchema,
  format: bannerFormatSchema,
  /** фото товара, data URL; без него баннер рисуется по названию */
  productImage: z.string().optional(),
  /** внизу будет накладка — просим модель оставить полосу спокойной */
  reserveBand: z.boolean(),
  /** снимок формы для разбора жалоб в админке */
  userInput: z
    .object({
      benefit: z.string().max(300).optional(),
      price: z.string().max(40).optional(),
      oldPrice: z.string().max(40).optional(),
      cta: z.string().max(40).optional(),
      site: z.string().max(120).optional(),
      hasLogo: z.boolean().optional(),
    })
    .optional(),
});

export const bannerStatusSchema = z.object({
  job: z.object({
    provider: z.string(),
    statusUrl: z.string().url(),
    responseUrl: z.string().url(),
  }),
});

export type BannerGenerateBody = z.infer<typeof bannerGenerateSchema>;
