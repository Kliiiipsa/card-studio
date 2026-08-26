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
import { USER_ERRORS } from "@/lib/user-messages";

/** Paid endpoints return the fresh sparks balance — mirror it into the profile store. */
function syncBalance(data: unknown): void {
  const balance = (data as { balance?: unknown })?.balance;
  if (typeof balance === "number") {
    // lazy import keeps this module tree-shakeable on the server side
    import("@/store/profile-store").then(({ useProfileStore }) =>
      useProfileStore.getState().setBalance(balance),
    );
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? USER_ERRORS.unexpected);
  }
  syncBalance(data);
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
  /** сохранять фон загруженного фото (по умолчанию да) */
  keepBackground?: boolean;
  /** advanced on each regenerate → next composition variant */
  variantSeed?: number;
  /** снимок заполненной формы — только для разбора жалоб в админке */
  userInput?: {
    productName?: string;
    category?: string;
    targetAudience?: string;
    benefits?: string[];
    painPoints?: string[];
    userNote?: string;
    type?: string;
    style?: string;
    styleSource?: string;
  };
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
      /** server-tracked job id — survives the tab being closed */
      jobId?: string;
      job: ImageJobHandle;
      overlayPlan: InfographicOverlayPlan;
      brief: InfographicBrief;
      textBaked: boolean;
    };

/** shape of /api/jobs/{id} */
export type TrackedJob = {
  id: string;
  status: "processing" | "completed" | "failed";
  payload: { brief: InfographicBrief; textBaked: boolean } | null;
  resultUrl: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

/**
 * Сколько подряд неудачных опросов терпим (×2.5 с ≈ 2 минуты). Раньше было 5
 * (~12 с) — этого не хватало, чтобы пережить деплой: контейнер переключается
 * 1–3 минуты, и вкладка показывала ошибку, хотя генерация на сервере успешно
 * доходила до конца (и гены списывались). Сервер всё равно доводит задачу и
 * кладёт результат в «Мои карточки», но клиент теперь чаще дожидается сам.
 */
const MAX_POLL_FAILURES = 48;

/** Poll a server-tracked job until it finishes. */
async function pollTrackedJob(jobId: string): Promise<TrackedJob> {
  const deadline = Date.now() + 420_000;
  let failures = 0;
  for (;;) {
    await delay(2500);
    if (Date.now() > deadline) {
      throw new Error(USER_ERRORS.timeout);
    }
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      const data = (await res.json()) as { job?: TrackedJob; balance?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? USER_ERRORS.unexpected);
      failures = 0;
      syncBalance(data);
      if (data.job && data.job.status !== "processing") return data.job;
    } catch (e) {
      if (++failures >= MAX_POLL_FAILURES) throw e;
    }
  }
}

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

  const { job, jobId, overlayPlan, brief, textBaked } = started;

  // Preferred path: the server tracks the job (finishes it even if the tab
  // closes, stores the image in S3). We just watch OUR job record.
  if (jobId) {
    const done = await pollTrackedJob(jobId);
    if (done.status === "completed" && done.resultUrl) {
      return { baseImageUrl: done.resultUrl, overlayPlan, brief, textBaked };
    }
    // failed (e.g. moderation) → server renders a Flux base synchronously
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

  // Legacy path (no Postgres): poll the fal handle directly.
  const deadline = Date.now() + 300_000; // ~5 min client-side cap
  let failures = 0;
  for (;;) {
    await delay(2500);
    if (Date.now() > deadline) {
      throw new Error(USER_ERRORS.timeout);
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

type VideoGenerateArgs = {
  productName: string;
  category?: string;
  presetId: string;
  productImage: string;
  aspectRatio?: "3:4" | "9:16" | "1:1";
  /** свой сценарий на русском — сервер переведёт и подставит вместо шаблона */
  userScenario?: string;
  /** админский тест: промпт как есть (сервер пустит только админа) */
  customPrompt?: string;
  /** админский тест: полный id модели fal */
  falModel?: string;
};

type VideoStart = {
  done: false;
  jobId?: string;
  job: ImageJobHandle;
};

/** Async video: submit → poll (server-tracked job, или fal-handle напрямую). */
async function generateVideo(args: VideoGenerateArgs): Promise<{ videoUrl: string }> {
  const started = await post<VideoStart>("/api/ai/video/generate", args);

  if (started.jobId) {
    const done = await pollTrackedJob(started.jobId);
    if (done.status === "completed" && done.resultUrl) {
      return { videoUrl: done.resultUrl };
    }
    throw new Error(done.error ?? USER_ERRORS.unexpected);
  }

  // legacy path (no Postgres): poll the fal handle directly
  const deadline = Date.now() + 420_000;
  let failures = 0;
  for (;;) {
    await delay(3000);
    if (Date.now() > deadline) {
      throw new Error(USER_ERRORS.timeout);
    }
    let status: { status: string; videoUrl?: string; error?: string };
    try {
      status = await post("/api/ai/video/generate/status", { job: started.job });
      failures = 0;
    } catch (e) {
      if (++failures >= 5) throw e;
      continue;
    }
    if (status.status === "completed" && status.videoUrl) return { videoUrl: status.videoUrl };
    if (status.status === "failed") {
      throw new Error(USER_ERRORS.moderation);
    }
  }
}

export const api = {
  analyze: (imageDataUrl: string, product?: Partial<ProductInfo>, concern?: string) =>
    post<AnalysisReport>("/api/ai/analyze", { imageDataUrl, product, concern }),

  compare: (
    mineDataUrl: string,
    competitorDataUrl: string,
    product?: Partial<ProductInfo>,
    concern?: string,
  ) =>
    post<import("@/core/ai/schemas").ComparisonReport>("/api/ai/compare", {
      mineDataUrl,
      competitorDataUrl,
      product,
      concern,
    }),

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
    /** the user's most recent server-tracked generation (for page restore) */
    latestJob: async (): Promise<TrackedJob | null> => {
      const res = await fetch("/api/jobs/latest?kind=infographic");
      if (!res.ok) return null;
      const data = (await res.json()) as { job?: TrackedJob | null };
      return data.job ?? null;
    },
    /** re-attach to a job started earlier (e.g. before the tab was closed) */
    resumeJob: (jobId: string) => pollTrackedJob(jobId),
  },

  video: {
    generate: (args: VideoGenerateArgs) => generateVideo(args),
    /** the user's most recent video job (for page restore) */
    latestJob: async (): Promise<TrackedJob | null> => {
      const res = await fetch("/api/jobs/latest?kind=video");
      if (!res.ok) return null;
      const data = (await res.json()) as { job?: TrackedJob | null };
      return data.job ?? null;
    },
    resumeJob: (jobId: string) => pollTrackedJob(jobId),
  },
};
