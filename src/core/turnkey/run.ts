import { buildInfographicBrief, generateInfographicBase } from "@/core/infographics/infographic-service";
import { getLibraryStyle } from "@/core/infographics/style-library";
import type { InfographicInput } from "@/core/infographics/types";
import { generateImageFromReference, generateSeoTexts, type SeoTexts } from "@/core/ai/service";
import { persistGeneration } from "@/core/jobs/persist";
import { updateJobPayload, completeJob, failJob } from "@/core/jobs/jobs";
import { applyTx, billingEnabled } from "@/core/billing/billing";
import { TURNKEY_ITEM_PRICE, TURNKEY_SEO_PRICE } from "@/core/billing/prices";
import { getUser } from "@/core/auth/store";

/**
 * «Карточка под ключ»: one photo + product data → a 7-image funnel.
 * Runs fully server-side (persistent Timeweb node), sequentially — the fal
 * queue serializes anyway and sequencing keeps memory flat. Progress is
 * published into the parent gen_job's payload; every finished image is
 * persisted through the regular pipeline, so items also land in «Мои карточки».
 *
 * Billing: affordability for the WHOLE pack is checked at start (49 🧬);
 * each SUCCESSFUL item charges TURNKEY_ITEM_PRICE (7 🧬) with a deduped
 * reference — a failed step simply isn't paid for.
 */
export type TurnkeyStepKey =
  | "seo"
  | "benefits"
  | "pain"
  | "materials"
  | "sizes"
  | "side"
  | "back"
  | "lifestyle";

export type TurnkeyStep = {
  key: TurnkeyStepKey;
  label: string;
  status: "pending" | "processing" | "done" | "failed";
  url?: string;
  /** filled for the "seo" step only */
  seo?: SeoTexts;
};

export type TurnkeyInput = {
  productName: string;
  category?: string;
  benefits: string[];
  pains: string[];
  materials: string[];
  sizes: string[];
  styleId: string;
  productImage: string;
};

export function turnkeySteps(input: TurnkeyInput): TurnkeyStep[] {
  const steps: TurnkeyStep[] = [
    { key: "seo", label: "SEO: название, описание, ключевые слова", status: "pending" },
    { key: "benefits", label: "Инфографика: преимущества", status: "pending" },
    { key: "pain", label: "Инфографика: боль → решение", status: "pending" },
    { key: "materials", label: "Инфографика: состав и материалы", status: "pending" },
    { key: "sizes", label: "Размерная сетка", status: "pending" },
    { key: "side", label: "Фото: вид сбоку", status: "pending" },
    { key: "back", label: "Фото: вид сзади", status: "pending" },
    { key: "lifestyle", label: "Фото: lifestyle-сцена", status: "pending" },
  ];
  // no sizes provided → skip that card, the pack simply becomes 6 images
  return input.sizes.length ? steps : steps.filter((s) => s.key !== "sizes");
}

const running: Set<string> = ((globalThis as Record<string, unknown>).__turnkeyRunning ??=
  new Set<string>()) as Set<string>;

export function startTurnkey(parentId: string, email: string, input: TurnkeyInput): void {
  if (running.has(parentId)) return;
  running.add(parentId);
  void run(parentId, email, input).finally(() => running.delete(parentId));
}

async function run(parentId: string, email: string, input: TurnkeyInput): Promise<void> {
  const steps = turnkeySteps(input);
  const publish = () =>
    updateJobPayload(parentId, { productName: input.productName, steps }).catch(() => undefined);

  let doneCount = 0;
  let firstUrl: string | null = null;

  for (const step of steps) {
    step.status = "processing";
    await publish();
    try {
      if (step.key === "seo") {
        step.seo = await generateSeoTexts({
          productName: input.productName,
          category: input.category,
          benefits: input.benefits,
          materials: input.materials,
        });
        step.status = "done";
        doneCount++;
        await chargeItem(email, parentId, step.key, TURNKEY_SEO_PRICE);
        await publish();
        continue;
      }
      const url =
        step.key === "side" || step.key === "back" || step.key === "lifestyle"
          ? await photoStep(step.key, email, input)
          : await infographicStep(step.key, email, input, steps.indexOf(step));
      step.status = "done";
      step.url = url;
      firstUrl = firstUrl ?? url;
      doneCount++;
      await chargeItem(email, parentId, step.key, TURNKEY_ITEM_PRICE);
    } catch (e) {
      console.error(`[turnkey] step ${step.key} failed:`, e);
      step.status = "failed";
    }
    await publish();
  }

  if (doneCount === 0) {
    await failJob(parentId, "Не удалось сгенерировать ни одного изображения.");
  } else {
    await completeJob(parentId, firstUrl ?? "");
  }
}

