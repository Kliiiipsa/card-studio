import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { getUser } from "@/core/auth/store";
import { billingEnabled, getBalance, applyTx } from "./billing";
import { PRICES, SPARK, type SparkAction } from "./prices";
import { effectivePrice, consumePriceListUse } from "./promo";
import { disabledSections } from "@/core/ops/section-flags";
import { enforceRateLimit } from "@/lib/rate-limit";
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
/**
 * Лимит частоты ИИ-запросов на аккаунт (аудит 2026-08-26). Одна щедрая планка
 * на все действия: человек в живой работе её не достигает, а скрипт — да.
 * Бьёт по двум векторам сразу: сжигание токенов на бесплатных роутах и
 * «пулемётные» параллельные генерации, обходящие баланс. Админа не трогаем.
 */
export function enforceAiRateLimit(email: string, role: "admin" | "user"): void {
  if (role === "admin") return;
  enforceRateLimit(`ai:${email}`, {
    limit: 30,
    windowMs: 60_000,
    message: "Слишком часто. Подождите минуту и попробуйте снова.",
  });
}

export async function requireSparks(req: Request, action: SparkAction): Promise<BillingCtx> {
  const ctx = await billingCtx(req, action);
  enforceAiRateLimit(ctx.email, ctx.role);
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
  // guardNonNegative: атомарное условное списание — баланс не уйдёт в минус
  // даже при гонке параллельных запросов (аудит 2026-08-26).
  const { balance, applied, insufficient } = await applyTx({
    email: ctx.email,
    amount: -ctx.price,
    type: "charge",
    action: ctx.action,
    reference: reference ?? uid("tx"),
    comment: ctx.promoCode ? `Спец-цена по промокоду ${ctx.promoCode}` : undefined,
    guardNonNegative: true,
  });
  if (insufficient) {
    // средства кончились между проверкой и списанием (конкурентные запросы):
    // результат уже готов, но баланс защищён — фиксируем в логах
    console.warn(`[billing] concurrent depletion: ${ctx.email} action=${ctx.action}`);
  }
  // одна генерация по спец-прайсу израсходована (только при реальном списании)
  if (applied && ctx.promoCode) await consumePriceListUse(ctx.email, ctx.promoCode);
  return balance;
}

/* ---------------------- РЕЗЕРВ ДО вызова провайдера ---------------------- */

export type SparkReservation = {
  ctx: BillingCtx;
  reference: string;
  /** реально ли списаны гены (false для админа/бесплатного действия/дубля ref) */
  charged: boolean;
  /** баланс после резерва (null, если действие бесплатное) */
  balance: number | null;
};

/** Единый формат ссылки списания задачи — резерв и возврат должны совпадать. */
export const jobChargeRef = (jobId: string): string => `gen:${jobId}`;

/**
 * РЕЗЕРВ генов ДО дорогого вызова провайдера (fal). В отличие от связки
 * requireSparks→chargeSparks (проверка до, списание после) здесь списание
 * атомарное и ПЕРЕД работой: поэтому N параллельных запросов одного аккаунта
 * дальше проходит ровно floor(balance/price), а остальные получают 402 ещё ДО
 * обращения к fal и не жгут наш баланс (launch-аудит 2026-08-27, закрытие
 * блокера «списание после fal»). При неуспехе генерации ОБЯЗАТЕЛЬНО вызвать
 * refundReservation (sync) или refundCharge (async-watcher) — вернёт гены
 * идемпотентно. `reference` должен быть уникален для попытки; для async —
 * jobChargeRef(jobId), чтобы watcher мог вернуть по тому же ключу.
 */
export async function reserveSparks(
  req: Request,
  action: SparkAction,
  reference: string,
): Promise<SparkReservation> {
  const ctx = await billingCtx(req, action);
  enforceAiRateLimit(ctx.email, ctx.role);
  if (ctx.role !== "admin" && (await disabledSections()).has(action)) {
    throw new AppError(
      "Раздел временно закрыт на технические работы — мы уже чиним. Гены не списаны, загляните чуть позже.",
      503,
    );
  }
  if (ctx.free) return { ctx, reference, charged: false, balance: null };
  const { balance, applied, insufficient } = await applyTx({
    email: ctx.email,
    amount: -ctx.price,
    type: "charge",
    action: ctx.action,
    reference,
    comment: ctx.promoCode ? `Спец-цена по промокоду ${ctx.promoCode}` : undefined,
    guardNonNegative: true,
  });
  if (insufficient) {
    throw new AppError(
      `Недостаточно генов: нужно ${ctx.price} ${SPARK}, на балансе ${
        await getBalance(ctx.email)
      } ${SPARK}. Пополните баланс в профиле.`,
      402,
    );
  }
  if (applied && ctx.promoCode) await consumePriceListUse(ctx.email, ctx.promoCode);
  return { ctx, reference, charged: applied, balance };
}

/** Возврат резерва (sync-роуты) — идемпотентно по refund:<reference>. */
export async function refundReservation(r: SparkReservation): Promise<void> {
  if (!r.charged) return;
  await refundCharge(r.ctx.email, r.ctx.action, r.reference, r.ctx.price);
}

/**
 * Вернуть списанные при резерве гены за НЕУДАЧНУЮ генерацию. Идемпотентно:
 * reference `refund:<chargeReference>` (повторный вызов — no-op). Админ и
 * выключенный биллинг — no-op (там ничего не списывалось). Сумму берём
 * переданную (точную), иначе — текущий эффективный прайс.
 */
export async function refundCharge(
  email: string,
  action: SparkAction,
  chargeReference: string,
  amount?: number,
): Promise<void> {
  if (!billingEnabled()) return;
  const user = await getUser(email);
  if (user?.role === "admin") return;
  const price = amount ?? (await effectivePrice(email, action)).price;
  if (price <= 0) return;
  await applyTx({
    email,
    amount: price,
    type: "refund",
    action,
    reference: `refund:${chargeReference}`,
    comment: "Возврат за неудачную генерацию",
  });
}
