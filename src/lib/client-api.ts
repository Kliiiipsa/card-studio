"use client";
import type {
  AnalysisReport,
  CardIdea,
  CardScore,
  ProductInfo,
  StructuredImagePrompt,
} from "@/core/domain/types";
import type { ImageResult } from "@/core/ai/providers/types";
import type { PromptResult } from "@/core/prompting/prompt-intent";
import type {
  InfographicInput,
  InfographicBrief,
  AutofillResult,
  InfographicGenerateResult,
  InfographicOverlayPlan,
  StyleProfile,
} from "@/core/infographics/types";
import type { ImageJobHandle } from "@/core/ai/providers/types";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Ошибка запроса");
  }
  return data as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type InfographicGenerateArgs = {
  brief: InfographicBrief;
  productImage?: string;
  styleReferenceImage?: string;
  productName?: string;
  aspectRatio?: "3:4" | "4:5";
  /** advanced on each regenerate → next composition variant */
  variantSeed?: number;
};

/** /generate returns either a finished base (fast providers) or a job to poll. */
type GenerateStart =
  | {
      done: true;
      baseImageUrl: string;
      overlayPlan: InfographicOverlayPlan;
      brief: InfographicBrief;
      textBaked: boolean;
    }
  | {
      done: false;
      job: ImageJobHandle;
      overlayPlan: InfographicOverlayPlan;
      brief: InfographicBrief;
      textBaked: boolean;
    };

type JobStatus = {
  status: "pending" | "completed" | "failed";
  images?: { url: string }[];
  error?: string;
};

/**
 * Async generate: submit the job, then poll short status requests until done.
 * gpt-image can take minutes; polling keeps every HTTP request short so a 60s
 * serverless timeout never kills the generation. Returns the SAME shape as the
 * old synchronous call, so the UI is unchanged.
 */
async function generateInfographic(
  args: InfographicGenerateArgs,
): Promise<InfographicGenerateResult> {
  const started = await post<GenerateStart>("/api/ai/infographic/generate", args);
  if (started.done) {
    return {
      baseImageUrl: started.baseImageUrl,
      overlayPlan: started.overlayPlan,
      brief: started.brief,
      textBaked: started.textBaked,
    };
  }

  const { job, overlayPlan, brief, textBaked } = started;
  const deadline = Date.now() + 300_000; // ~5 min client-side cap
  let failures = 0;
  for (;;) {
    await delay(2500);
    if (Date.now() > deadline) {
      throw new Error("Генерация заняла слишком долго. Попробуйте ещё раз.");
    }
    let status: JobStatus;
    try {
      status = await post<JobStatus>("/api/ai/infographic/generate/status", { job });
      failures = 0;
    } catch (e) {
      // tolerate a few transient poll failures (network blips) before giving up
      if (++failures >= 5) throw e;
      continue;
    }
    if (status.status === "completed" && status.images?.length) {
      return { baseImageUrl: status.images[0].url, overlayPlan, brief, textBaked };
    }
    if (status.status === "failed") {
      // gpt-image job failed (e.g. moderation) → server renders a Flux base sync
      const fb = await post<Extract<GenerateStart, { done: true }>>(
        "/api/ai/infographic/generate",
        { ...args, forceFallback: true },
      );
      return {
        baseImageUrl: fb.baseImageUrl,
        overlayPlan: fb.overlayPlan,
        brief: fb.brief,
        textBaked: fb.textBaked,
      };
    }
    // pending → keep polling
  }
}

export const api = {
  analyze: (imageDataUrl: string, product?: Partial<ProductInfo>) =>
    post<AnalysisReport>("/api/ai/analyze", { imageDataUrl, product }),

  ideas: (product: ProductInfo) => post<{ ideas: CardIdea[] }>("/api/ai/ideas", { product }),

  improvePrompt: (prompt: string, cardType?: string, style?: string) =>
    post<{ prompt: string }>("/api/ai/improve-prompt", { prompt, cardType, style }),

  buildPrompt: (args: {
    product: ProductInfo;
    cardType: string;
    style: string;
    userPrompt?: string;
  }) => post<StructuredImagePrompt>("/api/ai/build-prompt", args),

  generateText: (args: {
    prompt: string;
    negativePrompt?: string;
    aspectRatio?: string;
    count?: number;
    cardText?: string;
  }) => post<ImageResult>("/api/ai/generate/text", args),

  generateImage: (args: {
    prompt: string;
    negativePrompt?: string;
    referenceImageDataUrl: string;
    strength?: number;
    aspectRatio?: string;
    count?: number;
    cardText?: string;
  }) => post<ImageResult>("/api/ai/generate/image", args),

  score: (args: { imageDataUrl: string; product?: Partial<ProductInfo>; cardType?: string }) =>
    post<CardScore>("/api/ai/score", args),

  writePrompt: (args: {
    product?: Partial<ProductInfo>;
    cardType?: string;
    styleMode?: string;
    userNote?: string;
    referenceImageDataUrl?: string;
  }) => post<PromptResult>("/api/ai/write-prompt", args),

  status: async () => {
    const res = await fetch("/api/ai/status");
    return (await res.json()) as { llm: string; image: string };
  },

  infographic: {
    autofill: (args: { imageDataUrl: string; productName?: string; category?: string }) =>
      post<AutofillResult>("/api/ai/infographic/autofill", args),
    extractStyle: (referenceImageDataUrl: string) =>
      post<StyleProfile>("/api/ai/infographic/extract-style", { referenceImageDataUrl }),
    brief: (input: InfographicInput, styleProfile?: StyleProfile) =>
      post<InfographicBrief>("/api/ai/infographic/brief", { ...input, styleProfile }),
    generate: (args: InfographicGenerateArgs) => generateInfographic(args),
  },
};
