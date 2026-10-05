import type { LLMProvider, LLMRequest, LLMResult, LLMMessage } from "../types";
import { ProviderError } from "@/lib/errors";

/**
 * Qwen (and YandexGPT) models hosted in Yandex Cloud Foundation Models via the
 * OpenAI-compatible endpoint. Enabled with AI_LLM_PROVIDER=yandex.
 *
 * Differences from the DashScope/qwen adapter:
 *  - auth header is `Authorization: Api-Key <key>`
 *  - model id format: gpt://<folderId>/<model>/latest
 *  - `chat_template_kwargs.enable_thinking=false` disables Qwen3 reasoning
 *    (verified: without it the model fills `reasoning_content` and leaves
 *    `content` null, eating the token budget on chain-of-thought)
 *  - response_format is NOT sent (endpoint may reject it) — JSON is requested in
 *    the prompt and extracted defensively in the service layer.
 *
 * Резервный ключ (05.10.2026, решение владельца). Основной ключ —
 * YANDEX_API_KEY + YANDEX_FOLDER_ID, резервный — YANDEX_API_KEY_RESERVE +
 * YANDEX_FOLDER_ID_RESERVE (у каждого ключа свой каталог: ключ сервисного
 * аккаунта работает только со своим каталогом, иначе 403). Если основной
 * отвечает отказом доступа, лимитом, ошибкой сервера или недоступен по сети —
 * тот же запрос молча уходит на резерв, клиент ничего не замечает. После сбоя
 * основного 5 минут сразу идём на резерв, чтобы каждый запрос не ждал
 * заведомо упавший ключ, потом снова пробуем основной.
 */

type YandexKey = { label: "основной" | "резервный"; apiKey: string; folderId: string };

/** Ошибка, после которой есть смысл повторить тот же запрос на другом ключе. */
class KeyFailure extends Error {
  constructor(
    readonly detail: string,
    readonly userMessage: string,
  ) {
    super(detail);
  }
}

/** после сбоя основного ключа — сколько времени сразу идти на резервный */
const PRIMARY_COOLDOWN_MS = 5 * 60 * 1000;
let primaryDownUntil = 0;

/** Какой ключ сейчас первый в очереди — для вкладки «Состояние» в админке. */
export function yandexActiveKey(): "основной" | "резервный" {
  return Date.now() < primaryDownUntil && process.env.YANDEX_API_KEY_RESERVE
    ? "резервный"
    : "основной";
}

export class YandexLLMProvider implements LLMProvider {
  readonly id = "yandex";

  private model = process.env.YANDEX_LLM_MODEL ?? "qwen3.6-35b-a3b";
  private baseUrl = process.env.YANDEX_BASE_URL ?? "https://ai.api.cloud.yandex.net/v1";

  private keys(): YandexKey[] {
    const list: YandexKey[] = [];
    const primary = process.env.YANDEX_API_KEY;
    if (primary) {
      list.push({
        label: "основной",
        apiKey: primary,
        folderId: process.env.YANDEX_FOLDER_ID ?? "b1g2kv9g5q3fstk360sa",
      });
    }
    const reserve = process.env.YANDEX_API_KEY_RESERVE;
    const reserveFolder = process.env.YANDEX_FOLDER_ID_RESERVE;
    if (reserve && reserveFolder && reserve !== primary) {
      list.push({ label: "резервный", apiKey: reserve, folderId: reserveFolder });
    }
    // основной недавно падал — сначала резерв, основной остаётся запасным
    if (list.length > 1 && Date.now() < primaryDownUntil) list.reverse();
    return list;
  }

  async complete(req: LLMRequest): Promise<LLMResult> {
    const keys = this.keys();
    if (!keys.length) {
      throw new ProviderError(
        "AI-провайдер не настроен. Добавьте YANDEX_API_KEY в переменные окружения.",
        "missing YANDEX_API_KEY",
      );
    }

    let last: KeyFailure | null = null;
    for (const key of keys) {
      try {
        const result = await this.callWith(key, req);
        if (key.label === "основной") primaryDownUntil = 0;
        return result;
      } catch (e) {
        if (!(e instanceof KeyFailure)) throw e; // ошибка запроса, а не ключа
        last = e;
        if (key.label === "основной") primaryDownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
        console.warn(`[yandex] ${key.label} ключ не сработал: ${e.detail.slice(0, 200)}`);
      }
    }
    throw new ProviderError(
      last?.userMessage ?? "AI-сервис вернул ошибку. Попробуйте ещё раз.",
      last?.detail ?? "yandex: all keys failed",
    );
  }

  private async callWith(key: YandexKey, req: LLMRequest): Promise<LLMResult> {
    const body: Record<string, unknown> = {
      model: `gpt://${key.folderId}/${this.model}/latest`,
      messages: req.messages.map(toOpenAIMessage),
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? 4000,
      // disable Qwen3 reasoning so `content` carries the answer (not null)
      chat_template_kwargs: { enable_thinking: false },
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Api-Key ${key.apiKey}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch (e) {
      throw new KeyFailure(
        `yandex fetch failed: ${String(e)}`,
        "Не удалось связаться с AI-сервисом. Попробуйте позже.",
      );
    }

    if (!res.ok) {
      const detail = `yandex ${res.status}: ${await safeText(res)}`;
      // доступ, лимиты, сбой на стороне Яндекса — повод попробовать другой ключ;
      // 400 и прочие — ошибка самого запроса, резерв её не исправит
      if ([401, 403, 429].includes(res.status) || res.status >= 500) {
        throw new KeyFailure(detail, "AI-сервис вернул ошибку. Попробуйте ещё раз.");
      }
      throw new ProviderError("AI-сервис вернул ошибку. Попробуйте ещё раз.", detail);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) {
      throw new ProviderError("AI-сервис вернул пустой ответ.", "yandex empty content");
    }
    return { text: stripThink(text) };
  }
}

function toOpenAIMessage(m: LLMMessage) {
  if (m.imageDataUrl) {
    return {
      role: m.role,
      content: [
        { type: "text", text: m.content },
        { type: "image_url", image_url: { url: m.imageDataUrl } },
      ],
    };
  }
  return { role: m.role, content: m.content };
}

/** Remove any <think>...</think> block in case the model still emits one. */
function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}
