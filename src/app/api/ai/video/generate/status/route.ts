import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { billingCtx } from "@/core/billing/api";
import { billingEnabled, getBalance } from "@/core/billing/billing";
import { pollVideoJob } from "@/core/video/video-service";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Legacy/fallback-опрос fal-задачи напрямую (когда нет Postgres и серверного
 * watcher'а). Основной клиентский путь — /api/jobs/{id}.
 */
const schema = z.object({
  job: z.object({
    provider: z.string(),
    statusUrl: z.string().url(),
    responseUrl: z.string().url(),
  }),
});

/** Only fal queue hosts may be polled — the job URLs come from the client. */
function assertFalUrl(raw: string): void {
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new AppError("Некорректный адрес задачи.");
  }
  if (host !== "queue.fal.run" && host !== "fal.run" && !host.endsWith(".fal.run")) {
    throw new AppError("Недопустимый адрес задачи.");
  }
}

export async function POST(req: Request) {
  try {
    const bill = await billingCtx(req, "video");
    const { job } = await parseBody(req, schema);
    assertFalUrl(job.statusUrl);
    assertFalUrl(job.responseUrl);
    const status = await pollVideoJob(job);
    if (status.status === "completed") {
      // гены списаны резервом на старте (submit-роут) — здесь только свежий баланс
      const balance = billingEnabled() && !bill.free ? await getBalance(bill.email) : undefined;
      return ok({ ...status, balance });
    }
    return ok(status);
  } catch (err) {
    return fail(err);
  }
}
