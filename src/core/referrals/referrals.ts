import "server-only";
import { Pool } from "pg";
import { randomInt } from "node:crypto";
import { applyTx, getBalance } from "@/core/billing/billing";
import { REFERRAL, referralGenes, gens } from "@/core/billing/prices";
import { notifyUser } from "@/core/notices/notices";
import { canonicalEmail } from "@/core/auth/domains";
import { wasDeleted } from "@/core/auth/deletion";
import { registrationIps } from "@/core/auth/consent";
import { getUser } from "@/core/auth/store-pg";
import {
  assessSigns,
  inviteCycleDepth,
  inviteDeadline,
  inviteWindowOpen,
  parseOpenedAt,
  type InviteSign,
} from "./invite-rules";

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
 * Антифрод: самоприглашение по канонической почте отсекается всегда. Совпадение
 * IP и повторная регистрация после удаления аккаунта — ПРИЗНАКИ, а не запреты
 * (оферта п. 6.15, решение владельца 28.09.2026): один признак помечает связь в
 * админке, но начисления идут; два и больше — связь заблокирована до разбора.
 * Владелец может заблокировать или разблокировать любую связь вручную.
 *
 * Привязка двумя путями: по ссылке при регистрации (linkSignup) и кодом,
 * введённым вручную в поле промокода (applyInviteCode, правила в invite-rules).
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
        -- Код приглашения и признаки (2026-09-28). suspicious теперь значит
        -- «помечено, посмотри», а начисления останавливает только blocked.
        -- reason — какие признаки совпали; via — как человек привязался.
        alter table referral_signups add column if not exists blocked boolean not null default false;
        alter table referral_signups add column if not exists reason text;
        alter table referral_signups add column if not exists via text not null default 'link';
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
    // Код приглашения вводится в то же поле, что и промокод, и промокод там
    // главнее — совпавший код приглашения никогда бы не сработал.
    if (await isPromoCode(code)) continue;
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

/** Занято ли такое название промокодом. Таблицы может ещё не быть — тогда нет. */
async function isPromoCode(code: string): Promise<boolean> {
  try {
    const { rows } = await getPool().query("select 1 from promo_codes where code = $1 limit 1", [
      code,
    ]);
    return Boolean(rows[0]);
  } catch {
    return false;
  }
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
    const verdict = assessSigns(
      await collectSigns({ referrer, referee: args.refereeEmail, ip: args.ip }),
    );
    const inserted = await insertLink({
      referee: args.refereeEmail,
      referrer,
      code,
      ip: args.ip,
      via: "link",
      verdict,
    });
    return { linked: inserted };
  } catch (e) {
    console.error("[referral] linkSignup failed:", e);
    return { linked: false };
  }
}

/**
 * Какие признаки накрутки совпали у пары. Сами по себе ничего не запрещают —
 * см. assessSigns. IP сравниваем с адресом регистрации пригласившего: и тот, с
 * которого пришёл запрос, и тот, с которого регистрировался приглашённый (при
 * вводе кода это могут быть разные адреса).
 */
async function collectSigns(args: {
  referrer: string;
  referee: string;
  ip?: string | null;
}): Promise<InviteSign[]> {
  const signs: InviteSign[] = [];
  const ips = await registrationIps([args.referrer, args.referee]).catch(
    () => ({}) as Record<string, string>,
  );
  const referrerIp = ips[args.referrer];
  if (referrerIp && (referrerIp === args.ip || referrerIp === ips[args.referee])) signs.push("ip");
  if (await wasDeleted(args.referee).catch(() => false)) signs.push("deleted");
  return signs;
}

