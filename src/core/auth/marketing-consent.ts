import { getPool } from "./store-pg";

/**
 * Журнал согласий на РЕКЛАМНУЮ рассылку (ст. 18 закона «О рекламе»). Отдельно
 * от auth_consents (оферта/ПДн): своя формулировка, свой жизненный цикл
 * (granted/revoked строками — состояние = последняя запись). Пишем дату, IP,
 * user-agent и ТОЧНЫЙ текст, на который человек согласился — при жалобе в ФАС
 * спрашивают именно это.
 *
 * Чекбокс всегда СНЯТ по умолчанию и отделён от обязательного согласия с
 * офертой — иначе согласие ничтожно.
 */

export const MARKETING_CONSENT_TEXT =
  "Получать советы по карточкам и новости сервиса на почту";
export const MARKETING_CONSENT_VERSION = "mk-2026-09-05";

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= getPool()
    .query(
      `create table if not exists marketing_consents (
         id bigserial primary key,
         email text not null,
         action text not null,
         consent_text text not null,
         version text not null,
         ip text,
         user_agent text,
         created_at timestamptz not null default now()
       );
       create index if not exists marketing_consents_email_idx on marketing_consents (email);`,
    )
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

const dbConfigured = () => Boolean(process.env.PGHOST || process.env.DATABASE_URL);

/** Записать согласие/отзыв. Никогда не роняет вызывающий поток. */
export async function recordMarketingConsent(args: {
  email: string;
  granted: boolean;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  if (!dbConfigured()) return; // file-store dev mode
  try {
    await ensure();
    await getPool().query(
      `insert into marketing_consents (email, action, consent_text, version, ip, user_agent)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        args.email,
        args.granted ? "granted" : "revoked",
        MARKETING_CONSENT_TEXT,
        MARKETING_CONSENT_VERSION,
        args.ip ?? null,
        args.userAgent?.slice(0, 300) ?? null,
      ],
    );
  } catch (e) {
    console.error("[marketing-consent] failed to record:", e);
  }
}

/** Текущее состояние подписки: последняя запись журнала. */
export async function marketingOptIn(email: string): Promise<boolean> {
  if (!dbConfigured()) return false;
  try {
    await ensure();
    const { rows } = await getPool().query<{ action: string }>(
      `select action from marketing_consents where email = $1
        order by created_at desc limit 1`,
      [email],
    );
    return rows[0]?.action === "granted";
  } catch (e) {
    console.error("[marketing-consent] status failed:", e);
    return false;
  }
}

export type MarketingConsentRow = {
  email: string;
  action: string;
  created_at: string;
  ip: string | null;
};

/** Журнал согласий для админки: свежие сверху. */
export async function listMarketingConsents(limit = 300): Promise<MarketingConsentRow[]> {
  if (!dbConfigured()) return [];
  try {
    await ensure();
    const { rows } = await getPool().query<MarketingConsentRow>(
      `select email, action, created_at::text, ip from marketing_consents
        order by created_at desc limit $1`,
      [limit],
    );
    return rows;
  } catch (e) {
    console.error("[marketing-consent] list failed:", e);
    return [];
  }
}

/** Список согласных адресов (для будущей рассылки). */
export async function marketingSubscribers(): Promise<string[]> {
  if (!dbConfigured()) return [];
  try {
    await ensure();
    const { rows } = await getPool().query<{ email: string }>(
      `select distinct on (email) email, action from marketing_consents
        order by email, created_at desc`,
    );
    return rows.filter((r) => (r as { action?: string }).action === "granted").map((r) => r.email);
  } catch (e) {
    console.error("[marketing-consent] subscribers failed:", e);
    return [];
  }
}
