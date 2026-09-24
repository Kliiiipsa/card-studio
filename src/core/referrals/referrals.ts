import "server-only";
import { Pool } from "pg";
import { randomInt } from "node:crypto";
import { applyTx, getBalance } from "@/core/billing/billing";
import { REFERRAL, referralGenes } from "@/core/billing/prices";
import { canonicalEmail } from "@/core/auth/domains";
import { wasDeleted } from "@/core/auth/deletion";
import { registrationIps } from "@/core/auth/consent";

/**
 * Реферальная программа «приведи друга» (схема владельца, 2026-09-24).
 *
 * Обе награды — процент от РУБЛЕЙ, которые приглашённый реально заплатил:
 *  - пригласившему 10 % с КАЖДОГО пополнения друга, бессрочно;
 *  - приглашённому 15 % к ПЕРВОМУ пополнению, поверх пакетного бонуса и промокода.
 *
 * За регистрацию не платим НИЧЕГО — сознательное решение. Приветственные гены
 * на новый ящик у нас и так есть, и любая добавка к ним расширяет дыру для ферм
 * из почтовых адресов. Награду, которую нельзя получить без оплаты, накрутить
 * невозможно, а накрутка через настоящую оплату нам выгодна.
 *
 * Антифрод: самоприглашение по канонической почте отсекается, удалённые
 * аккаунты не награждаются повторно, совпадение IP приглашённого с IP
 * регистрации пригласившего помечает связь как подозрительную — начислений по
 * ней нет, но строка видна в админке, и владелец может начислить вручную, если
 * это ложное срабатывание (офис, семья).
 *
 * Все операции идемпотентны: строка связи — по первичному ключу приглашённого,
 * начисления — по уникальному reference в billing_tx (привязан к id платежа).
 * Счётчики в referral_signups двигаются ТОЛЬКО когда начисление реально
 * применилось — иначе повторный вызов зачисления раздул бы статистику.
 */

export type ReferralStats = {
  code: string;
  link: string;
  clicks: number;
  signups: number;
  paid: number;
  earnedGenes: number;
  pendingSignups: number;
};

export type AdminReferralRow = {
  referrer: string;
  signups: number;
  paid: number;
  earned: number;
  /** рублей пополнили приглашённые — наша выручка с этого канала */
  paidRub: number;
  suspicious: number;
  lastAt: string | null;
};

const SITE = process.env.SITE_URL || "https://kartogen.ru";
/** без похожих символов: 0/O, 1/I/l */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function referralsEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.PGHOST);
}

/**
 * Видимость раздела «Пригласить друга». 24.09.2026 закрыт по требованию
 * владельца сразу после выкладки: программа выдаёт гены, и открывать её всем
 * можно только после ручной проверки цепочки на живом аккаунте.
 * Раскатка на всех — переменная REFERRALS=all на проде, без выкладки кода
 * (тот же приём, что у BANNERS и NOTICES).
 *
 * Начисления это НЕ выключает: если человек уже перешёл по ссылке админа и
 * зарегистрировался, связь и бонус отработают — иначе проверить цепочку
 * было бы невозможно.
 */
export function referralsVisible(role?: string | null): boolean {
  return role === "admin" || process.env.REFERRALS === "all";
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = process.env.DATABASE_URL
      ? new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
      : new Pool({ max: 3 });
  }
  return pool;
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getPool().query(`
        create table if not exists referral_codes (
          email text primary key,
          code text unique not null,
          created_at timestamptz not null default now()
        );
        create table if not exists referral_signups (
          referee_email text primary key,
          referrer_email text not null,
          code text not null,
          ip text,
          suspicious boolean not null default false,
          bonus_granted boolean not null default false,
          payout_granted boolean not null default false,
          created_at timestamptz not null default now(),
          paid_at timestamptz
        );
        create index if not exists referral_signups_referrer_idx
          on referral_signups (referrer_email, created_at desc);
        create table if not exists referral_clicks (
          code text not null,
          day date not null,
          clicks int not null default 0,
          primary key (code, day)
        );
        -- Схема процентов (2026-09-24). payout_granted остаётся как «друг хоть
        -- раз платил», но сумма награды больше не константа, поэтому копим её
        -- в earned_genes, а не умножаем количество на ставку.
        alter table referral_signups add column if not exists first_topup_granted boolean not null default false;
        alter table referral_signups add column if not exists earned_genes int not null default 0;
        alter table referral_signups add column if not exists payments int not null default 0;
        alter table referral_signups add column if not exists paid_rub int not null default 0;
      `);
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

const makeCode = (): string => {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
};

export const referralLink = (code: string): string => `${SITE}/r/${code}`;

