import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { jobsEnabled, latestJob } from "@/core/jobs/jobs";
import { ensureWatcherBoot } from "@/core/jobs/watcher";
import { friendlyJobError } from "@/lib/user-messages";

export const runtime = "nodejs";

/** The user's most recent generation job — the page restores itself from it. */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    if (!jobsEnabled()) return ok({ job: null });
    ensureWatcherBoot();
    const kind = new URL(req.url).searchParams.get("kind") ?? "infographic";
    const job = await latestJob(session.email, kind);
    return ok({
      job: job ? { ...job, error: job.error ? friendlyJobError(job.error) : null } : null,
    });
  } catch (err) {
    return fail(err);
  }
}