async function insertLink(args: {
  referee: string;
  referrer: string;
  code: string;
  ip?: string | null;
  via: "link" | "code";
  verdict: ReturnType<typeof assessSigns>;
}): Promise<boolean> {
  const inserted = await getPool().query<{ referee_email: string }>(
    `insert into referral_signups
       (referee_email, referrer_email, code, ip, suspicious, blocked, reason, via)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (referee_email) do nothing
     returning referee_email`,
    [
      args.referee,
      args.referrer,
      args.code,
      args.ip ?? null,
      args.verdict.suspicious,
      args.verdict.blocked,
      args.verdict.reason,
      args.via,
    ],
  );
  if (!inserted.rows[0]) return false; // уже привязан
  if (args.verdict.suspicious) {
    console.warn(
      `[referral] связь ${args.referee} ← ${args.referrer} помечена (${args.verdict.reason})` +
        (args.verdict.blocked ? " и заблокирована до разбора" : ", начисления идут"),
    );
  }
  return true;
}

/* ----------------------- код приглашения вручную ----------------------- */

/** Отказ по правилам — показываем человеку текстом, это не сбой сервиса. */
export class InviteCodeError extends Error {}
/** Такого кода нет. Отдельный класс: только эти отказы считает лимит попыток. */
export class InviteCodeNotFound extends InviteCodeError {}

/** День открытия программы всем (см. parseOpenedAt). */
export function referralsOpenedAt(): Date | null {
  return parseOpenedAt(process.env.REFERRALS_OPENED_AT);
}

/** Платил ли аккаунт деньгами. Промокоды и подарки оплатой не считаются. */
async function hasPaid(email: string): Promise<boolean> {
  const { rows } = await getPool().query(
    `select 1 from billing_tx where email = $1 and type = 'topup'
       and reference like 'yk-%' limit 1`,
    [email],
  );
  return Boolean(rows[0]);
}

async function referrerOf(email: string): Promise<string | null> {
  const { rows } = await getPool().query<{ referrer_email: string }>(
    "select referrer_email from referral_signups where referee_email = $1",
    [email],
  );
  return rows[0]?.referrer_email ?? null;
}

/**
 * Привязать уже зарегистрированный аккаунт к пригласившему по коду, введённому
 * вручную. Те же бонусы, что по ссылке; генов за сам ввод не начисляется.
 *
 * Порядок проверок выбран так, чтобы человек получал самую понятную причину
 * отказа: сначала «это ваш код», потом «вы уже привязаны», и только потом
 * сроки. В отличие от linkSignup БРОСАЕТ InviteCodeError — здесь человек ждёт
 * ответа, а не регистрируется мимоходом.
 */
export async function applyInviteCode(args: {
  email: string;
  code: string;
  ip?: string | null;
}): Promise<{ message: string; pending: boolean }> {
  if (!referralsEnabled()) throw new InviteCodeNotFound("Такого кода нет.");
  await ensureSchema();
  const code = args.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) throw new InviteCodeNotFound("Такого кода нет.");
  const referrer = await codeOwner(code);
  if (!referrer) throw new InviteCodeNotFound("Такого кода нет.");

  if (canonicalEmail(referrer) === canonicalEmail(args.email)) {
    throw new InviteCodeError("Это ваш собственный код. Отправьте его другу.");
  }
  if (await referrerOf(args.email)) {
    throw new InviteCodeError("Вы уже пришли по приглашению, второй код применить нельзя.");
  }
  if (await hasPaid(args.email)) {
    throw new InviteCodeError("Код приглашения действует только до первого пополнения.");
  }
  const user = await getUser(args.email);
  if (!user) throw new InviteCodeError("Не нашли ваш аккаунт. Войдите заново и повторите.");
  if (!inviteWindowOpen(new Date(user.createdAt), referralsOpenedAt())) {
    throw new InviteCodeError(
      `Код приглашения можно ввести в течение ${REFERRAL.codeWindowDays} дней после регистрации. Срок истёк.`,
    );
  }
  const depth = await inviteCycleDepth(args.email, referrer, referrerOf);
  if (depth === 1) {
    throw new InviteCodeError(
      "Этот человек пришёл по вашему приглашению, его код применить нельзя.",
    );
  }
  if (depth > 1) {
    throw new InviteCodeError(
      "Этот код применить нельзя: его владелец пришёл по цепочке ваших приглашений.",
    );
  }

  const verdict = assessSigns(await collectSigns({ referrer, referee: args.email, ip: args.ip }));
  const inserted = await insertLink({
    referee: args.email,
    referrer,
    code,
    ip: args.ip,
    via: "code",
    verdict,
  });
  if (!inserted) {
    throw new InviteCodeError("Вы уже пришли по приглашению, второй код применить нельзя.");
  }
  if (verdict.blocked) {
    // обещать +15 % нельзя: начислений по заблокированной связи не будет
    return {
      pending: false,
      message:
        "Код приглашения принят на проверку. Бонус начислим после неё. Вопросы — admin@kartogen.ru.",
    };
  }
  return {
    pending: true,
    message: `Код приглашения принят. К первому пополнению добавим +${REFERRAL.refereeFirstTopupPercent}% генов.`,
  };
}

