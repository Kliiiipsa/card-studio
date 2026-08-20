import type { ImageProvider, T2IRequest, I2IRequest, ImageResult, GeneratedImage } from "../types";
import { ProviderError } from "@/lib/errors";
import { USER_ERRORS, providerHttpMessage } from "@/lib/user-messages";

/**
 * OpenAI gpt-image provider (Images API). Enabled via
 * AI_INFOGRAPHIC_IMAGE_PROVIDER=openai (+ OPENAI_API_KEY).
 *
 *  - text-to-image -> POST /v1/images/generations
 *  - image-to-image -> POST /v1/images/edits (multipart, the reference image is
 *    the single input slot; gpt-image edits are generative, so it can recompose
 *    the product onto a clean card with empty space).
 *
 * gpt-image-1 always returns base64 (no URL), so images come back as data URLs.
 * It follows layout instructions well, which is why we use it for the
 * infographic base: it leaves cleaner text zones than a diffusion model. We
 * STILL keep text off the base (negative prompt) and draw it on canvas, so the
 * Russian copy stays pixel-perfect and editable.
 */
export class OpenAIImageProvider implements ImageProvider {
  readonly id = "openai";

  private apiKey = process.env.OPENAI_API_KEY ?? "";
  private model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  private quality = process.env.OPENAI_IMAGE_QUALITY ?? "high";
  private baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

  async textToImage(req: T2IRequest): Promise<ImageResult> {
    this.assertKey();
    const body = {
      model: this.model,
      prompt: composePrompt(req.prompt, req.negativePrompt),
      size: toSize(req.aspectRatio),
      quality: this.quality,
      n: req.count ?? 1,
    };
    const res = await this.post(`${this.baseUrl}/images/generations`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
    return this.parse(res);
  }

  async imageToImage(req: I2IRequest): Promise<ImageResult> {
    this.assertKey();
    const { blob, filename } = await toBlob(req.referenceImageDataUrl);
    const form = new FormData();
    form.append("model", this.model);
    form.append("prompt", composePrompt(req.prompt, req.negativePrompt));
    form.append("size", toSize(req.aspectRatio));
    form.append("quality", this.quality);
    form.append("n", String(req.count ?? 1));
    form.append("image", blob, filename);
    const res = await this.post(`${this.baseUrl}/images/edits`, {
      // let fetch set the multipart boundary; only auth header here
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    return this.parse(res);
  }

  private assertKey() {
    if (!this.apiKey) {
      throw new ProviderError(
        USER_ERRORS.notConfigured,
        "missing OPENAI_API_KEY",
      );
    }
  }

  private async post(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", cache: "no-store", ...init });
    } catch (e) {
      throw new ProviderError(
        USER_ERRORS.transient,
        `openai fetch failed: ${String(e)}`,
      );
    }
    if (!res.ok) {
      const detail = await safeText(res);
      throw new ProviderError(
        providerHttpMessage(res.status),
        `openai ${res.status}: ${detail}`,
      );
    }
    return res;
  }

  private async parse(res: Response): Promise<ImageResult> {
    const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const images: GeneratedImage[] = (data.data ?? [])
      .map((d): GeneratedImage | null => {
        if (d.b64_json) return { url: `data:image/png;base64,${d.b64_json}` };
        if (d.url) return { url: d.url };
        return null;
      })
      .filter((x): x is GeneratedImage => x !== null);
    if (!images.length) {
      throw new ProviderError(USER_ERRORS.providerDown, "openai empty images");
    }
    return { images, provider: this.id };
  }
}

/** Images API has no negative-prompt field — fold it into the prompt. */
function composePrompt(prompt: string, negative?: string): string {
  return negative ? `${prompt}\n\nStrictly avoid: ${negative}.` : prompt;
}

/** gpt-image-1 sizes: portrait 1024x1536, landscape 1536x1024, square 1024x1024. */
function toSize(ratio?: string): string {
  switch (ratio) {
    case "1:1":
      return "1024x1024";
    case "16:9":
    case "3:2":
    case "4:3":
      return "1536x1024";
    case "3:4":
    case "4:5":
    case "9:16":
    default:
      return "1024x1536";
  }
}

async function toBlob(src: string): Promise<{ blob: Blob; filename: string }> {
  if (src.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(src);
    if (!m) throw new ProviderError("Некорректное изображение.", "openai bad data url");
    const mime = m[1] || "image/png";
    const buf = Buffer.from(m[2], "base64");
    return { blob: new Blob([buf], { type: mime }), filename: `image.${extFor(mime)}` };
  }
  const res = await fetch(src, { cache: "no-store" });
  const mime = res.headers.get("content-type")?.split(";")[0] || "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  return { blob: new Blob([buf], { type: mime }), filename: `image.${extFor(mime)}` };
}

function extFor(mime: string): string {
  return mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}
