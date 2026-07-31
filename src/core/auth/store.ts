import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { hashPassword, verifyPassword } from "./passwords";
import { normalizeEmail } from "./domains";

/**
 * File-backed user store for the local/single-user stage. Lives in .data/
 * (gitignored). NOTE: Vercel functions have no persistent disk — before the
 * public deploy this module is the single place to swap for a real DB
 * (Upstash/Postgres): the rest of the app only talks to the functions below.
 */
export type UserRecord = {
  email: string;
  passHash: string;
  role: "admin" | "user";
  verified: boolean;
  createdAt: string;
};

type PendingRecord = {
  email: string;
  passHash: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
};

type ThrottleRecord = { fails: number; lockedUntil: number };

type AuthData = {
  users: Record<string, UserRecord>;
  pending: Record<string, PendingRecord>;
  throttle: Record<string, ThrottleRecord>;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "auth.json");

export const CODE_TTL_MS = 15 * 60 * 1000;
export const CODE_RESEND_COOLDOWN_MS = 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
const LOGIN_MAX_FAILS = 8;
const LOGIN_LOCK_MS = 10 * 60 * 1000;

// Serialize all read-modify-write cycles through one promise chain so two
// concurrent requests can't clobber each other's writes.
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: (data: AuthData) => Promise<T> | T): Promise<T> {
  const next = chain.then(async () => {
    const data = await load();
    const result = await fn(data);
    await save(data);
    return result;
  });
  chain = next.catch(() => undefined);
  return next;
}

async function load(): Promise<AuthData> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AuthData>;
    return {
      users: parsed.users ?? {},
      pending: parsed.pending ?? {},
      throttle: parsed.throttle ?? {},
    };
  } catch {
    return { users: {}, pending: {}, throttle: {} };
  }
}

async function save(data: AuthData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
}

function codeHashFor(email: string, code: string): string {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

/**
 * The admin account comes from env (ADMIN_EMAIL/ADMIN_PASSWORD), is always
 * verified and never needs the email code — the temporary arrangement the
 * owner asked for. Env is the source of truth: a changed env password
 * re-hashes on the next call.
 */
async function ensureAdmin(data: AuthData): Promise<void> {
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = data.users[email];
  if (existing && existing.role === "admin" && verifyPassword(password, existing.passHash)) return;
  data.users[email] = {
    email,
    passHash: hashPassword(password),
    role: "admin",
    verified: true,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

export function getUser(email: string): Promise<UserRecord | null> {
  return locked(async (data) => {
    await ensureAdmin(data);
    return data.users[normalizeEmail(email)] ?? null;
  });
}

export type RegisterStart =
  | { status: "ok"; code: string }
  | { status: "exists" }
  | { status: "cooldown"; retryInSec: number };

/** Create/refresh a pending registration and mint a fresh 6-digit code. */
export function startRegistration(emailRaw: string, password: string): Promise<RegisterStart> {
  const email = normalizeEmail(emailRaw);
  return locked(async (data) => {
    await ensureAdmin(data);
    if (data.users[email]?.verified) return { status: "exists" } as const;

    const prev = data.pending[email];
    const now = Date.now();
    if (prev && now - prev.lastSentAt < CODE_RESEND_COOLDOWN_MS) {
      return {
        status: "cooldown",
        retryInSec: Math.ceil((CODE_RESEND_COOLDOWN_MS - (now - prev.lastSentAt)) / 1000),
      } as const;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    data.pending[email] = {
      email,
      passHash: hashPassword(password),
      codeHash: codeHashFor(email, code),
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      lastSentAt: now,
    };
    return { status: "ok", code } as const;
  });
}

export type VerifyResult =
  | { status: "ok"; user: UserRecord }
  | { status: "invalid"; attemptsLeft: number }
  | { status: "expired" }
  | { status: "not_found" };

/** Check the emailed code; on success the account is created verified. */
export function confirmRegistration(emailRaw: string, code: string): Promise<VerifyResult> {
  const email = normalizeEmail(emailRaw);
  return locked((data): VerifyResult => {
    const pending = data.pending[email];
    if (!pending) return { status: "not_found" };
    if (Date.now() > pending.expiresAt) {
      delete data.pending[email];
      return { status: "expired" };
    }
    if (pending.codeHash !== codeHashFor(email, code.trim())) {
      pending.attempts += 1;
      if (pending.attempts >= CODE_MAX_ATTEMPTS) {
        delete data.pending[email];
        return { status: "expired" };
      }
      return { status: "invalid", attemptsLeft: CODE_MAX_ATTEMPTS - pending.attempts };
    }
    const user: UserRecord = {
      email,
      passHash: pending.passHash,
      role: "user",
      verified: true,
      createdAt: new Date().toISOString(),
    };
    data.users[email] = user;
    delete data.pending[email];
    delete data.throttle[email];
    return { status: "ok", user };
  });
}

export type LoginResult =
  | { status: "ok"; user: UserRecord }
  | { status: "bad_credentials" }
  | { status: "locked"; retryInSec: number };

export function checkLogin(emailRaw: string, password: string): Promise<LoginResult> {
  const email = normalizeEmail(emailRaw);
  return locked(async (data): Promise<LoginResult> => {
    await ensureAdmin(data);
    const now = Date.now();
    const throttle = data.throttle[email];
    if (throttle && throttle.lockedUntil > now) {
      return { status: "locked", retryInSec: Math.ceil((throttle.lockedUntil - now) / 1000) };
    }

    const user = data.users[email];
    if (user?.verified && verifyPassword(password, user.passHash)) {
      delete data.throttle[email];
      return { status: "ok", user };
    }

    const fails = (throttle?.fails ?? 0) + 1;
    data.throttle[email] = {
      fails,
      lockedUntil: fails >= LOGIN_MAX_FAILS ? now + LOGIN_LOCK_MS : 0,
    };
    return { status: "bad_credentials" };
  });
}

export function listUsers(): Promise<UserRecord[]> {
  return locked(async (data) => {
    await ensureAdmin(data);
    return Object.values(data.users).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}
