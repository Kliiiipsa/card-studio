import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireSparks } from "@/core/billing/api";
import { createJob, jobsEnabled } from "@/core/jobs/jobs";
import { startTurnkey, turnkeySteps, type TurnkeyInput } from "@/core/turnkey/run";
import { validateDataUrl } from "@/lib/image-validation";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
// only submits the pack and returns the job id — the orchestrator runs detached
export const maxDuration = 60;

const list = z.array(z.string().trim().min(1).max(200)).max(12);

const schema = z.object({
  productName: z.string().trim().min(1, "Укажите название товара").max(200),
  category: z.string().max(120).optional(),
  benefits: list.min(1, "Добавьте хотя бы одно преимущество"),
  pains: list.default([]),
  materials: list.default([]),
  sizes: list.default([]),
  styleId: z.string().max(60),
  productImage: z.string().min(1, "Загрузите фото товара"),
});

export async function POST(req: Request) {
  try {
    if (!jobsEnabled()) throw new AppError("Функция недоступна: не настроена база данных.", 500);
    // affordability for the whole pack up-front; actual charges are per item
    const bill = await requireSparks(req, "turnkey");
    // «Под ключ» пока на доработке и скрыт в UI. Списание идёт по частям и
    // НЕ атомарно (launch-аудит 2026-08-27: параллельные паки могут увести
    // баланс в минус), поэтому до переделки ручка доступна только админу —
    // у админа генерации бесплатны, денежной гонки нет.
    if (bill.role !== "admin") {
      throw new AppError("Раздел «под ключ» временно недоступен — идёт доработка.", 403);
    }
    const body = await parseBody(req, schema);
    if (body.productImage.startsWith("data:")) validateDataUrl(body.productImage);
    else throw new AppError("Загрузите фото товара (файлом).");

    const input: TurnkeyInput = {
      productName: body.productName,
      category: body.category,
      benefits: body.benefits,
      pains: body.pains ?? [],
      materials: body.materials ?? [],
      sizes: body.sizes ?? [],
      styleId: body.styleId,
      productImage: body.productImage,
    };
    const jobId = uid("turnkey");
    await createJob({
      id: jobId,
      email: bill.email,
      kind: "turnkey",
      payload: { productName: input.productName, steps: turnkeySteps(input) },
    });
    startTurnkey(jobId, bill.email, input);
    return ok({ jobId, steps: turnkeySteps(input).length });
  } catch (err) {
    return fail(err);
  }
}