export type InviteStatus = {
  /** аккаунт привязан к пригласившему (по ссылке или коду) */
  linked: boolean;
  /** процент, который добавится к ближайшему первому пополнению, иначе null */
  pendingPercent: number | null;
  /** можно ли ещё ввести код */
  canEnter: boolean;
  /** до какого дня можно ввести код; null — срок ещё не идёт или ввод закрыт */
  deadline: string | null;
};

/** Что показать человеку на странице баланса. Никогда не бросает. */
export async function inviteStatus(email: string): Promise<InviteStatus> {
  const none: InviteStatus = {
    linked: false,
    pendingPercent: null,
    canEnter: false,
    deadline: null,
  };
  if (!referralsEnabled()) return none;
  try {
    await ensureSchema();
    const { rows } = await getPool().query<{ blocked: boolean; first_topup_granted: boolean }>(
      "select blocked, first_topup_granted from referral_signups where referee_email = $1",
      [email],
    );
    const link = rows[0];
    if (link) {
      return {
        linked: true,
        pendingPercent:
          !link.blocked && !link.first_topup_granted ? REFERRAL.refereeFirstTopupPercent : null,
        canEnter: false,
        deadline: null,
      };
    }
    if (await hasPaid(email)) return none;
    const user = await getUser(email);
    if (!user) return none;
    const registeredAt = new Date(user.createdAt);
    const openedAt = referralsOpenedAt();
    const deadline = inviteDeadline(registeredAt, openedAt);
    return {
      linked: false,
      pendingPercent: null,
      canEnter: inviteWindowOpen(registeredAt, openedAt),
      deadline: deadline ? deadline.toISOString() : null,
    };
  } catch (e) {
    console.error("[referral] inviteStatus failed:", e);
    return none;
  }
}

/**
 * Ручное решение владельца по связи (оферта п. 6.15): заблокировать начисления
 * или вернуть их. Уже начисленные гены не трогает — для этого есть откат по
 * платежу.
 */
export async function setLinkBlocked(referee: string, blocked: boolean): Promise<boolean> {
  if (!referralsEnabled()) return false;
  await ensureSchema();
  const { rowCount } = await getPool().query(
    `update referral_signups set blocked = $2, suspicious = suspicious or $2
      where referee_email = $1`,
    [referee.trim().toLowerCase(), blocked],
  );
  return (rowCount ?? 0) > 0;
}