/** Код пользователя; создаётся при первом обращении и дальше не меняется. */
export async function getOrCreateCode(email: string): Promise<string | null> {
  if (!referralsEnabled()) return null;
  await ensureSchema();
  const existing = await getPool().query<{ code: string }>(
    "select code from referral_codes where email = $1",
    [email],
  );
  if (existing.rows[0]) return existing.rows[0].code;
  // коллизия кода крайне маловероятна (32^6), но обрабатываем
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    const ins = await getPool().query<{ code: string }>(
      `insert into referral_codes (email, code) values ($1, $2)
       on conflict (email) do update set code = referral_codes.code
       returning code`,
      [email, code],
    );
    if (ins.rows[0]) return ins.rows[0].code;
  }
  return null;
}

/** Кому принадлежит код. */
export async function codeOwner(code: string): Promise<string | null> {
  if (!referralsEnabled()) return null;
  await ensureSchema();
  const { rows } = await getPool().query<{ email: string }>(
    "select email from referral_codes where code = $1",
    [code.trim().toUpperCase()],
  );
  return rows[0]?.email ?? null;
}

/** Счётчик переходов по ссылке — только число, без персональных данных. */
export async function recordClick(code: string): Promise<void> {
  if (!referralsEnabled()) return;
  try {
    await ensureSchema();
    await getPool().query(
      `insert into referral_clicks (code, day, clicks) values ($1, current_date, 1)
       on conflict (code, day) do update set clicks = referral_clicks.clicks + 1`,
      [code.trim().toUpperCase()],
    );
  } catch {
    // счётчик не должен ломать переход по ссылке
  }
}

/**
 * Привязать регистрацию к пригласившему. Денег и генов здесь НЕ начисляется
 * никому — награды платятся только с оплаты, см. rewardOnPayment. Вызывается на
 * всех трёх путях регистрации (код по почте, мгновенный режим, Яндекс ID).
 * Никогда не бросает исключений: сорванная привязка не должна ломать
 * регистрацию.
 */
export async function linkSignup(args: {
  refereeEmail: string;
  code: string;
  ip?: string | null;
}): Promise<{ linked: boolean }> {
  if (!referralsEnabled()) return { linked: false };
  try {
    await ensureSchema();
    const code = args.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return { linked: false };

    const referrer = await codeOwner(code);
    if (!referrer) return { linked: false };
    // самоприглашение: тот же ящик или его plus-вариант
    if (canonicalEmail(referrer) === canonicalEmail(args.refereeEmail)) {
      return { linked: false };
    }
    // повторная регистрация после удаления аккаунта бонусов не даёт
    const deleted = await wasDeleted(args.refereeEmail).catch(() => false);

    // IP регистрации пригласившего — грубый, но дешёвый признак накрутки
    let sameIp = false;
    if (args.ip) {
      const ips = await registrationIps([referrer]).catch(() => ({}) as Record<string, string>);
      sameIp = ips[referrer] === args.ip;
    }
    const suspicious = sameIp || deleted;

    const inserted = await getPool().query<{ referee_email: string }>(
      `insert into referral_signups (referee_email, referrer_email, code, ip, suspicious)
       values ($1, $2, $3, $4, $5)
       on conflict (referee_email) do nothing
       returning referee_email`,
      [args.refereeEmail, referrer, code, args.ip ?? null, suspicious],
    );
    if (!inserted.rows[0]) return { linked: false }; // уже привязан
    if (suspicious) {
      console.warn(
        `[referral] подозрительная связь ${args.refereeEmail} ← ${referrer} (${sameIp ? "тот же IP" : "удалённый аккаунт"}) — начислений по ней не будет`,
      );
    }
    return { linked: true };
  } catch (e) {
    console.error("[referral] linkSignup failed:", e);
    return { linked: false };
  }
}

/**
 * Оплата приглашённого — начисляем обе стороны процентом от РУБЛЕЙ платежа.
 *
 * Вызывается из зачисления платежа ЮKassa на КАЖДОМ пополнении (пригласивший
 * получает свои 10 % бессрочно), приглашённому 15 % достаются только с первого.
 *
 * Идемпотентность двухуровневая: reference в billing_tx привязан к id платежа,
 * поэтому повторный вызов (вебхук + возврат на страницу) ничего не задваивает,
 * а счётчики в referral_signups двигаются только при applied === true. Поэтому
 * функцию безопасно звать и на повторном зачислении — она ещё и чинит случай,
 * когда процесс упал между зачислением и наградой.
 *
 * Никогда не бросает: сбой начисления не должен ломать платёж.
 */
