/**
 * Пресеты движения для «Видео товара». Pure module — безопасен и для клиента
 * (русские карточки в UI), и для сервера (английские шаблоны промптов).
 *
 * Пользователь НИКОГДА не пишет промпт сам и не видит английский текст: он
 * выбирает пресет на русском, а сервер собирает промпт из `template`
 * (плейсхолдер {product} заменяется коротким английским описанием товара)
 * плюс общие страховки VIDEO_GUARDRAILS. Отлаженный шаблон + фото — самый
 * надёжный путь к стабильному результату у image-to-video моделей.
 */
export type VideoPreset = {
  id: string;
  /** название карточки в UI */
  label: string;
  /** русское описание того, что будет происходить в ролике */
  description: string;
  /** английский шаблон движения; {product} заменяется описанием товара */
  template: string;
  /** зафиксировать камеру (движется только товар/сцена) */
  cameraFixed?: boolean;
};

export const VIDEO_PRESETS: VideoPreset[] = [
  {
    id: "push-in",
    label: "Медленный наезд",
    description: "Камера едва заметно приближается к товару — мягкий кинематографичный кадр",
    template:
      "Very gentle, subtle cinematic camera push-in toward {product}, moving only slightly closer over the whole clip",
  },
  {
    id: "orbit",
    label: "Облёт камерой",
    description: "Камера медленно смещается по небольшой дуге, добавляя объём кадру",
    template:
      "Smooth, slow camera drift along a small arc around {product}, only a slight angle change, keeping it centered and in sharp focus",
  },
  {
    id: "turntable",
    label: "Поворот товара",
    description: "Товар медленно поворачивается на месте, камера неподвижна",
    template:
      "{product} slowly turns a small angle in place as if on a display turntable; the camera stays perfectly still",
    cameraFixed: true,
  },
  {
    id: "breeze",
    label: "Лёгкое движение",
    description: "Ткань и лёгкие элементы едва колышутся, как от дуновения ветра",
    template:
      "Gentle natural micro-motion: the soft parts of {product} sway very slightly as if touched by a light breeze; the camera stays still",
    cameraFixed: true,
  },
  {
    id: "showcase",
    label: "Живой фон",
    description: "Товар неподвижен и резок, фон оживает: свет, боке, мягкие тени",
    template:
      "{product} stays completely steady and tack-sharp in the foreground while only the background gains subtle life — softly drifting light and gently moving shadows; the camera stays still",
    cameraFixed: true,
  },
];

/**
 * Страховки, добавляемые к КАЖДОМУ промпту. ВАЖНО (урок боевого теста
 * 2026-08-20): у i2v-моделей нет негативного промпта, и «запрещающие» фразы
 * работают как приглашение — «text, logos stay unaltered» ДОРИСОВАЛО логотип
 * на однотонных шортах. Поэтому формулируем только ПОЗИТИВНО, через жёсткую
 * привязку каждого кадра к исходному фото, не называя нежелательные понятия.
 */
export const VIDEO_GUARDRAILS =
  "Every element of the scene keeps the exact appearance it has in the source image for the entire clip: " +
  "identical colors, identical materials, identical surfaces, identical shapes. " +
  "Every surface stays exactly as plain or as detailed as it is in the source image — nothing is added to any surface, nothing new appears anywhere in the frame, nothing changes form. " +
  "The motion described above is the ONLY change between frames. " +
  "Photorealistic, smooth, stable and slow motion; calm, consistent studio lighting; clean noise-free footage.";

export function getVideoPreset(id: string): VideoPreset | undefined {
  return VIDEO_PRESETS.find((p) => p.id === id);
}

/** длительность фиксированная: цена fal посекундная, тариф покрывает ровно 5 с */
export const VIDEO_DURATION_SEC = 5;

export type VideoAspect = "3:4" | "9:16" | "1:1";
export const VIDEO_ASPECTS: { id: VideoAspect; label: string; hint: string }[] = [
  { id: "3:4", label: "3:4", hint: "галерея карточки WB" },
  { id: "9:16", label: "9:16", hint: "видеообложка / Shorts" },
  { id: "1:1", label: "1:1", hint: "квадрат — универсальный" },
];