/** One baked infographic through the standard pipeline (incl. Flux fallback). */
async function infographicStep(
  key: TurnkeyStepKey,
  email: string,
  input: TurnkeyInput,
  index: number,
): Promise<string> {
  const base: InfographicInput = {
    productName: input.productName,
    category: input.category,
    benefits: input.benefits,
    painPoints: input.pains,
    userNote: undefined,
    type: "benefits",
    style: "auto",
    marketplace: "wildberries",
    aspectRatio: "3:4",
  };
  if (key === "pain") {
    base.type = "why_buy";
    base.userNote =
      "Карточка «боль → решение»: покажи, какую проблему покупателя решает товар, и дай уверенный ответ.";
  } else if (key === "materials") {
    base.type = "materials";
    base.benefits = input.materials.length ? input.materials : input.benefits;
  } else if (key === "sizes") {
    base.type = "sizes";
    base.benefits = input.sizes;
  }

  const styleProfile = getLibraryStyle(input.styleId) ?? undefined;
  const brief = await buildInfographicBrief(base, styleProfile);
  const { baseImageUrl, textBaked } = await generateInfographicBase({
    brief,
    productImage: input.productImage,
    productName: input.productName,
    aspectRatio: "3:4",
    variantSeed: index, // each card of the pack gets its own composition
  });
  return persistGeneration({
    email,
    kind: "infographic",
    sourceUrl: baseImageUrl,
    payload: { brief, textBaked, turnkey: true },
  });
}

const PHOTO_PROMPTS: Record<"side" | "back" | "lifestyle", string> = {
  side: "Покажи этот товар в профиль, с бокового ракурса. Сам товар не менять: те же цвета, материалы и детали. Чистый студийный фон, мягкий свет, премиальная предметная съёмка.",
  back: "Покажи этот товар сзади, вид со спины. Сам товар не менять: те же цвета, материалы и детали. Чистый студийный фон, мягкий свет, премиальная предметная съёмка.",
  lifestyle:
    "Покажи этот товар в реальной жизни: естественная сцена использования, живой интерьер или улица, натуральный свет, аспирационное настроение. Сам товар не менять.",
};

/** One angle/lifestyle photo from the user's product photo (i2i). */
async function photoStep(
  key: "side" | "back" | "lifestyle",
  email: string,
  input: TurnkeyInput,
): Promise<string> {
  const result = await generateImageFromReference({
    prompt: `${PHOTO_PROMPTS[key]} Товар: ${input.productName}.`,
    referenceImageDataUrl: input.productImage,
    strength: key === "lifestyle" ? 0.55 : 0.65,
    aspectRatio: "3:4",
    count: 1,
  });
  const url = result.images[0]?.url;
  if (!url) throw new Error("empty image result");
  return persistGeneration({
    email,
    kind: "generator",
    sourceUrl: url,
    payload: { prompt: PHOTO_PROMPTS[key].slice(0, 200), turnkey: true },
  });
}

async function chargeItem(
  email: string,
  parentId: string,
  key: string,
  amount: number,
): Promise<void> {
  if (!billingEnabled()) return;
  try {
    const user = await getUser(email);
    if (user?.role === "admin") return;
    await applyTx({
      email,
      amount: -amount,
      type: "charge",
      action: "turnkey",
      reference: `${parentId}:${key}`,
    });
  } catch (e) {
    console.error("[turnkey] charge failed:", e);
  }
}
