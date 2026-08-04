import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { billingEnabled, getBalance, applyTx } from "./billing";
import { PRICES, SPARK, type SparkAction } from "./prices";
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
  free: boolean;
};

/** Resolve the session; throw 402 when the user can't afford the action. */
export async function requireSparks(req: Request, action: SparkAction): Promise<BillingCtx> {
  const ctx = await billingCtx(req, action);
  if (!ctx.free) {
    const price = PRICES[action];
    const balance = await getBalance(ctx.email);
    if (balance < price) {
      throw new AppError(
        `Недостаточно искр: нужно ${price} ${SPARK}, на балансе ${balance} ${SPARK}. Пополните баланс в профиле.`,
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
  return {
    email: session.email,
    action,
    free: session.role === "admin" || !billingEnabled(),
  };
}

/**
 * Charge the action price. `reference` makes the charge idempotent (async
 * polling can hit completion twice). Returns the new balance, or null when
 * the action was free.
 */
export async function chargeSparks(ctx: BillingCtx, reference?: string): Promise<number | null> {
  if (ctx.free) return null;
  const { balance } = await applyTx({
    email: ctx.email,
    amount: -PRICES[ctx.action],
    type: "charge",
    action: ctx.action,
    reference: reference ?? uid("tx"),
  });
  return balance;
}
