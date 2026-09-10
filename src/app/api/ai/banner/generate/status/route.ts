import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { billingCtx } from "@/core/billing/api";
import { billingEnabled, getBalance } from "@/core/billing/billing";
import { sessionFromRequest } from "@/core/auth/session";
import { bannerStatusSchema } from "@/core/banners/schemas";
import { bannersEnabled, pollBannerJob } from "@/core/banners/banner-service";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Опрашивать разрешено только очередь fal — адреса приходят от клиента. */
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
    const session = await sessionFromRequest(req);
    if (!bannersEnabled(session?.role)) {
      throw new AppError("Раздел ещё не открыт.", 403);
    }
    const bill = await billingCtx(req, "banner");
    const { job } = await parseBody(req, bannerStatusSchema);
    assertFalUrl(job.statusUrl);
    assertFalUrl(job.responseUrl);
    const status = await pollBannerJob(job);
    if (status.status === "completed") {
      // гены списаны резервом на старте — здесь только свежий баланс
      const balance = billingEnabled() && !bill.free ? await getBalance(bill.email) : undefined;
      return ok({ ...status, balance });
    }
    return ok(status);
  } catch (err) {
    return fail(err);
  }
}
