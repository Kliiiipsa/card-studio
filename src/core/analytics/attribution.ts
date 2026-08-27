import { Pool } from "pg";

/**
 * Атрибуция регистраций по каналам (UTM). Клиент запоминает ПЕРВЫЙ источник
 * (first-touch) в localStorage и присылает его при регистрации; здесь пишем его
 * рядом с email. Потом в админке видно, из какого канала пришёл каждый платящий
 * (Директ / VK / без метки), и считается CAC по источникам.
 *
 * Хранит только маркетинговые метки — не персональные данные сверх email, который
 * и так есть в аккаунте. За границу ничего не уходит (БД в РФ, Timeweb).
 */
export type Attribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  landing?: string;
  referrer?: string;
};

function enabled(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.PGHOST);
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
    schemaReady = getPool()
      .query(
        `create table if not exists signup_attribution (
           email text primary key,
           source text, medium text, campaign text, content text, term text,
           landing text, referrer text,
           created_at timestamptz not null default now()
         )`,
      )
      .then(() => undefined)
      .catch((e) => {
        schemaReady = null;
        throw e;
      });
  }
  return schemaReady;
}

const clip = (s: string | undefined, n: number): string | null =>
  s && s.trim() ? s.trim().slice(0, n) : null;

/** First-touch: источник пишется ОДИН раз на email (on conflict do nothing). */
export async function saveAttribution(email: string, a: Attribution): Promise<void> {
  if (!enabled()) return;
  // пустую атрибуцию (ни utm, ни реферера) не пишем — это прямой/органический заход
  if (!a.source && !a.medium && !a.campaign && !a.referrer) return;
  await ensureSchema();
  await getPool().query(
    `insert into signup_attribution
       (email, source, medium, campaign, content, term, landing, referrer)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (email) do nothing`,
    [
      email,
      clip(a.source, 60),
      clip(a.medium, 60),
      clip(a.campaign, 120),
      clip(a.content, 120),
      clip(a.term, 120),
      clip(a.landing, 200),
      clip(a.referrer, 300),
    ],
  );
}

export type SourceRow = {
  source: string;
  registrations: number;
  verified: number;
  paying: number;
  revenueRub: number;
};

/**
 * Сводка по источникам: сколько регистраций, из них подтверждённых и платящих,
 * и суммарная выручка (реальные платежи ЮKassa, гены 1:1 к ₽). Источник без
 * метки = прямой/органический трафик.
 */
export async function attributionSummary(): Promise<SourceRow[]> {
  if (!enabled()) return [];
  await ensureSchema();
  const { rows } = await getPool().query<{
    source: string;
    registrations: string;
    verified: string;
    paying: string;
    revenue: string | null;
  }>(
    `with attr as (
       select email, coalesce(nullif(source,''), '(без метки)') as source
       from signup_attribution
     ),
     pay as (
       select email, sum(amount) as rub
       from billing_tx
       where type = 'topup' and reference like 'yk-%'
       group by email
     )
     select a.source,
       count(*)::int                       as registrations,
       count(u.email)::int                 as verified,
       count(p.email)::int                 as paying,
       coalesce(sum(p.rub), 0)::int        as revenue
     from attr a
     left join auth_users u on u.email = a.email and u.verified = true
     left join pay p        on p.email = a.email
     group by a.source
     order by paying desc, registrations desc`,
  );
  return rows.map((r) => ({
    source: r.source,
    registrations: Number(r.registrations),
    verified: Number(r.verified),
    paying: Number(r.paying),
    revenueRub: Number(r.revenue ?? 0),
  }));
}
