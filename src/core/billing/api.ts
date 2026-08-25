import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, getBalance, applyTx } from "./billing";
import { PRICES, SPARK, type SparkAction } from "./prices";
import { effectivePrice, consumePriceListUse } from "./promo";
import { disabledSections } from "@/core/ops/section-flags";
import { uid } from "@/lib/utils";

/**
 * Per-request billing context for paid AI routes.
 * Policy: check the balance BEFORE doing the work, charge AFTER success —
 * the user never pays for our failures or provider errors.
 * Admins and billing-disabled installs are always free.
 */
export type BillingCtx = {
  email: string;
  action: SparkAction;
  role: "admin" | "user";
  free: boolean;
  /** цена с учётом промокода-прайса; равна PRICES[action], если промокода нет */
  price: number;
  /** код спец-прайса, из которого взята цена (для списания лимита генераций) */
  promoCode: string | null;
};

/** Resolve the session; throw 402 when the user can't afford the action. */
export async function requireSparks(req: Request, action: SparkAction): Promise<BillingCtx> {
  const ctx = await billingCtx(req, action);
  // Экстренный рубильник раздела (админка → «Состояние»): блокируем только
  // ВХОД в новые генерации — идущие задачи доезжают и списываются штатно.
  // Админ проходит всегда: чинит и проверяет раздел, пока клиенты ждут.
  if (ctx.role !== "admin" && (await disabledSections()).has(action)) {
    throw new AppError(
      "Раздел временно закрыт на технические работы — мы уже чиним. Гены не списаны, загляните чуть позже.",
      503,
    );
  }
  if (!ctx.free) {
    const balance = await getBalance(ctx.email);
    if (balance < ctx.price) {
      throw new AppError(
        `Недостаточно генов: нужно ${ctx.price} ${SPARK}, на балансе ${balance} ${SPARK}. Пополните баланс в профиле.`,
        402,
      );
    }
  }
  return ctx;
}

/** Same context without the affordability check (used at async completion). */
export async function billingCtx(req: Request, action: SparkAction): Promise<BillingCtx> {
  const session = await sessionFromRequest(req);
  if (!session) throw new AppError("Требуется вход.", 401);
  const free = session.role === "admin" || !billingEnabled() || PRICES[action] === 0;
  // индивидуальный прайс промокода (NSdream и подобные) — цену берём оттуда
  const { price, viaPromo } = free
    ? { price: PRICES[action], viaPromo: null }
    : await effectivePrice(session.email, action);
  return { email: session.email, action, role: session.role, free, price, promoCode: viaPromo };
}

/**
 * Charge the action price. `reference` makes the charge idempotent (async
 * polling can hit completion twice). Returns the new balance, or null when
 * the action was free.
 */
export async function chargeSparks(ctx: BillingCtx, reference?: string): Promise<number | null> {
  if (ctx.free) return null;
  const { balance, applied } = await applyTx({
    email: ctx.email,
    amount: -ctx.price,
    type: "charge",
    action: ctx.action,
    reference: reference ?? uid("tx"),
    comment: ctx.promoCode ? `Спец-цена по промокоду ${ctx.promoCode}` : undefined,
  });
  // одна генерация по спец-прайсу израсходована (только при реальном списании)
  if (applied && ctx.promoCode) await consumePriceListUse(ctx.email, ctx.promoCode);
  return balance;
}
