import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
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
 * File-backed auth store — local development without a database. Lives in
 * .data/ (gitignored). Production uses the postgres backend (store-pg.ts);
 * store.ts picks the implementation.
 */
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

/** Admin from env is always present, verified and matches the env password. */
async function ensureAdmin(data: AuthData): Promise<void> {
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = data.users[email];
  if (existing && existing.role === "admin" && (await verifyPassword(password, existing.passHash)))
    return;
  data.users[email] = {
    email,
    passHash: await hashPassword(password),
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

export function upsertOAuthUser(
  emailRaw: string,
): Promise<{ user: UserRecord; isNew: boolean }> {
  return locked(async (data) => {
    await ensureAdmin(data);
    const email = normalizeEmail(emailRaw);
    const existing = data.users[email];
    if (existing) {
      if (!existing.verified) {
        existing.verified = true;
        await save(data);
      }
      return { user: existing, isNew: false };
    }
    const user: UserRecord = {
      email,
      passHash: await hashPassword(randomBytes(24).toString("hex")),
      role: "user",
      verified: true,
      createdAt: new Date().toISOString(),
    };
    data.users[email] = user;
    await save(data);
    return { user, isNew: true };
  });
}

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

    const code = makeCode();
    data.pending[email] = {
      email,
      passHash: await hashPassword(password),
      codeHash: codeHashFor(email, code),
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      lastSentAt: now,
    };
    return { status: "ok", code } as const;
  });
}

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
    if (user?.verified && (await verifyPassword(password, user.passHash))) {
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

export function changePassword(
  emailRaw: string,
  oldPassword: string,
  newPassword: string,
): Promise<"ok" | "bad_password"> {
  const email = normalizeEmail(emailRaw);
  return locked(async (data): Promise<"ok" | "bad_password"> => {
    const user = data.users[email];
    if (!user?.verified || !(await verifyPassword(oldPassword, user.passHash))) return "bad_password";
    user.passHash = await hashPassword(newPassword);
    return "ok";
  });
}

/** Полное удаление учётной записи (аккаунт админа из env не трогаем). */
export function deleteUser(emailRaw: string): Promise<void> {
  const email = normalizeEmail(emailRaw);
  return locked((data) => {
    if (data.users[email]?.role !== "admin") delete data.users[email];
    delete data.pending[email];
    delete data.throttle[email];
  });
}

export function listUsers(): Promise<UserRecord[]> {
  return locked(async (data) => {
    await ensureAdmin(data);
    return Object.values(data.users).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}
