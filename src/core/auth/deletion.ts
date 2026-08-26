import { createHash } from "node:crypto";
import { getPool } from "./store-pg";
import { normalizeEmail, canonicalEmail } from "./domains";
import { deleteUser } from "./store";
import { s3Delete, s3KeyFromUrl, s3Enabled } from "@/core/storage/s3";
import {
  CODE_TTL_MS,
  CODE_RESEND_COOLDOWN_MS,
  CODE_MAX_ATTEMPTS,
  codeHashFor,
  makeCode,
} from "./store-shared";

/**
 * Удаление аккаунта (152-ФЗ: отзыв согласия на обработку ПД).
 *
 * Что происходит при удалении:
 *  - auth_users / auth_pending / auth_throttle — строки удаляются;
 *  - gen_jobs («Мои карточки») — строки удаляются, файлы стираются из S3;
 *  - analysis_cache — удаляется;
 *  - billing_balance — удаляется (остаток сгорает, об этом предупреждаем);
 *  - promo_redemptions — удаляются;
 *  - billing_tx — НЕ удаляются, а обезличиваются: это бухгалтерский след
 *    реальных платежей (ЮKassa, налог самозанятого). Почта в строках и в
 *    reference заменяется на усечённый sha256 — ПД нет, сверка с ЮKassa
 *    по yk-<id> остаётся;
 *  - auth_consents — журнал согласий обезличивается тем же хешом: дата и
 *    версии документов сохраняются как доказательство, что согласие было
 *    (проверяемо: хеш заявленной почты совпадёт со строкой), ip/user-agent
 *    затираются.
 *
 * Плюс «надгробие» в deleted_accounts (только хеш почты): при повторной
 * регистрации на ту же почту приветственный бонус не начисляется.
 */

const pgAvailable = () => Boolean(process.env.DATABASE_URL || process.env.PGHOST);

// Надгробие — по КАНОНИЧЕСКОМУ адресу (plus-варианты одного ящика = один
// след), чтобы повторный бонус нельзя было получить через user+1@ (аудит
// 2026-08-26). Согласовано с ключом welcome-бонуса.
export function emailHash(emailRaw: string): string {
  return createHash("sha256").update(`kartogen:${canonicalEmail(emailRaw)}`).digest("hex");
}

/** Обезличенная замена почты в сохраняемых строках. */
const pseudonym = (emailRaw: string) => `deleted:${emailHash(emailRaw).slice(0, 16)}`;

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getPool().query(`
        create table if not exists deleted_accounts (
          email_hash text primary key,
          deleted_at timestamptz not null default now()
        );
        create table if not exists account_deletion_pending (
          email text primary key,
          code_hash text not null,
          expires_at bigint not null,
          attempts int not null default 0,
          last_sent_at bigint not null
        );
      `);
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

/** Было ли когда-то удаление аккаунта на эту почту (бонус повторно не даём). */
export async function wasDeleted(emailRaw: string): Promise<boolean> {
  if (!pgAvailable()) return false;
  try {
    await ensureSchema();
    const { rows } = await getPool().query(
      "select 1 from deleted_accounts where email_hash = $1",
      [emailHash(emailRaw)],
    );
    return Boolean(rows[0]);
  } catch (e) {
    // не блокируем регистрацию из-за проверки бонуса
    console.error("[deletion] tombstone check failed:", e);
    return false;
  }
}

/* ------------------- код подтверждения (письмо) ------------------- */

// dev-режим без Postgres (файловый стор): коды держим в памяти процесса
const memPending = new Map<
  string,
  { codeHash: string; expiresAt: number; attempts: number; lastSentAt: number }
>();

export type DeletionStart =
  | { status: "ok"; code: string }
  | { status: "cooldown"; retryInSec: number };

export async function startDeletion(emailRaw: string): Promise<DeletionStart> {
  const email = normalizeEmail(emailRaw);
  const now = Date.now();
  const code = makeCode();

  if (!pgAvailable()) {
    const prev = memPending.get(email);
    if (prev && now - prev.lastSentAt < CODE_RESEND_COOLDOWN_MS) {
      return {
        status: "cooldown",
        retryInSec: Math.ceil((CODE_RESEND_COOLDOWN_MS - (now - prev.lastSentAt)) / 1000),
      };
    }
    memPending.set(email, {
      codeHash: codeHashFor(email, code),
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      lastSentAt: now,
    });
    return { status: "ok", code };
  }

  await ensureSchema();
  const db = getPool();
  const pending = await db.query<{ last_sent_at: string }>(
    "select last_sent_at from account_deletion_pending where email = $1",
    [email],
  );
  const lastSent = pending.rows[0] ? Number(pending.rows[0].last_sent_at) : 0;
  if (lastSent && now - lastSent < CODE_RESEND_COOLDOWN_MS) {
    return {
      status: "cooldown",
      retryInSec: Math.ceil((CODE_RESEND_COOLDOWN_MS - (now - lastSent)) / 1000),
    };
  }
  await db.query(
    `insert into account_deletion_pending (email, code_hash, expires_at, attempts, last_sent_at)
     values ($1, $2, $3, 0, $4)
     on conflict (email) do update
       set code_hash = $2, expires_at = $3, attempts = 0, last_sent_at = $4`,
    [email, codeHashFor(email, code), now + CODE_TTL_MS, now],
  );
  return { status: "ok", code };
}

