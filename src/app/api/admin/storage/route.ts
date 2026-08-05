import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { jobsEnabled, storageStats } from "@/core/jobs/jobs";

export const runtime = "nodejs";

/** S3 usage estimate (sum of stored generation sizes) for the admin. */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!jobsEnabled()) return ok({ count: 0, bytes: 0 });
    return ok(await storageStats());
  } catch (err) {
    return fail(err);
  }
}
