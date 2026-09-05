import { getPool } from "./store-pg";

/**
 * Consent journal (152-ФЗ): who accepted which document versions and when.
 * One row per registration; the versions are the "Редакция от" dates of the
 * documents in content/legal at the moment of acceptance. If a dispute ever
 * asks "did this user agree, and to which text?" — this table answers.
 */
export const LEGAL_VERSION = "2026-09-05";

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= getPool()
    .query(
      `create table if not exists auth_consents (
         id bigserial primary key,
         email text not null,
         terms_version text not null,
         privacy_version text not null,
         ip text,
         user_agent text,
         accepted_at timestamptz not null default now()
       );
       create index if not exists auth_consents_email_idx on auth_consents (email);`,
    )
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

/** Registration IP per email (latest consent row) — for the admin's fraud eye. */
export async function registrationIps(emails: string[]): Promise<Record<string, string>> {
  if ((!process.env.PGHOST && !process.env.DATABASE_URL) || !emails.length) return {};
  try {
    await ensure();
    const { rows } = await getPool().query<{ email: string; ip: string | null }>(
      `select distinct on (email) email, ip
         from auth_consents
        where email = any($1)
        order by email, accepted_at desc`,
      [emails],
    );
    return Object.fromEntries(rows.filter((r) => r.ip).map((r) => [r.email, r.ip as string]));
  } catch (e) {
    console.error("[consent] ip lookup failed:", e);
    return {};
  }
}

export async function recordConsent(args: {
  email: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  if (!process.env.PGHOST && !process.env.DATABASE_URL) return; // file-store dev mode
  try {
    await ensure();
    await getPool().query(
      `insert into auth_consents (email, terms_version, privacy_version, ip, user_agent)
       values ($1, $2, $2, $3, $4)`,
      [args.email, LEGAL_VERSION, args.ip ?? null, args.userAgent?.slice(0, 300) ?? null],
    );
  } catch (e) {
    // never block registration on the journal — but do make it visible
    console.error("[consent] failed to record:", e);
  }
}
