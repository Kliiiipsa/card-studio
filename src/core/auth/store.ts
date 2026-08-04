import * as fileStore from "./store-file";
import * as pgStore from "./store-pg";

/**
 * Auth store facade. Backend is chosen by env:
 *  - DATABASE_URL or PGHOST set → Postgres (production, Timeweb managed DB)
 *  - otherwise → local JSON file in .data/ (development without a database)
 * Both backends implement the same functions with identical semantics.
 */
export type { UserRecord, RegisterStart, VerifyResult, LoginResult } from "./store-shared";
export { CODE_TTL_MS, CODE_RESEND_COOLDOWN_MS, CODE_MAX_ATTEMPTS } from "./store-shared";

const impl =
  process.env.DATABASE_URL || process.env.PGHOST ? pgStore : fileStore;

export const getUser = impl.getUser;
export const startRegistration = impl.startRegistration;
export const confirmRegistration = impl.confirmRegistration;
export const checkLogin = impl.checkLogin;
export const listUsers = impl.listUsers;
