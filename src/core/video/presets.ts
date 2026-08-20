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
    description: "Камера плавно приближается к товару, раскрывая фактуру и детали",
    template:
      "Slow, smooth cinematic camera push-in toward {product}, gradually revealing its fine textures and details",
  },
  {
    id: "orbit",
    label: "Облёт камерой",
    description: "Камера медленно облетает товар по дуге, объём и глубина кадра",
    template:
      "Smooth, slow cinematic camera orbit around {product}, sweeping roughly 40 degrees along an arc while keeping it centered and in sharp focus",
  },
  {
    id: "turntable",
    label: "Поворот товара",
    description: "Товар медленно поворачивается на месте, камера неподвижна",
    template:
      "{product} slowly rotates in place as if on a display turntable, revealing its sides; the camera stays perfectly still",
    cameraFixed: true,
  },
  {
    id: "breeze",
    label: "Лёгкое движение",
    description: "Ткань и лёгкие элементы едва колышутся, как от дуновения ветра",
    template:
      "Gentle natural micro-motion: the fabric and light elements of {product} sway softly as if touched by a light breeze, the camera drifts almost imperceptibly",
  },
  {
    id: "showcase",
    label: "Живой фон",
    description: "Товар неподвижен и резок, фон оживает: свет, боке, мягкие тени",
    template:
      "Cinematic parallax shot: {product} stays steady and tack-sharp in the foreground while the background comes alive with softly drifting bokeh light and gently moving shadows",
  },
];

/** страховки, добавляемые к КАЖДОМУ промпту независимо от пресета */
export const VIDEO_GUARDRAILS =
  "The product must remain perfectly intact and unchanged throughout: no morphing, warping, melting or deformation of its shape. " +
  "Any text, logos, labels and packaging details stay crisp, legible and unaltered. " +
  "No people, hands or faces appear unless they are already present in the source photo; no new objects enter the frame. " +
  "Photorealistic, smooth and stable motion, consistent soft studio lighting, premium e-commerce product video look.";

export function getVideoPreset(id: string): VideoPreset | undefined {
  return VIDEO_PRESETS.find((p) => p.id === id);
}

/** длительность фиксированная: цена fal посекундная, 25 ⚡ покрывает ровно 5 с */
export const VIDEO_DURATION_SEC = 5;

export type VideoAspect = "3:4" | "9:16" | "1:1";
export const VIDEO_ASPECTS: { id: VideoAspect; label: string; hint: string }[] = [
  { id: "3:4", label: "3:4", hint: "галерея карточки WB" },
  { id: "9:16", label: "9:16", hint: "видеообложка / Shorts" },
  { id: "1:1", label: "1:1", hint: "квадрат — универсальный" },
];
