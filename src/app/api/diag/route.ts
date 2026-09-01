import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import { attributionSummary } from "@/core/analytics/attribution";
import { getRuntimeMetrics } from "@/core/ops/runtime-metrics";

/**
 * READ-ONLY диагностика для владельца/ассистента. Прод-БД за файрволом и с
 * динамического IP недоступна напрямую — а сервер стоит внутри файрвола и
 * читает её нормально. Этот эндпоинт отдаёт по HTTPS АГРЕГАТЫ (счётчики), без
 * сырых персональных данных, и закрыт секретом DIAG_TOKEN.
 *
 * Безопасность:
 *  - если DIAG_TOKEN не задан — эндпоинт выключен (404), безопасный дефолт;
 *  - токен сверяется в постоянное время (timingSafeEqual);
 *  - только SELECT, ничего не меняет;
 *  - почты не отдаются (только домены и агрегаты); ошибки — наши же строки.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let pool: Pool | null = null;
function db(): Pool {
  if (!pool) {
    pool = process.env.DATABASE_URL
      ? new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
      : new Pool({ max: 2 });
  }
  return pool;
}

function authorized(req: Request): boolean {
  const expected = process.env.DIAG_TOKEN;
  if (!expected) return false; // выключен, пока секрет не задан
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const got = bearer || new URL(req.url).searchParams.get("token") || "";
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function rows(sql: string): Promise<unknown> {
  try {
    const r = await db().query(sql);
    return r.rows;
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 120) : "query failed" };
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    // не раскрываем существование эндпоинта без токена
    return new NextResponse("Not found", { status: 404 });
  }

  const [
    usersTotal,
    usersByDay,
    domains,
    generatedVsNot,
    genByKindStatus,
    failRate,
    topErrors,
    firstGenKind,
    welcome,
    payments,
    genSamples,
  ] = await Promise.all([
    rows(`select count(*)::int total, count(*) filter(where verified)::int verified
          from auth_users where role <> 'admin'`),
    rows(`select created_at::date d, count(*)::int n from auth_users where role <> 'admin'
          group by 1 order by 1 desc limit 10`),
    rows(`select split_part(email,'@',2) domain, count(*)::int n from auth_users where role <> 'admin'
          group by 1 order by 2 desc limit 15`),
    rows(`select count(*) filter(where g.email is not null)::int generated,
                 count(*) filter(where g.email is null)::int never
          from auth_users u
          left join (select distinct email from gen_jobs) g on g.email = u.email
          where u.role <> 'admin'`),
    rows(`select kind, status, count(*)::int n from gen_jobs group by 1,2 order by 1,2`),
    rows(`select count(*)::int total, count(*) filter(where status='failed')::int failed from gen_jobs`),
    rows(`select kind, left(coalesce(error,''),90) err, count(*)::int n
          from gen_jobs where status='failed' group by 1,2 order by 3 desc limit 12`),
    rows(`select kind, count(*)::int n from (
            select email, kind, row_number() over(partition by email order by created_at) rn
            from gen_jobs
          ) t where rn = 1 group by 1 order by 2 desc`),
    rows(`select count(*)::int n, coalesce(sum(amount),0)::int rub from billing_tx where type='welcome'`),
    rows(`select count(distinct email)::int payers, coalesce(sum(amount),0)::int rub
          from billing_tx where type='topup' and reference like 'yk-%'`),
    // Последние генерации: что ввели + какой промпт ушёл в модель (payload без
    // ПД — только данные товара, бриф и промпт). Для разбора «что генерят».
    rows(`select kind, status, to_char(created_at,'MM-DD HH24:MI') t,
                 left(payload::text, 1800) payload
          from gen_jobs where payload is not null
          order by created_at desc limit 25`),
  ]);

  let sources: unknown;
  try {
    sources = await attributionSummary();
  } catch (e) {
    sources = { error: e instanceof Error ? e.message.slice(0, 120) : "sources failed" };
  }

  let server: unknown;
  try {
    server = getRuntimeMetrics();
  } catch {
    server = null;
  }

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      users: { totals: usersTotal, byDay: usersByDay, domains, generatedVsNot },
      generations: { byKindStatus: genByKindStatus, failRate, topErrors, firstGenKind, samples: genSamples },
      billing: { welcome, payments },
      sources,
      server,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
