import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { requireSparks } from "@/core/billing/api";
import { createJob, jobsEnabled } from "@/core/jobs/jobs";
import { ensureWatcherBoot, watchJob } from "@/core/jobs/watcher";
import { uid } from "@/lib/utils";
import { validateDataUrl } from "@/lib/image-validation";
import { buildVideoPrompt, submitVideoJob } from "@/core/video/video-service";

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
});

export async function POST(req: Request) {
  try {
    // баланс проверяется до старта; списание — только при успешном завершении
    const bill = await requireSparks(req, "video");
    const body = await parseBody(req, schema);
    if (body.productImage.startsWith("data:")) validateDataUrl(body.productImage);

    const { prompt, cameraFixed } = await buildVideoPrompt({
      presetId: body.presetId,
      productName: body.productName,
      category: body.category,
    });
    const job = await submitVideoJob({
      prompt,
      imageDataUrl: body.productImage,
      aspectRatio: body.aspectRatio ?? "3:4",
      cameraFixed,
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
          presetId: body.presetId,
          aspectRatio: body.aspectRatio ?? "3:4",
          // для отладки качества: что реально ушло в модель
          videoPrompt: prompt,
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
      });
    }
    return ok({ done: false, jobId, job });
  } catch (err) {
    return fail(err);
  }
}
