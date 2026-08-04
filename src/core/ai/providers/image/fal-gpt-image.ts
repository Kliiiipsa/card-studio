import type {
  ImageProvider,
  T2IRequest,
  I2IRequest,
  ImageResult,
  GeneratedImage,
  ImageJobHandle,
  ImageJobStatus,
} from "../types";
import { ProviderError } from "@/lib/errors";

/**
 * OpenAI gpt-image-2 hosted on fal.ai. Enabled via
 * AI_INFOGRAPHIC_IMAGE_PROVIDER=fal-gpt-image (uses the existing FAL_KEY — no
 * separate OpenAI key needed; fal bills it).
 *
 * Distinct from FalImageProvider because gpt-image-2 has a different input
 * schema than FLUX (image_urls[], image_size presets, quality, no negative
 * prompt). We keep using it for a CLEAN, text-free base (the no-text rule stays
 * in the prompt) and overlay the Russian copy on canvas — gpt-image follows the
 * "leave space, no text" instruction better than a diffusion model.
 *
 *  - text-to-image  -> fal-ai/gpt-image-2            { prompt, image_size, ... }
 *  - image-to-image -> openai/gpt-image-2/edit       { prompt, image_urls, ... }
 */
export class FalGptImageProvider implements ImageProvider {
  readonly id = "fal-gpt-image";
  /**
   * gpt-image-2 is slow (often 30–90s, sometimes minutes). We use the fal QUEUE
   * API and expose submit/poll separately so the wait can live on the client
   * (short HTTP calls) instead of one long serverless request that a 60s function
   * timeout would kill mid-generation.
   */
  readonly supportsAsync = true;

  private apiKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "";
  private t2iModel = process.env.FAL_GPT_IMAGE_T2I_MODEL ?? "openai/gpt-image-2";
  private i2iModel = process.env.FAL_GPT_IMAGE_I2I_MODEL ?? "openai/gpt-image-2/edit";
  private quality = process.env.FAL_GPT_IMAGE_QUALITY ?? "high";
  /** optional BYOK — route through your own OpenAI quota instead of fal's */
  private byokKey = process.env.OPENAI_API_KEY ?? "";

  /* -------- synchronous entrypoints (submit + poll to completion) -------- */

  async textToImage(req: T2IRequest): Promise<ImageResult> {
    return this.awaitJob(await this.submitTextToImage(req));
  }

  async imageToImage(req: I2IRequest): Promise<ImageResult> {
    return this.awaitJob(await this.submitImageToImage(req));
  }

  /* ------------------------- async job entrypoints ------------------------- */

  async submitTextToImage(req: T2IRequest): Promise<ImageJobHandle> {
    return this.submit(this.t2iModel, {
      prompt: composePrompt(req.prompt, req.negativePrompt),
      image_size: toImageSize(req.aspectRatio),
      quality: this.quality,
      num_images: req.count ?? 1,
      ...(this.byokKey ? { openai_api_key: this.byokKey } : {}),
    });
  }

  async submitImageToImage(req: I2IRequest): Promise<ImageJobHandle> {
    return this.submit(this.i2iModel, {
      prompt: composePrompt(req.prompt, req.negativePrompt),
      // gpt-image-2 edit accepts URLs or base64 data URIs directly; the first is
      // the primary (product), extras are style references
      image_urls: [req.referenceImageDataUrl, ...(req.extraImageUrls ?? [])],
      image_size: toImageSize(req.aspectRatio),
      quality: this.quality,
      num_images: req.count ?? 1,
      ...(this.byokKey ? { openai_api_key: this.byokKey } : {}),
    });
  }

