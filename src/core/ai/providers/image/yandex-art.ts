import "server-only";
import { AppError } from "@/lib/errors";

/**
 * ВРЕМЕННЫЙ тестовый провайдер: AliceAI image-art (Yandex AI Studio) через их
 * OpenAI-совместимый эндпоинт. Существует только для гипотезы «сможет ли
 * AliceAI заменить gpt-image в инфографике» на странице /infographics-test.
 * В боевые пайплайны НЕ подключён; после теста файл удаляется целиком.
 *
 * Ограничение против gpt-image: только text-to-image — фото товара на вход
 * не принимает, товар на карточке будет нарисован моделью.
 */
const BASE = "https://ai.api.cloud.yandex.net/v1";

export function yandexArtConfigured(): boolean {
  return Boolean(process.env.YANDEX_CLOUD_API_KEY && process.env.YANDEX_CLOUD_FOLDER);
}

export async function generateYandexArt(prompt: string): Promise<string> {
  if (!yandexArtConfigured()) {
    throw new AppError(
      "Yandex AI Studio не настроен: добавьте YANDEX_CLOUD_API_KEY и YANDEX_CLOUD_FOLDER в .env.",
      503,
    );
  }
  const folder = process.env.YANDEX_CLOUD_FOLDER!;
  const model = process.env.YANDEX_CLOUD_MODEL ?? "aliceai-image-art-3.0/latest";

  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.YANDEX_CLOUD_API_KEY}`,
      // так openai-клиент передаёт project из примера Яндекса
      "OpenAI-Project": folder,
    },
    body: JSON.stringify({
      model: `art://${folder}/${model}`,
      prompt,
      size: "1024x1024",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(110_000),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    throw new AppError(`AliceAI: ${res.status} ${detail}`, 502);
  }
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new AppError("AliceAI вернул ответ без изображения.", 502);
  return `data:image/png;base64,${b64}`;
}
