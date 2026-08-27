import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { jobsEnabled, storageStats, listJobsForAdmin } from "@/core/jobs/jobs";
import { billingEnabled } from "@/core/billing/billing";
import { yookassaConfigured } from "@/core/billing/yookassa";
import { isSmtpConfigured } from "@/core/auth/mailer";
import { getRuntimeMetrics } from "@/core/ops/runtime-metrics";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * ADMIN: «Состояние сервиса» — одним экраном всё, что может тихо сломаться и
 * о чём мы иначе узнаём только от клиента: деньги у провайдеров, доступность
 * базы и хранилища, доля неудачных генераций за сутки.
 *
 * Все проверки независимы и не валят страницу: любая упавшая отдаёт
 * status: "unknown" с причиной.
 */
export type HealthStatus = "ok" | "warn" | "crit" | "unknown" | "off";

export type HealthCheck = {
  id: string;
  title: string;
  status: HealthStatus;
  /** крупное значение на карточке */
  value?: string;
  /** пояснение под значением */
  hint?: string;
};

const S3_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 ГБ тариф Timeweb S3
/** курс для прикидки «на сколько хватит» — точность здесь не нужна */
const RUB_PER_USD = 80;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

/** fal.ai: остаток на счёте в долларах (rest.fal.ai/billing/user_balance). */
async function checkFal(): Promise<HealthCheck> {
  const key = process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "";
  if (!key) return { id: "fal", title: "Баланс fal.ai", status: "off", hint: "ключ не задан" };
  try {
    const res = await withTimeout(
      fetch("https://rest.fal.ai/billing/user_balance", {
        headers: { Authorization: `Key ${key}` },
        cache: "no-store",
      }),
      8000,
    );
    if (!res.ok) {
      return {
        id: "fal",
        title: "Баланс fal.ai",
        status: res.status === 401 || res.status === 403 ? "crit" : "unknown",
        hint: `ответ ${res.status}`,
      };
    }
    const usd = Number((await res.text()).trim());
    if (!Number.isFinite(usd)) {
      return { id: "fal", title: "Баланс fal.ai", status: "unknown", hint: "не удалось прочитать" };
    }
    // ориентир: инфографика ≈ $0.07, видео ≈ $0.35
    const videos = Math.floor(usd / 0.35);
    return {
      id: "fal",
      title: "Баланс fal.ai",
      status: usd < 2 ? "crit" : usd < 10 ? "warn" : "ok",
      value: `$${usd.toFixed(2)}`,
      hint: `≈ ${Math.round(usd * RUB_PER_USD)} ₽ · хватит примерно на ${videos} видео или ${Math.floor(usd / 0.07)} инфографик`,
    };
  } catch (e) {
    return {
      id: "fal",
      title: "Баланс fal.ai",
      status: "unknown",
      hint: e instanceof Error ? e.message : "ошибка запроса",
    };
  }
}

