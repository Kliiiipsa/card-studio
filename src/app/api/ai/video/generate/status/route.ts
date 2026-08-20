import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { billingCtx, chargeSparks } from "@/core/billing/api";
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
      // charge exactly once per fal job — responseUrl is the dedup key
      const balance = await chargeSparks(bill, job.responseUrl);
      return ok({ ...status, balance: balance ?? undefined });
    }
    return ok(status);
  } catch (err) {
    return fail(err);
  }
}
