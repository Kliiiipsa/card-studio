import "server-only";
import { Pool } from "pg";
import { randomInt } from "node:crypto";
import { applyTx } from "@/core/billing/billing";
import { REFERRAL } from "@/core/billing/prices";
import { canonicalEmail } from "@/core/auth/domains";
import { wasDeleted } from "@/core/auth/deletion";
import { registrationIps } from "@/core/auth/consent";

/**
 * Реферальная программа «приведи друга».
 *
 * Схема выплат (см. REFERRAL в prices.ts):
 *  - приглашённый получает бонус СРАЗУ при регистрации по ссылке;
 *  - пригласивший получает награду ТОЛЬКО когда приглашённый впервые оплатил.
 *
 * Почему так: регистрацию подделать легко, оплату — нет. Если платить за
 * регистрацию, программа становится станком по бесплатным генам поверх уже
 * существующего приветственного бонуса.
 *
 * Антифрод: самоприглашение по канонической почте отсекается, удалённые
 * аккаунты не получают бонус повторно, совпадение IP приглашённого с IP
 * регистрации пригласившего помечает связь как подозрительную — бонус и
 * выплата в этом случае не начисляются, но строка видна в админке, и владелец
 * может начислить гены вручную, если это ложное срабатывание (офис, семья).
 *
 * Все операции идемпотентны: строка связи — по первичному ключу приглашённого,
 * начисления — по уникальному reference в billing_tx.
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
 * Привязать регистрацию к пригласившему и, если всё чисто, начислить бонус
 * приглашённому. Вызывается на всех трёх путях регистрации (код по почте,
 * мгновенный режим, Яндекс ID). Никогда не бросает исключений.
 */
export async function linkSignup(args: {
  refereeEmail: string;
  code: string;
  ip?: string | null;
}): Promise<{ linked: boolean; bonus: number }> {
  if (!referralsEnabled()) return { linked: false, bonus: 0 };
  try {
    await ensureSchema();
    const code = args.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return { linked: false, bonus: 0 };

    const referrer = await codeOwner(code);
    if (!referrer) return { linked: false, bonus: 0 };
    // самоприглашение: тот же ящик или его plus-вариант
    if (canonicalEmail(referrer) === canonicalEmail(args.refereeEmail)) {
      return { linked: false, bonus: 0 };
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
      `insert into referral_signups (referee_email, referrer_email, code, ip, suspicious, bonus_granted)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (referee_email) do nothing
       returning referee_email`,
      [args.refereeEmail, referrer, code, args.ip ?? null, suspicious, !suspicious],
    );
    if (!inserted.rows[0]) return { linked: false, bonus: 0 }; // уже привязан
    if (suspicious) {
      console.warn(
        `[referral] подозрительная связь ${args.refereeEmail} ← ${referrer} (${sameIp ? "тот же IP" : "удалённый аккаунт"}) — бонус не начислен`,
      );
      return { linked: true, bonus: 0 };
    }

    await applyTx({
      email: args.refereeEmail,
      amount: REFERRAL.refereeBonus,
      type: "topup",
      reference: `ref-join:${canonicalEmail(args.refereeEmail)}`,
      comment: `Бонус за регистрацию по приглашению (код ${code})`,
    });
    return { linked: true, bonus: REFERRAL.refereeBonus };
  } catch (e) {
    console.error("[referral] linkSignup failed:", e);
    return { linked: false, bonus: 0 };
  }
}

/**
 * Первая РЕАЛЬНАЯ оплата приглашённого — награждаем пригласившего.
 * Вызывается из зачисления платежа ЮKassa; идемпотентно и не бросает.
 */
export async function rewardOnFirstPayment(refereeEmail: string): Promise<void> {
  if (!referralsEnabled()) return;
  try {
    await ensureSchema();
    const { rows } = await getPool().query<{
      referrer_email: string;
      suspicious: boolean;
      payout_granted: boolean;
    }>(
      `select referrer_email, suspicious, payout_granted
         from referral_signups where referee_email = $1`,
      [refereeEmail],
    );
    const row = rows[0];
    if (!row || row.payout_granted) return;
    if (row.suspicious) {
      console.warn(
        `[referral] выплата за ${refereeEmail} пропущена: связь помечена подозрительной`,
      );
      return;
    }
    const { applied } = await applyTx({
      email: row.referrer_email,
      amount: REFERRAL.referrerReward,
      type: "topup",
      reference: `ref-reward:${canonicalEmail(refereeEmail)}`,
      comment: "Награда за приглашённого друга: он оплатил первый пакет",
    });
    await getPool().query(
      `update referral_signups set payout_granted = true, paid_at = now()
        where referee_email = $1`,
      [refereeEmail],
    );
    if (applied) {
      console.log(
        `[referral] ${row.referrer_email} получил ${REFERRAL.referrerReward} генов за ${refereeEmail}`,
      );
    }
  } catch (e) {
    console.error("[referral] rewardOnFirstPayment failed:", e);
  }
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
    getPool().query<{ total: string; paid: string }>(
      `select count(*)::text as total,
              count(*) filter (where payout_granted)::text as paid
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
    earnedGenes: paid * REFERRAL.referrerReward,
    pendingSignups: total - paid,
  };
}

/** Кто кого привёл — для админки. */
export async function adminReferralSummary(): Promise<{
  rows: AdminReferralRow[];
  totals: { signups: number; paid: number; earned: number; suspicious: number };
}> {
  if (!referralsEnabled())
    return { rows: [], totals: { signups: 0, paid: 0, earned: 0, suspicious: 0 } };
  await ensureSchema();
  const { rows } = await getPool().query<{
    referrer_email: string;
    signups: string;
    paid: string;
    suspicious: string;
    last_at: string | null;
  }>(
    `select referrer_email,
            count(*)::text as signups,
            count(*) filter (where payout_granted)::text as paid,
            count(*) filter (where suspicious)::text as suspicious,
            max(created_at) as last_at
       from referral_signups
      group by referrer_email
      order by count(*) filter (where payout_granted) desc, count(*) desc
      limit 100`,
  );
  const out = rows.map((r) => ({
    referrer: r.referrer_email,
    signups: Number(r.signups),
    paid: Number(r.paid),
    earned: Number(r.paid) * REFERRAL.referrerReward,
    suspicious: Number(r.suspicious),
    lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
  }));
  return {
    rows: out,
    totals: {
      signups: out.reduce((a, r) => a + r.signups, 0),
      paid: out.reduce((a, r) => a + r.paid, 0),
      earned: out.reduce((a, r) => a + r.earned, 0),
      suspicious: out.reduce((a, r) => a + r.suspicious, 0),
    },
  };
}
