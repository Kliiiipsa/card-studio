import { z } from "zod";
import { ALL_FORMAT_IDS } from "./formats";

export const creativeTypeSchema = z.enum([
  "banner",
  "social-post",
  "profile-header",
  "business-card",
]);

export const bannerLookSchema = z.enum([
  "adaptive",
  "light",
  "dark",
  "bright",
  "premium",
  "warm",
  "tech",
]);

/** Формат проверяем по фактической таблице, чтобы id не разъезжались. */
export const bannerFormatSchema = z.string().refine((v) => ALL_FORMAT_IDS.includes(v), {
  message: "Неизвестный формат.",
});

/** Свободное описание задачи — по нему модель понимает, что человеку нужно. */
export const creativePlanRequestSchema = z.object({
  description: z.string().min(3, "Опишите задачу хотя бы парой слов").max(1500),
});

export const bannerHeadlineRequestSchema = z.object({
  subject: z.string().min(1, "Укажите, что рекламируем").max(200),
  benefit: z.string().max(300).optional(),
  price: z.string().max(40).optional(),
  oldPrice: z.string().max(40).optional(),
});

/**
 * Оформление, формат и тип — ОБЯЗАТЕЛЬНЫЕ поля, а не поля со значением по
 * умолчанию: через parseBody zod-овский `.default()` не сужает тип, а молча
 * подставлять формат за пользователя в этом разделе нельзя — он выбирает
 * размер файла осознанно.
 */
export const bannerGenerateSchema = z.object({
  creativeType: creativeTypeSchema,
  format: bannerFormatSchema,
  look: bannerLookSchema,
  subject: z.string().min(1, "Укажите, что рекламируем").max(200),
  headline: z.string().min(1, "Нужен заголовок").max(120),
  subheadline: z.string().max(120).optional(),
  price: z.string().max(40).optional(),
  oldPrice: z.string().max(40).optional(),
  cta: z.string().max(40).optional(),
  /**
   * Телефон и сайт печатает модель. В журнал «Генерации» телефон НЕ кладём:
   * для разбора жалоб он не нужен, а это личный контакт (см. route).
   */
  phone: z.string().max(40).optional(),
  site: z.string().max(120).optional(),
  /** фото; без него креатив рисуется по описанию */
  productImage: z.string().optional(),
  /** угол под настоящий логотип — сам знак накладывается на клиенте */
  logoCorner: z.enum(["top-left", "top-right"]).optional(),
  benefit: z.string().max(300).optional(),
});

export const bannerStatusSchema = z.object({
  job: z.object({
    provider: z.string(),
    statusUrl: z.string().url(),
    responseUrl: z.string().url(),
  }),
});

export type BannerGenerateBody = z.infer<typeof bannerGenerateSchema>;
