import type { ImageProvider, T2IRequest, I2IRequest, ImageResult, GeneratedImage } from "../types";
import { ProviderError } from "@/lib/errors";
import { USER_ERRORS, providerHttpMessage } from "@/lib/user-messages";

/**
 * fal.ai image provider. Enabled via AI_IMAGE_PROVIDER=fal and FAL_KEY
 * (format: key_id:key_secret).
 *
 *  - image-to-image uses FAL_I2I_MODEL (default fal-ai/flux-pro/kontext), an
 *    instruction-based editing model: { prompt, image_url, aspect_ratio }.
 *  - text-to-image uses FAL_T2I_MODEL (default fal-ai/flux/dev): { prompt,
 *    image_size }.
 *  - Seedream v4 (fal-ai/bytedance/seedream/v4/*): instruction-based like
 *    Kontext but with its own schema — image_urls[] (data URIs accepted),
 *    explicit { width, height } (MUST be set: schema default is 2048×2048
 *    square), no strength / negative_prompt / output_format fields. Returns
 *    PNG. Any Seedream failure auto-falls back to the Flux defaults so an
 *    untested model can never produce a worse outcome than today.
 *
 * Payload shape is selected by the model name (kontext / seedream / flux).
 */
export class FalImageProvider implements ImageProvider {
  readonly id = "fal";

  private apiKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "";
  private t2iModel = process.env.FAL_T2I_MODEL ?? "fal-ai/flux/dev";
  private i2iModel = process.env.FAL_I2I_MODEL ?? "fal-ai/flux-pro/kontext";
  private defaultRatio = process.env.FAL_ASPECT_RATIO ?? "3:4";

  async textToImage(req: T2IRequest): Promise<ImageResult> {
    const ratio = req.aspectRatio ?? this.defaultRatio;
    const input = buildT2IInput(this.t2iModel, req, ratio);
    if (isSeedream(this.t2iModel)) {
      try {
        return await this.run(this.t2iModel, input);
      } catch (e) {
        console.error(`[fal] ${this.t2iModel} failed, falling back to ${FALLBACK_T2I}:`, e);
        return this.run(FALLBACK_T2I, buildT2IInput(FALLBACK_T2I, req, ratio));
      }
    }
    return this.run(this.t2iModel, input);
  }

  async imageToImage(req: I2IRequest): Promise<ImageResult> {
    const ratio = req.aspectRatio ?? this.defaultRatio;
    const input = buildI2IInput(this.i2iModel, req, ratio);
    if (isSeedream(this.i2iModel)) {
      try {
        return await this.run(this.i2iModel, input);
      } catch (e) {
        console.error(`[fal] ${this.i2iModel} failed, falling back to ${FALLBACK_I2I}:`, e);
        return this.run(FALLBACK_I2I, buildI2IInput(FALLBACK_I2I, req, ratio));
      }
    }
    return this.run(this.i2iModel, input);
  }

