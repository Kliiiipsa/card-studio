import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { getJob, failJob, jobsEnabled } from "@/core/jobs/jobs";
import { ensureWatcherBoot } from "@/core/jobs/watcher";
import { billingEnabled, getBalance } from "@/core/billing/billing";
import { friendlyJobError } from "@/lib/user-messages";

export const runtime = "nodejs";

/** Poll a tracked generation job. Includes the fresh balance once completed. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    if (!jobsEnabled()) throw new AppError("Задачи недоступны.", 500);
    ensureWatcherBoot();
    let job = await getJob(params.id, session.email);
    if (!job) throw new AppError("Задача не найдена.", 404);
    // orchestrated packs have no fal handle to resume after a server restart —
    // a pack stuck in processing for 30+ minutes is declared failed
    if (
      job.kind === "turnkey" &&
      job.status === "processing" &&
      Date.now() - new Date(job.createdAt).getTime() > 30 * 60 * 1000
    ) {
      await failJob(job.id, "Генерация прервана перезапуском сервера. Неудавшиеся шаги не оплачены.");
      job = (await getJob(params.id, session.email)) ?? job;
    }
    const balance =
      job.status === "completed" && billingEnabled() && session.role !== "admin"
        ? await getBalance(session.email)
        : undefined;
    // клиенту — человеческий текст; технический остаётся в базе и в админском
    // журнале генераций (там он и нужен для разбора)
    return ok({
      job: { ...job, error: job.error ? friendlyJobError(job.error) : null },
      balance,
    });
  } catch (err) {
    return fail(err);
  }
}
