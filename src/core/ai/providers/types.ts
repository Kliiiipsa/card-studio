/** ---------- LLM provider ---------- */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** optional image (data URL) for vision models */
  imageDataUrl?: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  /** ask the model to return strict JSON */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** hint that a vision-capable model is required */
  vision?: boolean;
  /**
   * Task discriminator + context. Real providers IGNORE these and rely only on
   * `messages`. The mock provider uses them to synthesise realistic responses
   * without a real model.
   */
  task?:
    | "analyze"
    | "ideas"
    | "improve-prompt"
    | "build-prompt"
    | "write-prompt"
    | "score"
    | "translate";
  context?: Record<string, unknown>;
}

export interface LLMResult {
  text: string;
}

export interface LLMProvider {
  readonly id: string;
  complete(req: LLMRequest): Promise<LLMResult>;
}

/** ---------- Image provider ---------- */

export interface T2IRequest {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  count?: number;
}

export interface I2IRequest extends T2IRequest {
  referenceImageDataUrl: string;
  /** 0..1 — lower preserves the source product more strongly */
  strength?: number;
  /**
   * Additional reference images (after `referenceImageDataUrl`). Only providers
   * with multi-image input use them (gpt-image-2); single-image models ignore
   * them. Used to pass a STYLE reference alongside the product photo.
   */
  extraImageUrls?: string[];
}

export interface GeneratedImage {
  /** data URL or remote URL depending on provider */
  url: string;
  width?: number;
  height?: number;
}

export interface ImageResult {
  images: GeneratedImage[];
  provider: string;
}

/**
 * Handle to an in-flight async generation (queue-backed providers only). It is
 * returned to the client and passed back to poll, so it must contain NO secrets
 * — the polling endpoint re-attaches the API key server-side. The fal queue URLs
 * are safe: useless without the key.
 */
export interface ImageJobHandle {
  provider: string;
  statusUrl: string;
  responseUrl: string;
}

export interface ImageJobStatus {
  status: "pending" | "completed" | "failed";
  images?: GeneratedImage[];
  /** technical reason when status === "failed" (e.g. moderation) */
  error?: string;
}

export interface ImageProvider {
  readonly id: string;
  textToImage(req: T2IRequest): Promise<ImageResult>;
  imageToImage(req: I2IRequest): Promise<ImageResult>;
  /**
   * Async queue support (optional). Providers backed by a job queue (fal) submit
   * the job and are polled separately, so no single HTTP request stays open for
   * the full (multi-minute) generation — required to survive short serverless
   * function timeouts. Sync providers (mock, Flux) omit these and run inline.
   */
  supportsAsync?: boolean;
  submitTextToImage?(req: T2IRequest): Promise<ImageJobHandle>;
  submitImageToImage?(req: I2IRequest): Promise<ImageJobHandle>;
  pollJob?(handle: ImageJobHandle): Promise<ImageJobStatus>;
}