  private async run(model: string, input: Record<string, unknown>): Promise<ImageResult> {
    if (!this.apiKey) {
      throw new ProviderError(USER_ERRORS.notConfigured, "missing FAL_KEY");
    }

    let res: Response;
    try {
      res = await fetch(`https://fal.run/${model}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${this.apiKey}`,
          ...FAL_PRIVACY_HEADERS,
        },
        body: JSON.stringify(prune(input)),
        cache: "no-store",
      });
    } catch (e) {
      throw new ProviderError(USER_ERRORS.transient, `fal fetch failed: ${String(e)}`);
    }

    if (!res.ok) {
      const detail = await safeText(res);
      // текст клиенту зависит от кода: кончился баланс ≠ «попробуйте ещё раз»
      throw new ProviderError(providerHttpMessage(res.status), `fal ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as {
      images?: { url: string; width?: number; height?: number }[];
    };
    const images: GeneratedImage[] = (data.images ?? []).map((img) => ({
      url: img.url,
      width: img.width,
      height: img.height,
    }));
    if (!images.length) {
      throw new ProviderError("Сервис генерации не вернул изображений.", "fal empty images");
    }
    return { images, provider: this.id };
  }
}

/** Proven Flux defaults — the safety net while Seedream is unvalidated. */
const FALLBACK_T2I = "fal-ai/flux/dev";
const FALLBACK_I2I = "fal-ai/flux-pro/kontext";

/**
 * Privacy: user photos travel in these requests. Don't let fal store request
 * payloads (default 30 days), and expire generated files on their public CDN
 * after 1 hour — every result is persisted to our own S3 right away, so the
 * fal URL only needs to survive the immediate download.
 */
export const FAL_PRIVACY_HEADERS: Record<string, string> = {
  "X-Fal-Store-IO": "0",
  "X-Fal-Object-Lifecycle-Preference": JSON.stringify({ expiration_duration_seconds: 3600 }),
};

function buildT2IInput(model: string, req: T2IRequest, ratio: string): Record<string, unknown> {
  if (isSeedream(model)) {
    return {
      prompt: req.prompt,
      image_size: toSeedreamSize(ratio),
      num_images: req.count ?? 2,
    };
  }
  // jpeg output ≈ 3–4× smaller than png with no visible difference on
  // photographic cards — matters because results are persisted to our S3
  if (isKontext(model)) {
    return {
      prompt: req.prompt,
      aspect_ratio: toAspectRatio(ratio),
      num_images: req.count ?? 2,
      output_format: "jpeg",
    };
  }
  return {
    prompt: req.prompt,
    image_size: toImageSize(ratio),
    num_images: req.count ?? 2,
    output_format: "jpeg",
  };
}

function buildI2IInput(model: string, req: I2IRequest, ratio: string): Record<string, unknown> {
  if (isSeedream(model)) {
    // no strength knob: preservation is steered by the prompt wording; the
    // negative prompt (no dedicated field) is folded into the instruction
    return {
      prompt: withAvoid(req.prompt, req.negativePrompt),
      image_urls: [req.referenceImageDataUrl],
      image_size: toSeedreamSize(ratio),
      num_images: req.count ?? 2,
    };
  }
  if (isKontext(model)) {
    return {
      prompt: req.prompt,
      image_url: req.referenceImageDataUrl,
      aspect_ratio: toAspectRatio(ratio),
      num_images: req.count ?? 2,
      output_format: "jpeg",
    };
  }
  return {
    prompt: req.prompt,
    negative_prompt: req.negativePrompt || undefined,
    image_url: req.referenceImageDataUrl,
    strength: req.strength ?? 0.55,
    image_size: toImageSize(ratio),
    num_images: req.count ?? 2,
    output_format: "jpeg",
  };
}

function isKontext(model: string): boolean {
  return model.toLowerCase().includes("kontext");
}

function isSeedream(model: string): boolean {
  return model.toLowerCase().includes("seedream");
}

/**
 * Разобрать произвольную строку пропорции "W:H" (или "3:4") в число w/h.
 * Возвращает null для нераспознаваемого. Нужно для режима «Как у исходного
 * фото», где клиент присылает реальные пиксели референса, например "4032:3024".
 */
function parseRatio(ratio: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(ratio);
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!(w > 0 && h > 0) || !Number.isFinite(w / h)) return null;
  return w / h;
}

/** Подобрать пиксели под произвольную пропорцию: длинная сторона `long`,
 *  короткая не меньше `min`, обе кратны 64 и не больше `max`. */
function sizeForAspect(ar: number, long: number, min: number, max: number) {
  let w: number, h: number;
  if (ar >= 1) {
    w = long;
    h = long / ar;
  } else {
    h = long;
    w = long * ar;
  }
  const shortest = Math.min(w, h);
  if (shortest < min) {
    const k = min / shortest;
    w *= k;
    h *= k;
  }
  const round64 = (n: number) => Math.min(max, Math.max(64, Math.round(n / 64) * 64));
  return { width: round64(w), height: round64(h) };
}

/** Kontext-style aspect_ratio enum. Произвольную пропорцию мапим на ближайшую. */
function toAspectRatio(ratio: string): string {
  const supported = ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"];
  if (supported.includes(ratio)) return ratio;
  if (ratio === "4:5") return "3:4";
  const ar = parseRatio(ratio);
  if (ar !== null) {
    let best = "3:4";
    let bestDiff = Infinity;
    for (const s of supported) {
      const sr = parseRatio(s)!;
      const diff = Math.abs(sr - ar);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = s;
      }
    }
    return best;
  }
  return "3:4";
}

/** flux/dev image_size — explicit dimensions keep WB proportions. */
function toImageSize(ratio: string) {
  switch (ratio) {
    case "4:5":
      return { width: 864, height: 1080 };
    case "1:1":
      return { width: 1024, height: 1024 };
    case "9:16":
      return { width: 768, height: 1344 };
    case "3:4":
      return { width: 900, height: 1200 };
    default: {
      const ar = parseRatio(ratio);
      return ar !== null ? sizeForAspect(ar, 1200, 720, 1440) : { width: 900, height: 1200 };
    }
  }
}

/**
 * Seedream image_size — explicit pixels only. Constraints: total area ≥ 960×960,
 * presets undocumented, default is a 2048×2048 square. Multiples of 64 are safe.
 */
function toSeedreamSize(ratio: string) {
  switch (ratio) {
    case "4:5":
      return { width: 1024, height: 1280 };
    case "1:1":
      return { width: 1024, height: 1024 };
    case "9:16":
      return { width: 1152, height: 2048 };
    case "3:4":
      return { width: 1152, height: 1536 };
    default: {
      // произвольная пропорция («Как у исходного фото»): длинная сторона 1536,
      // короткая ≥ 768, обе кратны 64, потолок 2048 — вписываемся в лимиты Seedream
      const ar = parseRatio(ratio);
      return ar !== null ? sizeForAspect(ar, 1536, 768, 2048) : { width: 1152, height: 1536 };
    }
  }
}

/** Seedream has no negative_prompt field — express it inside the instruction. */
function withAvoid(prompt: string, negative?: string): string {
  const neg = negative?.trim();
  return neg ? `${prompt} Избегай: ${neg}.` : prompt;
}

function prune(obj: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}
