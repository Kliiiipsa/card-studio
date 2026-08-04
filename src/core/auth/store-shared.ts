import { createHash } from "node:crypto";

/** Shared types/constants for the auth store backends (file and postgres). */
export type UserRecord = {
  email: string;
  passHash: string;
  role: "admin" | "user";
  verified: boolean;
  createdAt: string;
};

export type RegisterStart =
  | { status: "ok"; code: string }
  | { status: "exists" }
  | { status: "cooldown"; retryInSec: number };

export type VerifyResult =
  | { status: "ok"; user: UserRecord }
  | { status: "invalid"; attemptsLeft: number }
  | { status: "expired" }
  | { status: "not_found" };

export type LoginResult =
  | { status: "ok"; user: UserRecord }
  | { status: "bad_credentials" }
  | { status: "locked"; retryInSec: number };

export const CODE_TTL_MS = 15 * 60 * 1000;
export const CODE_RESEND_COOLDOWN_MS = 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
export const LOGIN_MAX_FAILS = 8;
export const LOGIN_LOCK_MS = 10 * 60 * 1000;

export function codeHashFor(email: string, code: string): string {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

export function makeCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
