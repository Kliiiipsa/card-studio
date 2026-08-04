import { Pool } from "pg";

/**
 * Server-tracked generation jobs (Postgres). The point: a generation survives
 * the user closing the tab — the in-process watcher finishes it, stores the
 * image in S3 and charges the sparks; the page restores the result on return.
 */
export type GenJobStatus = "processing" | "completed" | "failed";

export type GenJob = {
  id: string;
  email: string;
  kind: string;
  status: GenJobStatus;
  /** whatever the page needs to restore itself (brief, textBaked …) */
  payload: unknown;
  resultUrl: string | null;
  error: string | null;
  falStatusUrl: string | null;
  falResponseUrl: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export function jobsEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.PGHOST);
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = process.env.DATABASE_URL
      ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
      : new Pool({ max: 5 });
  }
  return pool;
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getPool().query(`
        create table if not exists gen_jobs (
          id text primary key,
          email text not null,
          kind text not null default 'infographic',
          status text not null default 'processing',
          payload jsonb,
          result_url text,
          error text,
          fal_status_url text,
          fal_response_url text,
          created_at timestamptz not null default now(),
          finished_at timestamptz
        );
        create index if not exists gen_jobs_email_idx on gen_jobs (email, created_at desc);
        create index if not exists gen_jobs_status_idx on gen_jobs (status);
      `);
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toJob(r: any): GenJob {
  return {
    id: r.id,
    email: r.email,
    kind: r.kind,
    status: r.status,
    payload: r.payload,
    resultUrl: r.result_url,
    error: r.error,
    falStatusUrl: r.fal_status_url,
    falResponseUrl: r.fal_response_url,
    createdAt: new Date(r.created_at).toISOString(),
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
  };
}

export async function createJob(args: {
  id: string;
  email: string;
  kind: string;
  payload: unknown;
  falStatusUrl: string;
  falResponseUrl: string;
}): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `insert into gen_jobs (id, email, kind, payload, fal_status_url, fal_response_url)
     values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing`,
    [args.id, args.email, args.kind, JSON.stringify(args.payload), args.falStatusUrl, args.falResponseUrl],
  );
}

export async function completeJob(id: string, resultUrl: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `update gen_jobs set status = 'completed', result_url = $2, finished_at = now()
     where id = $1 and status = 'processing'`,
    [id, resultUrl],
  );
}

export async function failJob(id: string, error: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `update gen_jobs set status = 'failed', error = $2, finished_at = now()
     where id = $1 and status = 'processing'`,
    [id, error.slice(0, 500)],
  );
}

export async function getJob(id: string, email: string): Promise<GenJob | null> {
  await ensureSchema();
  const { rows } = await getPool().query(`select * from gen_jobs where id = $1 and email = $2`, [
    id,
    email,
  ]);
  return rows[0] ? toJob(rows[0]) : null;
}

/** Most recent job of a kind for the user (to restore the page on return). */
export async function latestJob(email: string, kind: string): Promise<GenJob | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `select * from gen_jobs where email = $1 and kind = $2 order by created_at desc limit 1`,
    [email, kind],
  );
  return rows[0] ? toJob(rows[0]) : null;
}

/** Unfinished jobs — re-watched after a server restart. */
export async function processingJobs(limit = 50): Promise<GenJob[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `select * from gen_jobs where status = 'processing' order by created_at asc limit $1`,
    [limit],
  );
  return rows.map(toJob);
}
