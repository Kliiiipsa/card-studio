import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { jobsEnabled, listJobsForAdmin, type GenJobStatus } from "@/core/jobs/jobs";

export const runtime = "nodejs";

const KINDS = new Set(["infographic", "generator", "video", "improve", "turnkey"]);
const STATUSES = new Set(["processing", "completed", "failed"]);

/**
 * ADMIN: журнал генераций для разбора жалоб. Отдаёт всё, что нужно понять,
 * ПОЧЕМУ получился такой результат: что пользователь заполнил и выбрал, какой
 * промпт ушёл в модель, статус/ошибка и ссылка на результат.
 *
 * Сами загруженные пользователем фото не хранятся и здесь не отдаются —
 * только текстовые параметры генерации.
 */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    if (!jobsEnabled()) return ok({ generations: [] });

    const url = new URL(req.url);
    const email = url.searchParams.get("email")?.trim() || undefined;
    const kindRaw = url.searchParams.get("kind") ?? "";
    const statusRaw = url.searchParams.get("status") ?? "";
    const limit = Number(url.searchParams.get("limit") ?? 50) || 50;
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;

    const jobs = await listJobsForAdmin({
      email,
      kind: KINDS.has(kindRaw) ? kindRaw : undefined,
      status: STATUSES.has(statusRaw) ? (statusRaw as GenJobStatus) : undefined,
      limit,
      offset,
    });

    return ok({
      generations: jobs.map((j) => ({
        id: j.id,
        email: j.email,
        kind: j.kind,
        status: j.status,
        resultUrl: j.resultUrl,
        error: j.error,
        createdAt: j.createdAt,
        finishedAt: j.finishedAt,
        sizeBytes: null,
        payload: j.payload,
      })),
    });
  } catch (err) {
    return fail(err);
  }
}