/** Вернуть приглашённому право на бонус к первому пополнению. */
async function releaseFirstTopup(refereeEmail: string): Promise<void> {
  await getPool()
    .query(`update referral_signups set first_topup_granted = false where referee_email = $1`, [
      refereeEmail,
    ])
    .catch(() => undefined);
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
      blocked: boolean;
      first_topup_granted: boolean;
    }>(
      `select referrer_email, blocked, first_topup_granted
         from referral_signups where referee_email = $1`,
      [args.refereeEmail],
    );
    const row = rows[0];
    if (!row) return { refereeBonus: 0 };
    // Останавливает начисления только blocked. Пометка suspicious — повод
    // владельцу посмотреть, а не отказ (оферта п. 6.15).
    if (row.blocked) {
      console.warn(
        `[referral] начисления за платёж ${args.paymentId} пропущены: связь ${args.refereeEmail} заблокирована`,
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
      // Почту друга намеренно не пишем: пригласивший и так знает, кого звал,
      // а журнал видят поддержка и владелец. Слово «бонус», а не «награда» и
      // не «вознаграждение»: по последней лексике начисление физлицу читается
      // как плата за оказанную услугу со всеми налоговыми последствиями.
      comment: `Бонус за приглашённого друга: ${REFERRAL.referrerPercent}% с его пополнения на ${args.paidRub} ₽`,
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
      // Молча начислить — значит не начислить: человек не заметит гены на
      // балансе и решит, что программа не работает. Почту друга не пишем.
      await notifyUser({
        email: row.referrer_email,
        kind: "promo",
        title: `Вам начислено ${gens(reward)} за приглашённого друга`,
        body: `Друг, пришедший по вашему приглашению, пополнил баланс на ${args.paidRub} ₽ — вам начислено ${REFERRAL.referrerPercent}% генами. Так будет с каждым его пополнением.`,
        url: "/invite",
      });
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
      if (!first.applied) {
        // Начисления не было — значит запись с таким reference уже есть. Так
        // бывает после отката возврата: reverseForPayment вернул право на
        // бонус, а платёж переподтвердили (вебхук или возврат на страницу), и
        // тот же reference не прошёл повторно. Флаг отпускаем, иначе человек
        // потеряет свои 15 % и на следующем пополнении тоже.
        await releaseFirstTopup(args.refereeEmail);
        return { refereeBonus: 0 };
      }
      await notifyUser({
        email: args.refereeEmail,
        kind: "promo",
        title: `Бонус по приглашению: ${gens(refereeBonus)}`,
        body: `Вы пришли по приглашению друга, поэтому к первому пополнению мы добавили ${REFERRAL.refereeFirstTopupPercent}% генами сверх бонуса пакета. Гены уже на балансе.`,
        url: "/billing",
      });
      return { refereeBonus };
    } catch (e) {
      await releaseFirstTopup(args.refereeEmail);
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

/** Помеченная связь — строка для разбора владельцем. */
export type AdminFlaggedLink = {
  referee: string;
  referrer: string;
  /** какие признаки совпали: «ip», «deleted», «ip,deleted»; null — блок вручную */
  reason: string | null;
  via: string;
  blocked: boolean;
  paidRub: number;
  earned: number;
  createdAt: string;
};

/** Кто кого привёл — для админки. */
export async function adminReferralSummary(): Promise<{
  rows: AdminReferralRow[];
  totals: {
    signups: number;
    paid: number;
    earned: number;
    paidRub: number;
    suspicious: number;
    /** сколько привязок сделано кодом, а не ссылкой */
    byCode: number;
    blocked: number;
  };
  flagged: AdminFlaggedLink[];
}> {
  if (!referralsEnabled())
    return {
      rows: [],
      totals: { signups: 0, paid: 0, earned: 0, paidRub: 0, suspicious: 0, byCode: 0, blocked: 0 },
      flagged: [],
    };
  await ensureSchema();
  const [flaggedRes, extra] = await Promise.all([
    getPool().query<{
      referee_email: string;
      referrer_email: string;
      reason: string | null;
      via: string;
      blocked: boolean;
      paid_rub: number;
      earned_genes: number;
      created_at: string;
    }>(
      `select referee_email, referrer_email, reason, via, blocked, paid_rub, earned_genes, created_at
         from referral_signups
        where suspicious or blocked
        order by created_at desc
        limit 100`,
    ),
    getPool().query<{ by_code: string; blocked: string }>(
      `select count(*) filter (where via = 'code')::text as by_code,
              count(*) filter (where blocked)::text as blocked
         from referral_signups`,
    ),
  ]);
  const flagged: AdminFlaggedLink[] = flaggedRes.rows.map((r) => ({
    referee: r.referee_email,
    referrer: r.referrer_email,
    reason: r.reason,
    via: r.via,
    blocked: r.blocked,
    paidRub: Number(r.paid_rub),
    earned: Number(r.earned_genes),
    createdAt: new Date(r.created_at).toISOString(),
  }));
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
      byCode: Number(extra.rows[0]?.by_code ?? 0),
      blocked: Number(extra.rows[0]?.blocked ?? 0),
    },
    flagged,
  };
}
