import { Pool } from "pg";
import { hashPassword, verifyPassword } from "./passwords";
import { normalizeEmail } from "./domains";
import {
  type UserRecord,
  type RegisterStart,
  type VerifyResult,
  type LoginResult,
  CODE_TTL_MS,
  CODE_RESEND_COOLDOWN_MS,
  CODE_MAX_ATTEMPTS,
  LOGIN_MAX_FAILS,
  LOGIN_LOCK_MS,
  codeHashFor,
  makeCode,
} from "./store-shared";

/**
 * Postgres-backed auth store (production). Selected when DATABASE_URL or
 * PGHOST is set — see store.ts. Connection comes from DATABASE_URL or the
 * standard PG* env vars that `pg` reads natively. The schema auto-migrates
 * on first use.
 */
let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = process.env.DATABASE_URL
      ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
      : new Pool({ max: 5 }); // PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
  }
  return pool;
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getPool().query(`
        create table if not exists auth_users (
          email text primary key,
          pass_hash text not null,
          role text not null default 'user',
          verified boolean not null default false,
          created_at timestamptz not null default now()
        );
        create table if not exists auth_pending (
          email text primary key,
          pass_hash text not null,
          code_hash text not null,
          expires_at bigint not null,
          attempts int not null default 0,
          last_sent_at bigint not null
        );
        create table if not exists auth_throttle (
          email text primary key,
          fails int not null default 0,
          locked_until bigint not null default 0
        );
      `);
    })().catch((e) => {
      schemaReady = null; // retry on the next call
      throw e;
    });
  }
  return schemaReady;
}

type UserRow = {
  email: string;
  pass_hash: string;
  role: string;
  verified: boolean;
  created_at: Date;
};

function toUser(r: UserRow): UserRecord {
  return {
    email: r.email,
    passHash: r.pass_hash,
    role: r.role === "admin" ? "admin" : "user",
    verified: r.verified,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/** Admin from env is always present, verified and matches the env password. */
async function ensureAdmin(): Promise<void> {
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const { rows } = await getPool().query<UserRow>(
    "select * from auth_users where email = $1",
    [email],
  );
  const existing = rows[0];
  if (existing && existing.role === "admin" && verifyPassword(password, existing.pass_hash)) return;
  await getPool().query(
    `insert into auth_users (email, pass_hash, role, verified)
     values ($1, $2, 'admin', true)
     on conflict (email) do update set pass_hash = $2, role = 'admin', verified = true`,
    [email, hashPassword(password)],
  );
}

export async function getUser(emailRaw: string): Promise<UserRecord | null> {
  await ensureSchema();
  await ensureAdmin();
  const { rows } = await getPool().query<UserRow>(
    "select * from auth_users where email = $1",
    [normalizeEmail(emailRaw)],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function startRegistration(
  emailRaw: string,
  password: string,
): Promise<RegisterStart> {
  await ensureSchema();
  await ensureAdmin();
  const email = normalizeEmail(emailRaw);
  const db = getPool();

  const user = await db.query<UserRow>(
    "select * from auth_users where email = $1 and verified = true",
    [email],
  );
  if (user.rows[0]) return { status: "exists" };

  const now = Date.now();
  const pending = await db.query<{ last_sent_at: string }>(
    "select last_sent_at from auth_pending where email = $1",
    [email],
  );
  const lastSent = pending.rows[0] ? Number(pending.rows[0].last_sent_at) : 0;
  if (lastSent && now - lastSent < CODE_RESEND_COOLDOWN_MS) {
    return {
      status: "cooldown",
      retryInSec: Math.ceil((CODE_RESEND_COOLDOWN_MS - (now - lastSent)) / 1000),
    };
  }

  const code = makeCode();
  await db.query(
    `insert into auth_pending (email, pass_hash, code_hash, expires_at, attempts, last_sent_at)
     values ($1, $2, $3, $4, 0, $5)
     on conflict (email) do update
       set pass_hash = $2, code_hash = $3, expires_at = $4, attempts = 0, last_sent_at = $5`,
    [email, hashPassword(password), codeHashFor(email, code), now + CODE_TTL_MS, now],
  );
  return { status: "ok", code };
}

export async function confirmRegistration(
  emailRaw: string,
  code: string,
): Promise<VerifyResult> {
  await ensureSchema();
  const email = normalizeEmail(emailRaw);
  const db = getPool();

  const { rows } = await db.query<{
    pass_hash: string;
    code_hash: string;
    expires_at: string;
    attempts: number;
  }>("select * from auth_pending where email = $1", [email]);
  const pending = rows[0];
  if (!pending) return { status: "not_found" };

  if (Date.now() > Number(pending.expires_at)) {
    await db.query("delete from auth_pending where email = $1", [email]);
    return { status: "expired" };
  }

  if (pending.code_hash !== codeHashFor(email, code.trim())) {
    const attempts = pending.attempts + 1;
    if (attempts >= CODE_MAX_ATTEMPTS) {
      await db.query("delete from auth_pending where email = $1", [email]);
      return { status: "expired" };
    }
    await db.query("update auth_pending set attempts = $2 where email = $1", [email, attempts]);
    return { status: "invalid", attemptsLeft: CODE_MAX_ATTEMPTS - attempts };
  }

  const inserted = await db.query<UserRow>(
    `insert into auth_users (email, pass_hash, role, verified)
     values ($1, $2, 'user', true)
     on conflict (email) do update set pass_hash = $2, verified = true
     returning *`,
    [email, pending.pass_hash],
  );
  await db.query("delete from auth_pending where email = $1", [email]);
  await db.query("delete from auth_throttle where email = $1", [email]);
  return { status: "ok", user: toUser(inserted.rows[0]) };
}

export async function checkLogin(emailRaw: string, password: string): Promise<LoginResult> {
  await ensureSchema();
  await ensureAdmin();
  const email = normalizeEmail(emailRaw);
  const db = getPool();
  const now = Date.now();

  const throttle = await db.query<{ fails: number; locked_until: string }>(
    "select * from auth_throttle where email = $1",
    [email],
  );
  const lockedUntil = throttle.rows[0] ? Number(throttle.rows[0].locked_until) : 0;
  if (lockedUntil > now) {
    return { status: "locked", retryInSec: Math.ceil((lockedUntil - now) / 1000) };
  }

  const { rows } = await db.query<UserRow>(
    "select * from auth_users where email = $1 and verified = true",
    [email],
  );
  const user = rows[0];
  if (user && verifyPassword(password, user.pass_hash)) {
    await db.query("delete from auth_throttle where email = $1", [email]);
    return { status: "ok", user: toUser(user) };
  }

  const fails = (throttle.rows[0]?.fails ?? 0) + 1;
  await db.query(
    `insert into auth_throttle (email, fails, locked_until) values ($1, $2, $3)
     on conflict (email) do update set fails = $2, locked_until = $3`,
    [email, fails, fails >= LOGIN_MAX_FAILS ? now + LOGIN_LOCK_MS : 0],
  );
  return { status: "bad_credentials" };
}

export async function listUsers(): Promise<UserRecord[]> {
  await ensureSchema();
  await ensureAdmin();
  const { rows } = await getPool().query<UserRow>(
    "select * from auth_users order by created_at asc",
  );
  return rows.map(toUser);
}
