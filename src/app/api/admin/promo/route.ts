import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import {
  listCodes,
  createCode,
  setCodeActive,
  listRedemptions,
  revokeRedemption,
  promoEnabled,
  type PromoGroup,
} from "@/core/billing/promo";
import type { SparkAction } from "@/core/billing/prices";

export const runtime = "nodejs";

async function requireAdmin(req: Request) {
  const session = await sessionFromRequest(req);
  if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
  if (!promoEnabled()) throw new AppError("Промокоды недоступны: нет базы данных.", 503);
  return session;
}

const priceSchema = z.record(z.number().int().min(0).max(10_000));

const createSchema = z.object({
  code: z.string().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, "Только латиница, цифры, дефис."),
  type: z.enum(["sparks", "topup_bonus", "price_list"]),
  group: z.enum(["general", "nsdream"]).default("general"),
  sparks: z.number().int().min(1).max(100_000).optional(),
  bonusPercent: z.number().int().min(1).max(500).optional(),
  prices: priceSchema.optional(),
  maxRedemptions: z.number().int().min(1).max(100_000).nullable().optional(),
  usesLimit: z.number().int().min(1).max(100_000).nullable().optional(),
  requireTopup: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
  comment: z.string().max(300).nullable().optional(),
});

/** Список кодов (+ применения по каждому) и последние применения вообще. */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const group = url.searchParams.get("group") as PromoGroup | null;
    const [codes, redemptions] = await Promise.all([
      listCodes(group === "general" || group === "nsdream" ? group : undefined),
      listRedemptions({ limit: 200 }),
    ]);
    return ok({ codes, redemptions });
  } catch (err) {
    return fail(err);
  }
}

/** Создать промокод. */
export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = await parseBody(req, createSchema);

    if (body.type === "sparks" && !body.sparks) {
      throw new AppError("Укажите, сколько генов начислять.");
    }
    if (body.type === "topup_bonus" && !body.bonusPercent) {
      throw new AppError("Укажите процент бонуса к пополнению.");
    }
    if (body.type === "price_list" && (!body.prices || !Object.keys(body.prices).length)) {
      throw new AppError("Задайте цены хотя бы на одну услугу.");
    }

    const code = await createCode({
      ...body,
      group: body.group ?? "general",
      prices: body.prices as Partial<Record<SparkAction, number>> | undefined,
      expiresAt: body.expiresAt || null,
    });
    return ok({ code });
  } catch (err) {
    // уникальный индекс на код
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      return fail(new AppError("Такой промокод уже существует."));
    }
    return fail(err);
  }
}

const patchSchema = z.object({
  /** включить/выключить код */
  code: z.string().optional(),
  active: z.boolean().optional(),
  /** отменить конкретное применение */
  redemptionId: z.number().int().optional(),
  clawback: z.boolean().optional(),
});

/** Выключить код или отменить применение у пользователя. */
export async function PATCH(req: Request) {
  try {
    await requireAdmin(req);
    const body = await parseBody(req, patchSchema);

    if (typeof body.redemptionId === "number") {
      const res = await revokeRedemption(body.redemptionId, { clawback: body.clawback });
      if (!res.ok) throw new AppError("Это применение уже отменено.");
      return ok({
        revoked: true,
        clawedBack: res.clawedBack,
      });
    }
    if (body.code && typeof body.active === "boolean") {
      await setCodeActive(body.code, body.active);
      return ok({ updated: true });
    }
    throw new AppError("Нечего менять.");
  } catch (err) {
    return fail(err);
  }
}