  /** Submit a job to the fal queue and return its status/response URLs. */
  private async submit(model: string, input: Record<string, unknown>): Promise<ImageJobHandle> {
    if (!this.apiKey) {
      throw new ProviderError(
        "Генерация изображений не настроена. Добавьте FAL_KEY в переменные окружения.",
        "missing FAL_KEY",
      );
    }
    const submitted = await this.fetchJson(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${this.apiKey}` },
      body: JSON.stringify(input),
    });
    const statusUrl = submitted.status_url as string | undefined;
    const responseUrl = submitted.response_url as string | undefined;
    if (!statusUrl || !responseUrl) {
      throw new ProviderError(
        "Сервис генерации вернул ошибку. Попробуйте ещё раз.",
        `fal-gpt-image bad submit: ${JSON.stringify(submitted).slice(0, 300)}`,
      );
    }
    return { provider: this.id, statusUrl, responseUrl };
  }

  /**
   * One poll of a queued job. Returns pending/completed/failed. Network blips
   * (surfaced as thrown ProviderError after internal retries) bubble up so the
   * caller can retry; a genuinely FAILED job (e.g. content moderation) resolves
   * to { status: "failed" } so the caller can fall back to Flux.
   */
  async pollJob(handle: ImageJobHandle): Promise<ImageJobStatus> {
    if (!this.apiKey) {
      throw new ProviderError(
        "Генерация изображений не настроена. Добавьте FAL_KEY в переменные окружения.",
        "missing FAL_KEY",
      );
    }
    const auth = { Authorization: `Key ${this.apiKey}` };
    const st = await this.fetchJson(handle.statusUrl, { headers: auth });
    const status = String(st.status ?? "");
    if (status === "IN_QUEUE" || status === "IN_PROGRESS") return { status: "pending" };
    if (status !== "COMPLETED") {
      // a failed job carries its real reason in the response URL body
      const reason = await rawText(handle.responseUrl, auth);
      // eslint-disable-next-line no-console
      console.error("[fal-gpt-image] job failed:", status, reason);
      return { status: "failed", error: `fal-gpt-image status ${status}: ${reason}` };
    }
    const data = (await this.fetchJson(handle.responseUrl, { headers: auth })) as {
      images?: { url: string; width?: number; height?: number }[];
    };
    const images: GeneratedImage[] = (data.images ?? []).map((img) => ({
      url: img.url,
      width: img.width,
      height: img.height,
    }));
    if (!images.length) return { status: "failed", error: "fal-gpt-image empty" };
    return { status: "completed", images };
  }

  /** Poll a submitted job to completion in-process (for synchronous callers). */
  private async awaitJob(handle: ImageJobHandle): Promise<ImageResult> {
    const deadline = Date.now() + 240_000;
    for (;;) {
      await delay(2500);
      const st = await this.pollJob(handle);
      if (st.status === "completed") return { images: st.images ?? [], provider: this.id };
      if (st.status === "failed") {
        throw new ProviderError(
          "Сервис генерации вернул ошибку. Попробуйте ещё раз.",
          st.error ?? "fal-gpt-image failed",
        );
      }
      if (Date.now() > deadline) {
        throw new ProviderError(
          "Генерация заняла слишком долго. Попробуйте ещё раз или снизьте качество.",
          "fal-gpt-image timeout",
        );
      }
    }
  }

  /**
   * Network-level failures (`TypeError: fetch failed`) are transient and, over a
   * ~150s polling loop, a single dropped request would otherwise abort the whole
   * generation and fall back to Flux. Retry the NETWORK error a few times; do NOT
   * retry real HTTP errors (e.g. 422 content moderation) — those are surfaced.
   */
  private async fetchJson(
    url: string,
    init: RequestInit,
    retries = 3,
  ): Promise<Record<string, unknown>> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, { cache: "no-store", ...init });
      } catch (e) {
        lastErr = e;
        if (attempt < retries) {
          await delay(1500);
          continue;
        }
        break;
      }
      if (!res.ok) {
        const detail = await safeText(res);
        // eslint-disable-next-line no-console
        console.error("[fal-gpt-image] http error:", res.status, detail);
        throw new ProviderError(
          "Сервис генерации вернул ошибку. Попробуйте ещё раз.",
          `fal-gpt-image ${res.status}: ${detail}`,
        );
      }
      return (await res.json()) as Record<string, unknown>;
    }
    throw new ProviderError(
      "Не удалось связаться с сервисом генерации. Попробуйте позже.",
      `fal-gpt-image fetch failed after ${retries + 1} attempts: ${String(lastErr)}`,
    );
  }
}

/** Fetch a URL and return its body text regardless of status (for error detail). */
async function rawText(url: string, headers: Record<string, string>): Promise<string> {
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    return (await res.text()).slice(0, 600);
  } catch (e) {
    return `<no body: ${String(e)}>`;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** gpt-image-2 has no negative-prompt field — fold it into the prompt. */
function composePrompt(prompt: string, negative?: string): string {
  return negative ? `${prompt}\n\nStrictly avoid: ${negative}.` : prompt;
}

/** Map our aspect ratios to gpt-image-2 size presets (portrait_4_3 == 3:4). */
function toImageSize(ratio?: string): string {
  switch (ratio) {
    case "1:1":
      return "square_hd";
    case "16:9":
      return "landscape_16_9";
    case "4:3":
      return "landscape_4_3";
    case "3:4":
    case "4:5":
    case "9:16":
    default:
      return "portrait_4_3";
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}
