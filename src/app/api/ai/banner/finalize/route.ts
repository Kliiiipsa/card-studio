import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import { sessionFromRequest } from "@/core/auth/session";
import { bannersEnabled } from "@/core/banners/banner-service";
import { getJob, replaceJobResult, jobsEnabled } from "@/core/jobs/jobs";
import { s3Enabled, s3Put } from "@/core/storage/s3";
import { validateDataUrl } from "@/lib/image-validation";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  jobId: z.string().min(1).max(80),
  /** готовый кадр с наложенным логотипом, data URL */
  image: z.string().min(1),
});

/**
 * Логотип накладывается на клиенте — точными пикселями, потому что модель
 * фирменный знак не копирует, а перерисовывает. Но тогда в «Моих карточках»
 * остался бы кадр БЕЗ логотипа, то есть две разные версии одного креатива.
 * Ровно на этом мы уже обожглись 10.09.2026 с накладной полосой: человек
 * скачивал файл из карточек и получал пустое место вместо цены и кнопки.
 *
 * Поэтому готовый кадр возвращается сюда и становится результатом генерации.
 * Денег не стоит: генерация уже оплачена, это просто дозапись.
 *
 * С 15.09.2026 кадр пишется в ОТДЕЛЬНЫЙ ключ (`-logo.png`), оригинал модели не
 * трогаем, а пустые кадры отбрасываем: перезапись по тому же ключу однажды
 * стёрла настоящий креатив белым холстом.
 */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    if (!bannersEnabled(session.role)) throw new AppError("Раздел ещё не открыт.", 403);
    if (!jobsEnabled() || !s3Enabled()) return ok({ replaced: false });

    const { jobId, image } = await parseBody(req, schema);
    validateDataUrl(image);

    // чужую генерацию перезаписать нельзя — сверяем владельца
    const job = await getJob(jobId, session.email);
    if (!job) throw new AppError("Генерация не найдена.", 404);
    if (job.kind !== "banner") throw new AppError("Эта генерация не из раздела баннеров.", 400);
    if (job.status !== "completed") throw new AppError("Генерация ещё не готова.", 409);

    const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i.exec(image);
    if (!m) throw new AppError("Некорректный формат изображения.");
    const body = Buffer.from(m[3], "base64");

    // Защита от пустого холста (15.09.2026, job_mu2hamna): клиент прислал
    // белый PNG 1024×1280 на 30 КБ, и он ЗАМЕНИЛ настоящий креатив. Кадр модели
    // фотографичен и весит от ~0,3 байта на пиксель; всё, что легче 0,06 —
    // пустой или почти пустой холст, такое не принимаем.
    const p = (job.payload ?? {}) as { width?: number; height?: number };
    const pixels = (Number(p.width) || 1024) * (Number(p.height) || 1024);
    if (body.length < pixels * 0.06) {
      throw new AppError("Кадр пришёл пустым — сохранённый файл оставлен без изменений.", 422);
    }

    // Отдельный ключ, а не перезапись: оригинал модели остаётся в хранилище,
    // и любая ошибка наложения обратима. «Мои карточки» смотрят на новый файл.
    const url = await s3Put(`cards/${jobId}-logo.png`, body, "image/png");
    // метка версии против кеша браузера при повторном наложении
    const versioned = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
    await replaceJobResult(jobId, session.email, versioned, body.length);
    return ok({ replaced: true, url: versioned });
  } catch (err) {
    return fail(err);
  }
}
