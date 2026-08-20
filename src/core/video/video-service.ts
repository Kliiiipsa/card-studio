import "server-only";
import { getLLMProvider } from "@/core/ai/providers";
import { FAL_PRIVACY_HEADERS } from "@/core/ai/providers/image/fal";
import { ProviderError } from "@/lib/errors";
import {
  getVideoPreset,
  VIDEO_GUARDRAILS,
  VIDEO_DURATION_SEC,
  type VideoAspect,
} from "./presets";

/**
 * «Видео товара»: image-to-video через очередь fal. Дефолт — Kling 2.5 Turbo
 * Pro ($0.35/5с ≈ 28 ₽): в A/B 2026-08-20 единственный сохранил и товар, и
 * сцену (Seedance Fast дорисовывал логотипы и «переодевал» моделей, Seedance
 * Pro пересочинял фон). Модель переключается через FAL_VIDEO_MODEL.
 *
 * Схема входа зависит от семейства (ветка по id модели):
 *  - kling: prompt + image_url + duration + NEGATIVE prompt + cfg_scale;
 *    формат ролика повторяет формат фото (aspect_ratio не принимает)
 *  - seedance (запасной путь): resolution/aspect_ratio/duration/camera_fixed
 *
 * Схема та же, что у async-инфографики: submit → короткие poll-запросы
 * (клиент или серверный watcher), длительная генерация не держит ни одного
 * HTTP-запроса открытым. AI_VIDEO_PROVIDER=mock — режим без трат для
 * локальных тестов UI и нагрузки.
 */

const DEFAULT_MODEL = "fal-ai/kling-video/v2.5-turbo/pro/image-to-video";

/**
 * У Kling есть настоящий негативный промпт — вот где МОЖНО и НУЖНО называть
 * нежелательное (в позитивном промпте это работало как приглашение).
 */
const KLING_NEGATIVE =
  "blur, distortion, low quality, morphing, deformation, melting, extra objects, " +
  "added text, captions, subtitles, watermark, logo, brand print, changing clothes, extra limbs";

export type VideoJobHandle = {
  provider: string;
  statusUrl: string;
  responseUrl: string;
};

export type VideoJobStatus = {
  status: "pending" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
};

function apiKey(): string {
  return process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "";
}

function isMock(): boolean {
  return process.env.AI_VIDEO_PROVIDER === "mock";
}

/* ------------------------------ prompt ------------------------------ */

/**
 * Короткое английское описание товара для шаблона движения. Qwen переводит
 * название (пользователь видит только русский); при любой ошибке — нейтральное
 * "the product", ролик всё равно осмыслен: содержание несёт фото.
 */