export async function rewardOnPayment(args: {
  refereeEmail: string;
  paidRub: number;
  paymentId: string;
}): Promise<{ refereeBonus: number }> {
  if (!referralsEnabled() || args.paidRub <= 0) return { refereeBonus: 0 };
  try {
    await ensureSchema();
    const { rows } = await getPool().query<{
      referrer_email: string;
      suspicious: boolean;
      first_topup_granted: boolean;
    }>(
      `select referrer_email, suspicious, first_topup_granted
         from referral_signups where referee_email = $1`,
      [args.refereeEmail],
    );
    const row = rows[0];
    if (!row) return { refereeBonus: 0 };
    if (row.suspicious) {
      console.warn(
        `[referral] начисления за платёж ${args.paymentId} пропущены: связь ${args.refereeEmail} помечена подозрительной`,
      );
      return { refereeBonus: 0 };
    }

    // 1. Пригласившему — 10 % с этого пополнения
    const reward = referralGenes(args.paidRub, REFERRAL.referrerPercent);
    const { applied } = await applyTx({
      email: row.referrer_email,
      amount: reward,
      type: "bonus",
      reference: `ref-pay:${args.paymentId}`,
      // почту друга намеренно не пишем: пригласивший и так знает, кого звал,
      // а журнал видят поддержка и владелец
      comment: `Награда за друга: ${REFERRAL.referrerPercent}% с его пополнения на ${args.paidRub} ₽`,
    });
    if (applied) {
      await getPool().query(
        `update referral_signups
            set payout_granted = true,
                paid_at = coalesce(paid_at, now()),
                payments = payments + 1,
                paid_rub = paid_rub + $2,
                earned_genes = earned_genes + $3
          where referee_email = $1`,
        [args.refereeEmail, args.paidRub, reward],
      );
      console.log(
        `[referral] ${row.referrer_email} получил ${reward} генов с пополнения ${args.refereeEmail} на ${args.paidRub} ₽`,
      );
    }

    // 2. Приглашённому — 15 % к ПЕРВОМУ пополнению.
    // Флаг занимаем атомарным UPDATE ДО начисления: два платежа, пришедшие
    // почти одновременно, иначе оба увидели бы false и бонус начислился дважды
    // (reference спасает только от повтора ОДНОГО платежа). Если начисление
    // сорвалось — флаг отпускаем, иначе человек потеряет свой бонус навсегда.
    if (row.first_topup_granted) return { refereeBonus: 0 };
    const claimed = await getPool().query<{ referee_email: string }>(
      `update referral_signups set first_topup_granted = true
        where referee_email = $1 and first_topup_granted = false
        returning referee_email`,
      [args.refereeEmail],
    );
    if (!claimed.rows[0]) return { refereeBonus: 0 };
    const refereeBonus = referralGenes(args.paidRub, REFERRAL.refereeFirstTopupPercent);
    try {
      const first = await applyTx({
        email: args.refereeEmail,
        amount: refereeBonus,
        type: "bonus",
        reference: `ref-first:${args.paymentId}`,
        comment: `Бонус по приглашению: ${REFERRAL.refereeFirstTopupPercent}% к первому пополнению`,
      });
      return { refereeBonus: first.applied ? refereeBonus : 0 };
    } catch (e) {
      await getPool()
        .query(`update referral_signups set first_topup_granted = false where referee_email = $1`, [
          args.refereeEmail,
        ])
        .catch(() => undefined);
      throw e;
    }
  } catch (e) {
    console.error("[referral] rewardOnPayment failed:", e);
    return { refereeBonus: 0 };
  }
}

/**
 * Откат реферальных начислений по платежу, за который вернули деньги.
 *
 * Возвраты у нас ручные (заявление в поддержку → возврат в кабинете ЮKassa),
 * автоматического вебхука на refund нет, поэтому это инструмент владельца:
 * вызывается из админки по id платежа. Без него пункт «если другу вернули
 * деньги, начисленные гены снимаются» на странице приглашений был бы обещанием
 * без механизма.
 *
 * Снимаем с защитой от ухода в минус: если человек уже потратил эти гены,
 * забираем сколько есть и пишем сколько не добрали — решение по остатку за
 * владельцем, автоматически загонять клиента в долг мы не будем.
 */
