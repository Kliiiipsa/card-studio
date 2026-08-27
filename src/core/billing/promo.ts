import { Pool } from "pg";
import { applyTx, getBalance } from "./billing";
import { PRICES, gens, type SparkAction } from "./prices";

/**
 * Промокоды. Три разные механики под одним словом:
 *
 *  1. `sparks` — разовый подарок: ввёл код → гены на балансе сразу.
 *  2. `topup_bonus` — сам по себе ничего не даёт, «висит» на аккаунте и
 *     срабатывает при СЛЕДУЮЩЕЙ оплате: +N % сверх пакета. Сгорает после
 *     первого успешного пополнения.
 *  3. `price_list` — свой прайс на услуги (сделан под NSdream: у них
 *     индивидуальные условия, поэтому владелец задаёт цену каждой услуги
 *     вручную, а не процент скидки). Действует, пока не кончатся генерации
 *     или срок.
 *
 * Правила, общие для всех типов: у одного пользователя код срабатывает РОВНО
 * один раз (уникальный индекс), общее число применений ограничено полем
 * max_redemptions, есть срок годности и выключатель.
 */

export type PromoType = "sparks" | "topup_bonus" | "price_list";
export type PromoGroup = "general" | "nsdream";

export type PromoCode = {
  code: string;
  type: PromoType;
  group: PromoGroup;
  sparks: number | null;
  bonusPercent: number | null;
  prices: Partial<Record<SparkAction, number>> | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  usesLimit: number | null;
  requireTopup: boolean;
  expiresAt: string | null;
  active: boolean;
  comment: string | null;
  createdAt: string;
};

export type PromoRedemption = {
  id: number;
  code: string;
  email: string;
  type: PromoType;
  group: PromoGroup;
  redeemedAt: string;
  sparksGranted: number | null;
  bonusPercent: number | null;
  bonusUsed: boolean;
  usesLeft: number | null;
  prices: Partial<Record<SparkAction, number>> | null;
  revoked: boolean;
};

/** Что сейчас действует у пользователя — для UI и для списаний. */
export type ActivePerks = {
  /** ожидает пополнения: бонус в процентах */
  pendingBonusPercent: number | null;
  pendingBonusCode: string | null;
  /** индивидуальные цены на услуги */
  prices: Partial<Record<SparkAction, number>> | null;
  priceListCode: string | null;
  /** сколько генераций по спец-цене осталось (null = без ограничения) */
  usesLeft: number | null;
};

export const EMPTY_PERKS: ActivePerks = {
  pendingBonusPercent: null,
  pendingBonusCode: null,
  prices: null,
  priceListCode: null,
  usesLeft: null,
};