/** Timeweb: баланс аккаунта и на сколько дней его хватит при текущем расходе. */
async function checkTimeweb(): Promise<HealthCheck> {
  const token = process.env.TIMEWEB_TOKEN ?? "";
  if (!token) {
    return {
      id: "timeweb",
      title: "Баланс Timeweb",
      status: "off",
      hint: "добавьте TIMEWEB_TOKEN в переменные окружения",
    };
  }
  try {
    const res = await withTimeout(
      fetch("https://api.timeweb.cloud/api/v1/account/finances", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
      8000,
    );
    if (!res.ok) {
      return { id: "timeweb", title: "Баланс Timeweb", status: "unknown", hint: `ответ ${res.status}` };
    }
    const data = (await res.json()) as {
      finances?: { balance?: number; hourly_cost?: number };
    };
    const balance = Number(data.finances?.balance ?? 0);
    const hourly = Number(data.finances?.hourly_cost ?? 0);
    const days = hourly > 0 ? balance / (hourly * 24) : Infinity;
    return {
      id: "timeweb",
      title: "Баланс Timeweb",
      status: days < 3 ? "crit" : days < 10 ? "warn" : "ok",
      value: `${balance.toFixed(0)} ₽`,
      hint: Number.isFinite(days)
        ? `хватит примерно на ${Math.floor(days)} дн. (расход ${(hourly * 24).toFixed(0)} ₽/сут)`
        : "расход неизвестен",
    };
  } catch (e) {
    return {
      id: "timeweb",
      title: "Баланс Timeweb",
      status: "unknown",
      hint: e instanceof Error ? e.message : "ошибка запроса",
    };
  }
}

/** Postgres: доступность и время ответа (важно из-за файрвола по IP). */
async function checkDatabase(): Promise<HealthCheck> {
  if (!billingEnabled()) {
    return { id: "db", title: "База данных", status: "off", hint: "не настроена" };
  }
  const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
    : new Pool({ max: 1 });
  const started = Date.now();
  try {
    await withTimeout(pool.query("select 1"), 6000);
    const ms = Date.now() - started;
    return {
      id: "db",
      title: "База данных",
      status: ms > 2000 ? "warn" : "ok",
      value: "доступна",
      hint: `ответ за ${ms} мс`,
    };
  } catch (e) {
    return {
      id: "db",
      title: "База данных",
      status: "crit",
      value: "недоступна",
      hint: e instanceof Error ? e.message.slice(0, 120) : "ошибка подключения",
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** S3: занятое место и проверка записи (без записи результаты «живут» 1 час). */
async function checkStorage(): Promise<HealthCheck> {
  const configured =
    process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY;
  if (!configured) {
    return { id: "s3", title: "Хранилище S3", status: "off", hint: "не настроено" };
  }
  try {
    const { count, bytes } = jobsEnabled() ? await storageStats() : { count: 0, bytes: 0 };
    const usedPct = (bytes / S3_QUOTA_BYTES) * 100;
    const { s3Put } = await import("@/core/storage/s3");
    await withTimeout(
      s3Put("health/probe.txt", Buffer.from(new Date().toISOString()), "text/plain"),
      8000,
    );
    return {
      id: "s3",
      title: "Хранилище S3",
      status: usedPct > 90 ? "crit" : usedPct > 70 ? "warn" : "ok",
      value: `${(bytes / 1024 / 1024).toFixed(0)} МБ · ${usedPct.toFixed(0)}%`,
      hint: `${count} файлов из квоты 10 ГБ · запись работает`,
    };
  } catch (e) {
    return {
      id: "s3",
      title: "Хранилище S3",
      status: "crit",
      value: "запись не работает",
      hint: `результаты не сохранятся: ${e instanceof Error ? e.message.slice(0, 90) : "ошибка"}`,
    };
  }
}

/** Qwen в Yandex Cloud: тексты, брифы, переводы, анализ. */
async function checkLLM(): Promise<HealthCheck> {
  if (process.env.AI_LLM_PROVIDER === "mock" || !process.env.YANDEX_API_KEY) {
    return { id: "llm", title: "Тексты (Qwen)", status: "off", hint: "демо-режим или ключ не задан" };
  }
  try {
    const { getLLMProvider } = await import("@/core/ai/providers");
    const started = Date.now();
    await withTimeout(
      getLLMProvider().complete({
        maxTokens: 1,
        temperature: 0,
        messages: [{ role: "user", content: "ok" }],
      }),
      12000,
    );
    return {
      id: "llm",
      title: "Тексты (Qwen)",
      status: "ok",
      value: "отвечает",
      hint: `проверка за ${Date.now() - started} мс`,
    };
  } catch (e) {
    return {
      id: "llm",
      title: "Тексты (Qwen)",
      status: "crit",
      value: "не отвечает",
      hint: e instanceof Error ? e.message.slice(0, 120) : "ошибка",
    };
  }
}

/** Доля неудачных генераций за сутки — «здоровье качества», а не инфраструктуры. */
async function checkGenerations(): Promise<HealthCheck> {
  if (!jobsEnabled()) {
    return { id: "gen", title: "Генерации за сутки", status: "off", hint: "журнал недоступен" };
  }
  try {
    const jobs = await listJobsForAdmin({ limit: 200 });
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recent = jobs.filter((j) => new Date(j.createdAt).getTime() > dayAgo);
    const failed = recent.filter((j) => j.status === "failed").length;
    const stuck = recent.filter(
      (j) => j.status === "processing" && Date.now() - new Date(j.createdAt).getTime() > 15 * 60_000,
    ).length;
    const pct = recent.length ? (failed / recent.length) * 100 : 0;
    return {
      id: "gen",
      title: "Генерации за сутки",
      status: stuck > 0 || pct > 30 ? "crit" : pct > 10 ? "warn" : "ok",
      value: `${recent.length} шт · ${failed} с ошибкой`,
      hint: stuck
        ? `${stuck} задач зависли дольше 15 минут — проверьте журнал`
        : recent.length
          ? `доля неудач ${pct.toFixed(0)}% (за неудачные гены не списываются)`
          : "за сутки генераций не было",
    };
  } catch (e) {
    return {
      id: "gen",
      title: "Генерации за сутки",
      status: "unknown",
      hint: e instanceof Error ? e.message.slice(0, 120) : "ошибка",
    };
  }
}

/** Приём платежей и отправка писем — без живых запросов, только конфигурация. */
function checkPayments(): HealthCheck {
  return yookassaConfigured()
    ? { id: "pay", title: "Приём платежей", status: "ok", value: "ЮKassa подключена" }
    : {
        id: "pay",
        title: "Приём платежей",
        status: "crit",
        value: "не настроен",
        hint: "клиенты не смогут пополнить баланс",
      };
}

function checkMail(): HealthCheck {
  return isSmtpConfigured()
    ? { id: "mail", title: "Письма (коды входа)", status: "ok", value: "настроены" }
    : {
        id: "mail",
        title: "Письма (коды входа)",
        status: "crit",
        value: "не настроены",
        hint: "новые пользователи не смогут подтвердить почту",
      };
}

/** Формат аптайма: «3д 4ч», «5ч 20м», «12м». */
function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

/**
 * Ресурсы самого сервера (1 инстанс) — чтобы под наплывом сразу видеть, что
 * пора усиливать: RAM, загрузка ядра, отзывчивость (лаг event-loop), аптайм.
 */
function serverChecks(): HealthCheck[] {
  const m = getRuntimeMetrics();

  const ram: HealthCheck = {
    id: "ram",
    title: "Оперативная память",
    status: m.ramPct >= 85 ? "crit" : m.ramPct >= 70 ? "warn" : "ok",
    value: `${m.rssMb} / ${m.ramLimitMb} МБ · ${m.ramPct}%`,
    hint:
      m.ramPct >= 85
        ? "почти предел — под наплывом риск падения; поднимите план (больше RAM)"
        : m.ramPct >= 70
          ? "запас тает — присмотритесь к увеличению RAM"
          : "запас в норме",
  };

  const cpu: HealthCheck = {
    id: "cpu",
    title: "Загрузка CPU",
    status: m.loadPct >= 120 ? "crit" : m.loadPct >= 80 ? "warn" : "ok",
    value: `${m.loadPct}% · ${m.cpuCount} ядро, load ${m.load1}`,
    hint:
      m.loadPct >= 120
        ? "ядро перегружено — добавьте ядер или поднимите план"
        : m.loadPct >= 80
          ? "нагрузка высокая — держите на контроле при росте трафика"
          : "нагрузка в норме",
  };

  const lag: HealthCheck = {
    id: "lag",
    title: "Отзывчивость сервера",
    status: m.lagMeanMs >= 150 ? "crit" : m.lagMeanMs >= 50 ? "warn" : "ok",
    value: `лаг ${m.lagMeanMs} мс · пик ${m.lagMaxMs} мс`,
    hint:
      m.lagMeanMs >= 150
        ? "сервер стабильно подтормаживает — пора усиливать (RAM/ядра)"
        : m.lagMeanMs >= 50
          ? "иногда подтормаживает под нагрузкой — на контроле"
          : "отклик мгновенный",
  };

  const up: HealthCheck = {
    id: "uptime",
    title: "Аптайм процесса",
    status: "ok",
    value: fmtUptime(m.uptimeSec),
    hint:
      m.jobsInFlight > 0
        ? `в работе генераций: ${m.jobsInFlight} · частые сбросы аптайма = перезапуски/падения`
        : "частые сбросы аптайма = перезапуски/падения",
  };

  return [ram, cpu, lag, up];
}

export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);

    const [fal, timeweb, db, s3, llm, gen] = await Promise.all([
      checkFal(),
      checkTimeweb(),
      checkDatabase(),
      checkStorage(),
      checkLLM(),
      checkGenerations(),
    ]);
    const checks = [
      ...serverChecks(),
      fal,
      timeweb,
      db,
      s3,
      llm,
      gen,
      checkPayments(),
      checkMail(),
    ];
    const worst: HealthStatus = checks.some((c) => c.status === "crit")
      ? "crit"
      : checks.some((c) => c.status === "warn")
        ? "warn"
        : checks.some((c) => c.status === "unknown")
          ? "unknown"
          : "ok";

    return ok({ checks, overall: worst, checkedAt: new Date().toISOString() });
  } catch (err) {
    return fail(err);
  }
}