export type DeletionCheck =
  | { status: "ok" }
  | { status: "invalid"; attemptsLeft: number }
  | { status: "expired" }
  | { status: "not_found" };

export async function checkDeletionCode(emailRaw: string, code: string): Promise<DeletionCheck> {
  const email = normalizeEmail(emailRaw);
  const given = codeHashFor(email, code.trim());

  if (!pgAvailable()) {
    const pending = memPending.get(email);
    if (!pending) return { status: "not_found" };
    if (Date.now() > pending.expiresAt) {
      memPending.delete(email);
      return { status: "expired" };
    }
    if (pending.codeHash !== given) {
      pending.attempts += 1;
      if (pending.attempts >= CODE_MAX_ATTEMPTS) {
        memPending.delete(email);
        return { status: "expired" };
      }
      return { status: "invalid", attemptsLeft: CODE_MAX_ATTEMPTS - pending.attempts };
    }
    memPending.delete(email);
    return { status: "ok" };
  }

  await ensureSchema();
  const db = getPool();
  const { rows } = await db.query<{ code_hash: string; expires_at: string; attempts: number }>(
    "select * from account_deletion_pending where email = $1",
    [email],
  );
  const pending = rows[0];
  if (!pending) return { status: "not_found" };
  if (Date.now() > Number(pending.expires_at)) {
    await db.query("delete from account_deletion_pending where email = $1", [email]);
    return { status: "expired" };
  }
  if (pending.code_hash !== given) {
    const attempts = pending.attempts + 1;
    if (attempts >= CODE_MAX_ATTEMPTS) {
      await db.query("delete from account_deletion_pending where email = $1", [email]);
      return { status: "expired" };
    }
    await db.query("update account_deletion_pending set attempts = $2 where email = $1", [
      email,
      attempts,
    ]);
    return { status: "invalid", attemptsLeft: CODE_MAX_ATTEMPTS - attempts };
  }
  await db.query("delete from account_deletion_pending where email = $1", [email]);
  return { status: "ok" };
}

/* --------------------------- само удаление --------------------------- */

/**
 * Полное стирание аккаунта. Порядок: сначала надгробие (даже если дальше
 * что-то упадёт, повторный бонус уже заблокирован), затем файлы S3, затем
 * строки БД, в конце — сама учётная запись.
 */
export async function eraseAccount(emailRaw: string): Promise<void> {
  const email = normalizeEmail(emailRaw);
  const alias = pseudonym(email);

  if (pgAvailable()) {
    await ensureSchema();
    const db = getPool();

    await db.query(
      "insert into deleted_accounts (email_hash) values ($1) on conflict do nothing",
      [emailHash(email)],
    );

    // Файлы генераций в S3 (по ссылкам из gen_jobs). Чужие URL (временные
    // ссылки fal, попавшие в базу когда S3 был недоступен) пропускаем.
    if (s3Enabled()) {
      try {
        const { rows } = await db.query<{ result_url: string | null }>(
          "select result_url from gen_jobs where email = $1",
          [email],
        );
        for (const r of rows) {
          const key = r.result_url ? s3KeyFromUrl(r.result_url) : null;
          if (!key) continue;
          await s3Delete(key).catch((e) =>
            console.error(`[deletion] S3 delete failed for ${key}:`, e),
          );
        }
      } catch (e) {
        console.error("[deletion] S3 cleanup failed:", e);
      }
    }

    await db.query("delete from gen_jobs where email = $1", [email]).catch(swallow("gen_jobs"));
    await db
      .query("delete from analysis_cache where email = $1", [email])
      .catch(swallow("analysis_cache"));
    await db
      .query("delete from promo_redemptions where email = $1", [email])
      .catch(swallow("promo_redemptions"));
    await db
      .query("delete from billing_balance where email = $1", [email])
      .catch(swallow("billing_balance"));

    // Платёжный след обезличиваем: почту — на псевдоним; в reference почта
    // встречается в welcome:<email> и promo:<code>:<email> — заменяем и
    // дописываем id, чтобы не столкнуться с уникальностью reference.
    await db
      .query(
        `update billing_tx
            set reference = replace(reference, $1, $2) || ':' || id
          where email = $1 and reference like '%' || $1 || '%'`,
        [email, alias],
      )
      .catch(swallow("billing_tx references"));
    await db
      .query("update billing_tx set email = $2 where email = $1", [email, alias])
      .catch(swallow("billing_tx"));

    // Журнал согласий: дата и версии остаются (доказательство согласия),
    // ПД — нет.
    await db
      .query(
        "update auth_consents set email = $2, ip = null, user_agent = null where email = $1",
        [email, alias],
      )
      .catch(swallow("auth_consents"));

    await db
      .query("delete from account_deletion_pending where email = $1", [email])
      .catch(swallow("account_deletion_pending"));
  }

  // Учётная запись — последней: до этого момента пользователь ещё может
  // повторить запрос, если что-то упало на середине.
  await deleteUser(email);
}

const swallow = (what: string) => (e: unknown) => {
  // отдельная таблица могла ещё не существовать (schema on demand) — не
  // валим всё удаление, но оставляем след в логах
  console.error(`[deletion] cleanup of ${what} failed:`, e);
};