export function promoEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.PGHOST);
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = process.env.DATABASE_URL
      ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
      : new Pool({ max: 5 });
  }
  return pool;
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getPool().query(`
        create table if not exists promo_codes (
          code text primary key,
          type text not null,
          group_name text not null default 'general',
          sparks int,
          bonus_percent int,
          prices jsonb,
          max_redemptions int,
          redeemed_count int not null default 0,
          uses_limit int,
          require_topup boolean not null default false,
          expires_at timestamptz,
          active boolean not null default true,
          comment text,
          created_at timestamptz not null default now()
        );
        create table if not exists promo_redemptions (
          id bigserial primary key,
          code text not null,
          email text not null,
          type text not null,
          group_name text not null default 'general',
          redeemed_at timestamptz not null default now(),
          ip text,
          sparks_granted int,
          bonus_percent int,
          bonus_used boolean not null default false,
          uses_left int,
          prices jsonb,
          revoked boolean not null default false,
          revoked_at timestamptz
        );
        create unique index if not exists promo_redemptions_once
          on promo_redemptions (code, email);
        create index if not exists promo_redemptions_email_idx
          on promo_redemptions (email, redeemed_at desc);
      `);
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toCode(r: any): PromoCode {
  return {
    code: r.code,
    type: r.type,
    group: r.group_name,
    sparks: r.sparks,
    bonusPercent: r.bonus_percent,
    prices: r.prices,
    maxRedemptions: r.max_redemptions,
    redeemedCount: r.redeemed_count,
    usesLimit: r.uses_limit,
    requireTopup: r.require_topup,
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
    active: r.active,
    comment: r.comment,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function toRedemption(r: any): PromoRedemption {
  return {
    id: Number(r.id),
    code: r.code,
    email: r.email,
    type: r.type,
    group: r.group_name,
    redeemedAt: new Date(r.redeemed_at).toISOString(),
    sparksGranted: r.sparks_granted,
    bonusPercent: r.bonus_percent,
    bonusUsed: r.bonus_used,
    usesLeft: r.uses_left,
    prices: r.prices,
    revoked: r.revoked,
  };
}

/* ------------------------------ админ ------------------------------ */

export async function listCodes(group?: PromoGroup): Promise<PromoCode[]> {
  await ensureSchema();
  const { rows } = group
    ? await getPool().query(
        `select * from promo_codes where group_name = $1 order by created_at desc`,
        [group],
      )
    : await getPool().query(`select * from promo_codes order by created_at desc`);
  return rows.map(toCode);
}

export async function createCode(args: {
  code: string;
  type: PromoType;
  group: PromoGroup;
  sparks?: number | null;
  bonusPercent?: number | null;
  prices?: Partial<Record<SparkAction, number>> | null;
  maxRedemptions?: number | null;
  usesLimit?: number | null;
  requireTopup?: boolean;
  expiresAt?: string | null;
  comment?: string | null;
}): Promise<PromoCode> {
  await ensureSchema();
  const code = args.code.trim().toUpperCase();
  const { rows } = await getPool().query(
    `insert into promo_codes
       (code, type, group_name, sparks, bonus_percent, prices, max_redemptions,
        uses_limit, require_topup, expires_at, comment)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning *`,
    [
      code,
      args.type,
      args.group,
      args.sparks ?? null,
      args.bonusPercent ?? null,
      args.prices ? JSON.stringify(args.prices) : null,
      args.maxRedemptions ?? null,
      args.usesLimit ?? null,
      args.requireTopup ?? false,
      args.expiresAt ?? null,
      args.comment ?? null,
    ],
  );
  return toCode(rows[0]);
}

export async function setCodeActive(code: string, active: boolean): Promise<void> {
  await ensureSchema();
  await getPool().query(`update promo_codes set active = $2 where code = $1`, [
    code.toUpperCase(),
    active,
  ]);
}

/** Применения кода — для карточки кода и для вкладки «Пользователи». */
export async function listRedemptions(opts: {
  code?: string;
  email?: string;
  limit?: number;
}): Promise<PromoRedemption[]> {
  await ensureSchema();
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.code) {
    params.push(opts.code.toUpperCase());
    where.push(`code = $${params.length}`);
  }
  if (opts.email) {
    params.push(opts.email);
    where.push(`email = $${params.length}`);
  }
  params.push(limit);
  const { rows } = await getPool().query(
    `select * from promo_redemptions
     ${where.length ? "where " + where.join(" and ") : ""}
     order by redeemed_at desc limit $${params.length}`,
    params,
  );
  return rows.map(toRedemption);
}

/**
 * Отменить применение кода. Действие кода снимается сразу; подаренные гены
 * забираем обратно только если владелец попросил (clawback) и они ещё на месте.
 */
export async function revokeRedemption(
  id: number,
  opts: { clawback?: boolean } = {},
): Promise<{ ok: boolean; clawedBack: number }> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      `update promo_redemptions
       set revoked = true, revoked_at = now(), bonus_used = true, uses_left = 0
       where id = $1 and revoked = false
       returning *`,
      [id],
    );
    if (!rows[0]) {
      await client.query("rollback");
      return { ok: false, clawedBack: 0 };
    }
    const r = toRedemption(rows[0]);
    await client.query(`update promo_codes set redeemed_count = greatest(redeemed_count - 1, 0) where code = $1`, [
      r.code,
    ]);
    await client.query("commit");

    let clawedBack = 0;
    if (opts.clawback && r.type === "sparks" && r.sparksGranted) {
      const balance = await getBalance(r.email);
      const amount = Math.min(balance, r.sparksGranted);
      if (amount > 0) {
        await applyTx({
          email: r.email,
          amount: -amount,
          type: "admin",
          reference: `promo-revoke:${r.id}`,
          comment: `Отмена промокода ${r.code}`,
        });
        clawedBack = amount;
      }
    }
    return { ok: true, clawedBack };
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/* ------------------------------ клиент ------------------------------ */