async function englishDescriptor(productName: string, category?: string): Promise<string> {
  const source = [productName, category].filter(Boolean).join(", ");
  if (!source.trim()) return "the product";
  try {
    const llm = getLLMProvider();
    const res = await llm.complete({
      task: "translate",
      temperature: 0.2,
      maxTokens: 60,
      messages: [
        {
          role: "system",
          content:
            "Translate the Russian product name into a short English noun phrase (2–6 words) for an AI video prompt. Reply with the phrase ONLY — no quotes, no punctuation, no explanations.",
        },
        { role: "user", content: source.slice(0, 200) },
      ],
    });
    const phrase = res.text.trim().replace(/^["'«]+|["'»]+$/g, "").split("\n")[0].slice(0, 80);
    return phrase && /[a-zA-Z]/.test(phrase) ? `the ${phrase.replace(/^the\s+/i, "")}` : "the product";
  } catch {
    return "the product";
  }
}

/** Собрать финальный (английский) промпт движения из пресета. */
export async function buildVideoPrompt(args: {
  presetId: string;
  productName: string;
  category?: string;
}): Promise<{ prompt: string; cameraFixed: boolean }> {
  const preset = getVideoPreset(args.presetId);
  if (!preset) throw new ProviderError("Неизвестный пресет движения.", `preset ${args.presetId}`);
  const descriptor = await englishDescriptor(args.productName, args.category);
  return {
    prompt: `${preset.template.replace(/\{product\}/g, descriptor)}. ${VIDEO_GUARDRAILS}`,
    cameraFixed: Boolean(preset.cameraFixed),
  };
}

/* ------------------------------ fal queue ------------------------------ */

export async function submitVideoJob(args: {
  prompt: string;
  imageDataUrl: string;
  aspectRatio?: VideoAspect;
  cameraFixed?: boolean;
}): Promise<VideoJobHandle> {
  if (isMock()) {
    return {
      provider: "mock-video",
      statusUrl: "https://queue.fal.run/mock/video/status",
      responseUrl: `https://queue.fal.run/mock/video/response/${Date.now()}`,
    };
  }
  if (!apiKey()) {
    throw new ProviderError(
      "Генерация видео не настроена. Добавьте FAL_KEY в переменные окружения.",
      "missing FAL_KEY",
    );
  }
  const model = process.env.FAL_VIDEO_MODEL ?? DEFAULT_MODEL;
  const input: Record<string, unknown> = model.includes("kling")
    ? {
        // Kling: формат ролика повторяет формат исходного фото
        prompt: args.prompt,
        image_url: args.imageDataUrl,
        duration: String(VIDEO_DURATION_SEC),
        negative_prompt: KLING_NEGATIVE,
        cfg_scale: 0.5,
      }
    : {
        // Seedance (запасной путь через FAL_VIDEO_MODEL)
        prompt: args.prompt,
        image_url: args.imageDataUrl,
        resolution: process.env.FAL_VIDEO_RESOLUTION ?? "1080p",
        duration: String(VIDEO_DURATION_SEC),
        aspect_ratio: args.aspectRatio ?? "auto",
        ...(args.cameraFixed ? { camera_fixed: true } : {}),
      };
  const submitted = await fetchJson(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey()}`,
      ...FAL_PRIVACY_HEADERS,
    },
    body: JSON.stringify(input),
  });
  const statusUrl = submitted.status_url as string | undefined;
  const responseUrl = submitted.response_url as string | undefined;
  if (!statusUrl || !responseUrl) {
    throw new ProviderError(
      "Сервис генерации видео вернул ошибку. Попробуйте ещё раз.",
      `fal-video bad submit: ${JSON.stringify(submitted).slice(0, 300)}`,
    );
  }
  return { provider: "fal-video", statusUrl, responseUrl };
}

/** Один опрос очереди. Модерация/сбой модели → failed (без списания искр). */
export async function pollVideoJob(handle: VideoJobHandle): Promise<VideoJobStatus> {
  if (handle.provider === "mock-video" || isMock()) {
    // имитируем ~10 с генерации по метке времени в responseUrl
    const started = Number(handle.responseUrl.split("/").pop()) || 0;
    if (Date.now() - started < 10_000) return { status: "pending" };
    return {
      status: "completed",
      videoUrl:
        "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
    };
  }
  if (!apiKey()) {
    throw new ProviderError(
      "Генерация видео не настроена. Добавьте FAL_KEY в переменные окружения.",
      "missing FAL_KEY",
    );
  }
  const auth = { Authorization: `Key ${apiKey()}` };
  const st = await fetchJson(handle.statusUrl, { headers: auth });
  const status = String(st.status ?? "");
  if (status === "IN_QUEUE" || status === "IN_PROGRESS") return { status: "pending" };
  if (status !== "COMPLETED") {
    const reason = await rawText(handle.responseUrl, auth);
    console.error("[fal-video] job failed:", status, reason);
    return { status: "failed", error: `fal-video status ${status}: ${reason}` };
  }
  const data = (await fetchJson(handle.responseUrl, { headers: auth })) as {
    video?: { url?: string };
  };
  const url = data.video?.url;
  if (!url) return { status: "failed", error: "fal-video empty response" };
  return { status: "completed", videoUrl: url };
}

/* ------------------------------ helpers ------------------------------ */

/** Сетевые сбои ретраим, реальные HTTP-ошибки (422 модерация и т.п.) — наружу. */
async function fetchJson(
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
      const detail = (await res.text().catch(() => "")).slice(0, 500);
      console.error("[fal-video] http error:", res.status, detail);
      throw new ProviderError(
        "Сервис генерации видео вернул ошибку. Попробуйте ещё раз.",
        `fal-video ${res.status}: ${detail}`,
      );
    }
    return (await res.json()) as Record<string, unknown>;
  }
  throw new ProviderError(
    "Не удалось связаться с сервисом генерации видео. Попробуйте позже.",
    `fal-video fetch failed after ${retries + 1} attempts: ${String(lastErr)}`,
  );
}

async function rawText(url: string, headers: Record<string, string>): Promise<string> {
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    return (await res.text()).slice(0, 600);
  } catch (e) {
    return `<no body: ${String(e)}>`;
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
