import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks } from "@/core/billing/api";
import { createJob, jobsEnabled } from "@/core/jobs/jobs";
import { ensureWatcherBoot, watchJob } from "@/core/jobs/watcher";
import { uid } from "@/lib/utils";
import { validateDataUrl } from "@/lib/image-validation";
import { buildVideoPrompt, submitVideoJob } from "@/core/video/video-service";
import { sessionFromRequest } from "@/core/auth/session";
import { AppError } from "@/lib/errors";
import { readFalBalance, falJobsInFlight } from "@/core/ai/fal-cost";

export const runtime = "nodejs";
// Submit-only: собрать промпт (быстрый Qwen-перевод) и поставить задачу в
// очередь fal. Сама генерация (1–3 минуты) опрашивается отдельно.
export const maxDuration = 60;

const schema = z.object({
  productName: z.string().min(1).max(160),
  category: z.string().max(160).optional(),
  presetId: z.string().min(1).max(40),
  productImage: z.string().min(1),
  aspectRatio: z.enum(["3:4", "9:16", "1:1"]).optional(),
  /** свой сценарий пользователя на русском (переводится на сервере) */
  userScenario: z.string().trim().max(600).optional(),
  /** админский тест: промпт как есть, без пресета и guardrails */
  customPrompt: z.string().trim().max(2500).optional(),
  /** админский тест: полный id модели fal вместо настроенной */
  falModel: z.string().trim().max(120).optional(),
});

export async function POST(req: Request) {
  try {
    // баланс проверяется до старта; списание — только при успешном завершении
    const bill = await requireSparks(req, "video");
    const body = await parseBody(req, schema);
    if (body.productImage.startsWith("data:")) validateDataUrl(body.productImage);

    // тестовые рычаги доступны только админу: клиент со своим промптом легко
    // получает непредсказуемый ролик за 40 генов (уроки A/B 2026-08-20)
    if (body.customPrompt || body.falModel) {
      const session = await sessionFromRequest(req);
      if (session?.role !== "admin") {
        throw new AppError("Свой промпт и выбор модели доступны только администратору.", 403);
      }
    }

    const { prompt, cameraFixed } = body.customPrompt
      ? { prompt: body.customPrompt, cameraFixed: false }
      : await buildVideoPrompt({
          presetId: body.presetId,
          productName: body.productName,
          category: body.category,
          userScenario: body.userScenario,
        });
    // остаток на счёте fal ДО отправки: по разнице с остатком после завершения
    // получим фактическую себестоимость этой генерации (видна в админке)
    const concurrentAtStart = falJobsInFlight();
    const falBalanceBefore = await readFalBalance();

    const job = await submitVideoJob({
      prompt,
      imageDataUrl: body.productImage,
      aspectRatio: body.aspectRatio ?? "3:4",
      cameraFixed,
      modelOverride: body.falModel,
    });

    // server-tracked job: доживёт до конца, даже если вкладку закрыли
    let jobId: string | undefined;
    if (jobsEnabled()) {
      ensureWatcherBoot();
      jobId = uid("job");
      await createJob({
        id: jobId,
        email: bill.email,
        kind: "video",
        payload: {
          productName: body.productName,
          category: body.category,
          presetId: body.presetId,
          // для отладки качества: что реально ушло в модель
          videoPrompt: prompt,
          userScenario: body.userScenario || undefined,
          customPrompt: Boolean(body.customPrompt),
          model:
            body.falModel ??
            process.env.FAL_VIDEO_MODEL ??
            "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
        },
        falStatusUrl: job.statusUrl,
        falResponseUrl: job.responseUrl,
      });
      watchJob({
        id: jobId,
        email: bill.email,
        falStatusUrl: job.statusUrl,
        falResponseUrl: job.responseUrl,
        kind: "video",
        falBalanceBefore,
        concurrentAtStart,
      });
    }
    return ok({ done: false, jobId, job });
  } catch (err) {
    return fail(err);
  }
}