export class PromoError extends Error {}

/**
 * Применить код. Всё в одной транзакции с блокировкой строки кода, чтобы два
 * одновременных ввода не пробили лимит применений.
 */
export async function redeemPromo(args: {
  code: string;
  email: string;
  ip?: string | null;
}): Promise<{ type: PromoType; message: string; balance?: number }> {
  await ensureSchema();
  const code = args.code.trim().toUpperCase();
  if (!code) throw new PromoError("Введите промокод.");

  const client = await getPool().connect();
  let granted: { sparks: number; code: string } | null = null;
  let result: { type: PromoType; message: string };
  try {
    await client.query("begin");
    const { rows } = await client.query(`select * from promo_codes where code = $1 for update`, [
      code,
    ]);
    if (!rows[0]) throw new PromoError("Такого промокода нет. Проверьте написание.");
    const c = toCode(rows[0]);

    if (!c.active) throw new PromoError("Этот промокод больше не действует.");
    if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) {
      throw new PromoError("Срок действия промокода истёк.");
    }
    if (c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions) {
      throw new PromoError("Промокод уже использован максимальное число раз.");
    }

    const mine = await client.query(
      `select 1 from promo_redemptions where code = $1 and email = $2`,
      [code, args.email],
    );
    if (mine.rows[0]) throw new PromoError("Вы уже применяли этот промокод.");

    // защита от ферм: код на гены не даём аккаунту, который ещё не платил
    if (c.requireTopup) {
      const paid = await client.query(
        `select 1 from billing_tx where email = $1 and type = 'topup' limit 1`,
        [args.email],
      );
      if (!paid.rows[0]) {
        throw new PromoError(
          "Этот промокод доступен после первого пополнения баланса.",
        );
      }
    }
    // тот же код с того же IP другим аккаунтом — почти всегда накрутка
    if (args.ip) {
      const sameIp = await client.query(
        `select 1 from promo_redemptions where code = $1 and ip = $2 and email <> $3 limit 1`,
        [code, args.ip, args.email],
      );
      if (sameIp.rows[0]) {
        throw new PromoError("Промокод уже применён с этого устройства.");
      }
    }

    await client.query(
      `insert into promo_redemptions
         (code, email, type, group_name, ip, sparks_granted, bonus_percent, uses_left, prices)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        code,
        args.email,
        c.type,
        c.group,
        args.ip ?? null,
        c.type === "sparks" ? c.sparks : null,
        c.type === "topup_bonus" ? c.bonusPercent : null,
        c.type === "price_list" ? c.usesLimit : null,
        c.type === "price_list" && c.prices ? JSON.stringify(c.prices) : null,
      ],
    );
    await client.query(`update promo_codes set redeemed_count = redeemed_count + 1 where code = $1`, [
      code,
    ]);
    await client.query("commit");

    if (c.type === "sparks") {
      granted = { sparks: c.sparks ?? 0, code };
      result = { type: c.type, message: `Начислено ${gens(c.sparks ?? 0)} по промокоду ${code}.` };
    } else if (c.type === "topup_bonus") {
      result = {
        type: c.type,
        message: `Промокод принят: при следующем пополнении получите +${c.bonusPercent}% генов.`,
      };
    } else {
      result = {
        type: c.type,
        message: c.usesLimit
          ? `Промокод принят: специальные цены на ${c.usesLimit} генераций.`
          : "Промокод принят: для вашего аккаунта действуют специальные цены.",
      };
    }
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }

  // начисление вне транзакции промокодов: у ledger своя, а reference защищает
  // от повторного зачисления при любых гонках
  if (granted && granted.sparks > 0) {
    const { balance } = await applyTx({
      email: args.email,
      amount: granted.sparks,
      type: "topup",
      reference: `promo:${granted.code}:${args.email}`,
      comment: `Промокод ${granted.code}`,
    });
    return { ...result, balance };
  }
  return result;
}

/** Что действует у пользователя прямо сейчас. */
export async function activePerks(email: string): Promise<ActivePerks> {
  if (!promoEnabled()) return EMPTY_PERKS;
  try {
    await ensureSchema();
    const { rows } = await getPool().query(
      `select * from promo_redemptions
        where email = $1 and revoked = false
        order by redeemed_at desc`,
      [email],
    );
    const perks: ActivePerks = { ...EMPTY_PERKS };
    for (const raw of rows) {
      const r = toRedemption(raw);
      if (r.type === "topup_bonus" && !r.bonusUsed && perks.pendingBonusPercent === null) {
        perks.pendingBonusPercent = r.bonusPercent;
        perks.pendingBonusCode = r.code;
      }
      if (
        r.type === "price_list" &&
        perks.prices === null &&
        (r.usesLeft === null || r.usesLeft > 0)
      ) {
        perks.prices = r.prices;
        perks.priceListCode = r.code;
        perks.usesLeft = r.usesLeft;
      }
    }
    return perks;
  } catch (e) {
    console.error("[promo] perks lookup failed:", e);
    return EMPTY_PERKS;
  }
}

/**
 * Цена действия для конкретного пользователя: спец-прайс промокода или общий.
 * Возвращает и сам факт подмены — чтобы списать одну генерацию из лимита.
 */
export async function effectivePrice(
  email: string,
  action: SparkAction,
): Promise<{ price: number; viaPromo: string | null }> {
  const base = PRICES[action];
  if (!promoEnabled()) return { price: base, viaPromo: null };
  const perks = await activePerks(email);
  const custom = perks.prices?.[action];
  if (perks.priceListCode && typeof custom === "number") {
    return { price: custom, viaPromo: perks.priceListCode };
  }
  return { price: base, viaPromo: null };
}

/** Списать одну генерацию из лимита спец-прайса (после успешного списания генов). */
export async function consumePriceListUse(email: string, code: string): Promise<void> {
  if (!promoEnabled()) return;
  try {
    await ensureSchema();
    await getPool().query(
      `update promo_redemptions
          set uses_left = greatest(uses_left - 1, 0)
        where email = $1 and code = $2 and revoked = false and uses_left is not null`,
      [email, code],
    );
  } catch (e) {
    console.error("[promo] use consume failed:", e);
  }
}

/**
 * Забрать ожидающий бонус к пополнению: возвращает процент и помечает его
 * использованным. Вызывается в момент СОЗДАНИЯ платежа, чтобы бонус попал в
 * metadata и зачислился вместе с оплатой.
 */
export async function consumeTopupBonus(
  email: string,
): Promise<{ percent: number; code: string } | null> {
  if (!promoEnabled()) return null;
  try {
    await ensureSchema();
    const { rows } = await getPool().query(
      `update promo_redemptions
          set bonus_used = true
        where id = (
          select id from promo_redemptions
           where email = $1 and type = 'topup_bonus' and bonus_used = false and revoked = false
           order by redeemed_at asc limit 1
           for update skip locked
        )
        and bonus_used = false
        returning code, bonus_percent`,
      [email],
    );
    if (!rows[0]?.bonus_percent) return null;
    return { percent: Number(rows[0].bonus_percent), code: rows[0].code };
  } catch (e) {
    console.error("[promo] bonus consume failed:", e);
    return null;
  }
}

/** Вернуть бонус обратно, если платёж не состоялся. */
export async function releaseTopupBonus(email: string, code: string): Promise<void> {
  if (!promoEnabled()) return;
  try {
    await getPool().query(
      `update promo_redemptions set bonus_used = false
        where email = $1 and code = $2 and type = 'topup_bonus' and revoked = false`,
      [email, code],
    );
  } catch (e) {
    console.error("[promo] bonus release failed:", e);
  }
}

/** Сводка по коду для админки: сколько применено и сколько генов роздано. */
export async function codeStats(code: string): Promise<{ redeemed: number; sparks: number }> {
  await ensureSchema();
  const { rows } = await getPool().query<{ redeemed: string; sparks: string | null }>(
    `select count(*) as redeemed, coalesce(sum(sparks_granted), 0) as sparks
       from promo_redemptions where code = $1 and revoked = false`,
    [code.toUpperCase()],
  );
  return { redeemed: Number(rows[0].redeemed), sparks: Number(rows[0].sparks ?? 0) };
}
