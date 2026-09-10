import "server-only";
import type { ImageProvider, LLMProvider } from "./types";
import { MockLLMProvider } from "./llm/mock";
import { QwenLLMProvider } from "./llm/qwen";
import { YandexLLMProvider } from "./llm/yandex";
import { GlenLLMProvider } from "./llm/glen";
import { MockImageProvider } from "./image/mock";
import { FalImageProvider } from "./image/fal";
import { FalGptImageProvider } from "./image/fal-gpt-image";
import { OpenAIImageProvider } from "./image/openai";

let llmSingleton: LLMProvider | null = null;
const imageProviders = new Map<string, ImageProvider>();

/** AI_TEXT_PROVIDER is the preferred name; AI_LLM_PROVIDER kept for compatibility. */
function llmChoice(): string {
  return (process.env.AI_TEXT_PROVIDER ?? process.env.AI_LLM_PROVIDER ?? "mock").toLowerCase();
}

export function getLLMProvider(): LLMProvider {
  if (llmSingleton) return llmSingleton;
  switch (llmChoice()) {
    case "yandex":
      llmSingleton = new YandexLLMProvider();
      break;
    case "qwen":
      llmSingleton = new QwenLLMProvider();
      break;
    case "glen":
      llmSingleton = new GlenLLMProvider();
      break;
    case "mock":
    default:
      llmSingleton = new MockLLMProvider();
  }
  return llmSingleton;
}

function makeImageProvider(choice: string): ImageProvider {
  switch (choice) {
    case "fal":
      return new FalImageProvider();
    case "fal-gpt-image":
      return new FalGptImageProvider();
    case "openai":
      return new OpenAIImageProvider();
    case "mock":
    default:
      return new MockImageProvider();
  }
}

/** Cache one instance per provider name (different sections may use different ones). */
function imageProviderFor(choice: string): ImageProvider {
  const key = choice.toLowerCase();
  let provider = imageProviders.get(key);
  if (!provider) {
    provider = makeImageProvider(key);
    imageProviders.set(key, provider);
  }
  return provider;
}

function imageChoice(): string {
  return (process.env.AI_IMAGE_PROVIDER ?? "mock").toLowerCase();
}

/** Default image provider (generator, etc.). */
export function getImageProvider(): ImageProvider {
  return imageProviderFor(imageChoice());
}

/**
 * Image provider for the "Инфографика" section. Falls back to the global image
 * provider, so setting only AI_INFOGRAPHIC_IMAGE_PROVIDER=openai swaps the model
 * for infographics while the generator keeps using Flux.
 */
function infographicImageChoice(): string {
  return (process.env.AI_INFOGRAPHIC_IMAGE_PROVIDER ?? imageChoice()).toLowerCase();
}

export function getInfographicImageProvider(): ImageProvider {
  return imageProviderFor(infographicImageChoice());
}

/**
 * Провайдер для «Рекламных баннеров». Баннеру нужна та же способность, что и
 * инфографике — печатать кириллицу прямо в картинку, — поэтому по умолчанию он
 * идёт за настройкой инфографики. Отдельная переменная оставлена, чтобы можно
 * было увести баннеры на другую модель, не трогая рабочую инфографику.
 */
function bannerImageChoice(): string {
  return (process.env.AI_BANNER_IMAGE_PROVIDER ?? infographicImageChoice()).toLowerCase();
}

export function getBannerImageProvider(): ImageProvider {
  return imageProviderFor(bannerImageChoice());
}

export function providerStatus() {
  return {
    llm: llmChoice(),
    image: imageChoice(),
    infographicImage: infographicImageChoice(),
    bannerImage: bannerImageChoice(),
  };
}