export async function reverseForPayment(paymentId: string): Promise<{
  reversed: { email: string; amount: number; taken: number }[];
}> {
  if (!referralsEnabled()) return { reversed: [] };
  await ensureSchema();
  const { rows } = await getPool().query<{ email: string; amount: number; reference: string }>(
    `select email, amount, reference from billing_tx
      where type = 'bonus' and reference in ($1, $2) and amount > 0`,
    [`ref-pay:${paymentId}`, `ref-first:${paymentId}`],
  );
  const reversed: { email: string; amount: number; taken: number }[] = [];
  for (const r of rows) {
    const balance = await getBalance(r.email);
    const taken = Math.min(balance, r.amount);
    if (taken > 0) {
      await applyTx({
        email: r.email,
        amount: -taken,
        type: "admin",
        reference: `ref-reverse:${r.reference}`,
        comment: `Откат реферального начисления: возврат платежа ${paymentId}`,
        guardNonNegative: true,
      });
    }
    reversed.push({ email: r.email, amount: r.amount, taken });
  }
  // Откатываем счётчики связи. Сумму платежа берём из самой записи пополнения
  // (с 24.09.2026 она равна рублям), а не пересчитываем из награды обратно —
  // деление с округлением вниз не обратимо.
  const payRow = rows.find((r) => r.reference === `ref-pay:${paymentId}`);
  if (payRow) {
    const paid = await getPool().query<{ amount: number; email: string }>(
      `select amount, email from billing_tx where reference = $1 and type = 'topup'`,
      [`yk-${paymentId}`],
    );
    const refereeEmail = paid.rows[0]?.email;
    if (refereeEmail) {
      await getPool().query(
        `update referral_signups
            set payments = greatest(payments - 1, 0),
                paid_rub = greatest(paid_rub - $2, 0),
                earned_genes = greatest(earned_genes - $3, 0)
          where referee_email = $1`,
        [refereeEmail, paid.rows[0].amount, payRow.amount],
      );
    }
  }
  // приглашённому возвращаем право на бонус к первому пополнению: его оплата
  // отменена, значит первого пополнения фактически не было
  const firstRow = rows.find((r) => r.reference === `ref-first:${paymentId}`);
  if (firstRow) {
    await getPool().query(
      `update referral_signups set first_topup_granted = false where referee_email = $1`,
      [firstRow.email],
    );
  }
  return { reversed };
}

/** Сводка для страницы «Пригласить друга». */
export async function referralStats(email: string): Promise<ReferralStats | null> {
  if (!referralsEnabled()) return null;
  await ensureSchema();
  const code = await getOrCreateCode(email);
  if (!code) return null;
  const [clicks, signups] = await Promise.all([
    getPool().query<{ n: string | null }>(
      "select sum(clicks)::text as n from referral_clicks where code = $1",
      [code],
    ),
    getPool().query<{ total: string; paid: string; earned: string }>(
      `select count(*)::text as total,
              count(*) filter (where payout_granted)::text as paid,
              coalesce(sum(earned_genes), 0)::text as earned
         from referral_signups where referrer_email = $1`,
      [email],
    ),
  ]);
  const total = Number(signups.rows[0]?.total ?? 0);
  const paid = Number(signups.rows[0]?.paid ?? 0);
  return {
    code,
    link: referralLink(code),
    clicks: Number(clicks.rows[0]?.n ?? 0),
    signups: total,
    paid,
    earnedGenes: Number(signups.rows[0]?.earned ?? 0),
    pendingSignups: total - paid,
  };
}

/** Кто кого привёл — для админки. */
export async function adminReferralSummary(): Promise<{
  rows: AdminReferralRow[];
  totals: { signups: number; paid: number; earned: number; paidRub: number; suspicious: number };
}> {
  if (!referralsEnabled())
    return { rows: [], totals: { signups: 0, paid: 0, earned: 0, paidRub: 0, suspicious: 0 } };
  await ensureSchema();
  const { rows } = await getPool().query<{
    referrer_email: string;
    signups: string;
    paid: string;
    earned: string;
    paid_rub: string;
    suspicious: string;
    last_at: string | null;
  }>(
    `select referrer_email,
            count(*)::text as signups,
            count(*) filter (where payout_granted)::text as paid,
            coalesce(sum(earned_genes), 0)::text as earned,
            coalesce(sum(paid_rub), 0)::text as paid_rub,
            count(*) filter (where suspicious)::text as suspicious,
            max(created_at) as last_at
       from referral_signups
      group by referrer_email
      order by coalesce(sum(paid_rub), 0) desc, count(*) desc
      limit 100`,
  );
  const out = rows.map((r) => ({
    referrer: r.referrer_email,
    signups: Number(r.signups),
    paid: Number(r.paid),
    earned: Number(r.earned),
    paidRub: Number(r.paid_rub),
    suspicious: Number(r.suspicious),
    lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
  }));
  return {
    rows: out,
    totals: {
      signups: out.reduce((a, r) => a + r.signups, 0),
      paid: out.reduce((a, r) => a + r.paid, 0),
      earned: out.reduce((a, r) => a + r.earned, 0),
      paidRub: out.reduce((a, r) => a + r.paidRub, 0),
      suspicious: out.reduce((a, r) => a + r.suspicious, 0),
    },
  };
}
