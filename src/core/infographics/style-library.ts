import type { StyleProfile } from "./types";

/** A library entry = a ready style profile + a gradient preview for the picker. */
export type StyleLibraryItem = StyleProfile & {
  description: string;
  preview: { from: string; to: string; accent: string };
  /** реальный пример-результат в этом стиле (из наших генераций в public/examples) */
  example?: string;
};

/**
 * Built-in reference styles. These act as ready references the user can apply
 * without uploading anything — each captures a distinct marketplace visual
 * language (composition rhythm, palette, card treatment).
 */
export const STYLE_LIBRARY: StyleLibraryItem[] = [
  {
    id: "marketplace-clean",
    name: "Чистый маркетплейс",
    source: "library",
    description: "Светлый фон, читаемые карточки, чёткая структура",
    visualLanguage: "clean modern marketplace look, tidy product-first composition",
    background: "soft light neutral background, subtle gradient",
    lighting: "bright even studio light",
    mode: "light",
    palette: {
      background: "#f4f5f7",
      surface: "rgba(255,255,255,0.9)",
      textPrimary: "#14181f",
      textSecondary: "#566072",
      accent: "#2563eb",
    },
    cardStyle: "marketplace-clean",
    density: "medium",
    radius: 20,
    headlinePosition: "top",
    accentElements: ["clean accent line", "consistent benefit cards"],
    preview: { from: "#eef2f7", to: "#dde5f0", accent: "#2563eb" },
    example: "/examples/shirt.jpg",
  },
  {
    id: "premium-dark",
    name: "Премиум тёмный",
    source: "library",
    description: "Графитовый фон, дорогой минимализм, тонкие акценты",
    visualLanguage: "premium dark editorial look, expensive minimalism, refined",
    background: "deep graphite gradient background, subtle luxury texture",
    lighting: "dramatic soft studio light, controlled highlights",
    mode: "dark",
    palette: {
      background: "#0e1116",
      surface: "rgba(20,24,32,0.5)",
      textPrimary: "#ffffff",
      textSecondary: "rgba(255,255,255,0.78)",
      accent: "#c9a35c",
    },
    cardStyle: "premium-editorial",
    density: "low",
    radius: 18,
    headlinePosition: "top",
    accentElements: ["thin gold accent line", "lots of negative space"],
    preview: { from: "#1b2030", to: "#0c0f15", accent: "#c9a35c" },
    example: "/examples/coat.jpg",
  },
  {
    id: "bright-accent",
    name: "Яркий акцент",
    source: "library",
    description: "Светлый фон, сочный акцент, заметные плашки",
    visualLanguage: "bold vivid commercial look, energetic and confident",
    background: "clean bright background with a vivid accent zone",
    lighting: "punchy directional light",
    mode: "light",
    palette: {
      background: "#fff7f3",
      surface: "rgba(255,255,255,0.92)",
      textPrimary: "#1a1410",
      textSecondary: "#6b5a50",
      accent: "#e1483b",
    },
    cardStyle: "marketplace-clean",
    density: "high",
    radius: 24,
    headlinePosition: "top",
    accentElements: ["vivid accent chips", "strong contrast"],
    preview: { from: "#fff1ea", to: "#ffd9cc", accent: "#e1483b" },
    example: "/examples/sneakers.jpg",
  },
  {
    id: "soft-lifestyle",
    name: "Мягкий лайфстайл",
    source: "library",
    description: "Нежная палитра, мягкие карточки, спокойный ритм",
    visualLanguage: "soft lifestyle aesthetic, gentle and aspirational",
    background: "soft warm pastel neutral background",
    lighting: "soft natural diffused light",
    mode: "light",
    palette: {
      background: "#f6f1ee",
      surface: "rgba(255,255,255,0.8)",
      textPrimary: "#23201d",
      textSecondary: "#6d635c",
      accent: "#bd7e8e",
    },
    cardStyle: "integrated-soft",
    density: "medium",
    radius: 26,
    headlinePosition: "bottom",
    accentElements: ["soft rounded cards", "calm rhythm"],
    preview: { from: "#f3ece8", to: "#e7d8d4", accent: "#bd7e8e" },
    example: "/examples/dress.jpg",
  },
  // Насыщенные «выпрыгивающие из ленты» стили — ответ на бежевый перекос
  // первой четвёрки: в белой выдаче WB такие карточки заметнее.
  {
    id: "vivid-pop",
    name: "Поп-арт",
    source: "library",
    description: "Фуксия и жёлтый, смелые цветовые блоки, энергия промо",
    visualLanguage:
      "loud pop-promo poster, fearless color blocking, playful confident retail energy",
    background: "saturated fuchsia-magenta background with bold yellow color blocks and playful geometric accents",
    lighting: "bright punchy even light, crisp saturated colors",
    mode: "light",
    palette: {
      background: "#e5197f",
      surface: "rgba(255,210,31,0.95)",
      textPrimary: "#1c0f14",
      textSecondary: "#4a2338",
      accent: "#ffd21f",
    },
    cardStyle: "marketplace-clean",
    density: "high",
    radius: 14,
    headlinePosition: "top",
    accentElements: ["yellow headline blocks", "bold zigzag and spark doodles"],
    preview: { from: "#e5197f", to: "#ff5aa8", accent: "#ffd21f" },
    example: "/examples/hoodie.jpg",
  },
  {
    id: "turquoise-fresh",
    name: "Бирюзовый фреш",
    source: "library",
    description: "Сочная бирюза, крупный дружелюбный леттеринг, лёгкость",
    visualLanguage:
      "fresh airy promo look, big friendly rounded lettering, light joyful mood",
    background: "vivid turquoise-teal background with soft clouds of light and delicate floating accents",
    lighting: "bright fresh daylight, gentle glow",
    mode: "light",
    palette: {
      background: "#1fc4bd",
      surface: "rgba(255,255,255,0.94)",
      textPrimary: "#073d3a",
      textSecondary: "#2b6e6b",
      accent: "#ffffff",
    },
    cardStyle: "marketplace-clean",
    density: "medium",
    radius: 24,
    headlinePosition: "top",
    accentElements: ["large friendly white headline", "small floating nature details"],
    preview: { from: "#22cfc7", to: "#0fa39d", accent: "#ffffff" },
    example: "/examples/humidifier.jpg",
  },
  {
    id: "sunny-promo",
    name: "Солнечный промо",
    source: "library",
    description: "Жёлтый заголовок-плакат, контрастные плашки с цифрами",
    visualLanguage:
      "high-impact summer promo poster, huge condensed headline, catalogue-style spec chips",
    background: "bright sunny background with bold yellow poster zones and clean sky-blue air",
    lighting: "sunny high-key light, strong cheerful contrast",
    mode: "light",
    palette: {
      background: "#7ec8f0",
      surface: "rgba(255,255,255,0.95)",
      textPrimary: "#123047",
      textSecondary: "#3c6a8a",
      accent: "#ffd21f",
    },
    cardStyle: "marketplace-clean",
    density: "high",
    radius: 16,
    headlinePosition: "top",
    accentElements: ["huge yellow condensed headline", "neat spec chips with icons"],
    preview: { from: "#8fd2f5", to: "#ffd21f", accent: "#1c4b6e" },
    example: "/examples/suitcase.jpg",
  },
  {
    id: "scene-story",
    name: "Сцена-история",
    source: "library",
    description: "Товар в живой среде — песок, дерево, природа; кинематографично",
    visualLanguage:
      "cinematic environmental product story, editorial poster headline over a real scene",
    background:
      "real-world environment matched to the product — warm sand, wood, stone or greenery — with cinematic depth and atmosphere",
    lighting: "warm golden natural light, cinematic depth of field",
    mode: "dark",
    palette: {
      background: "#c98a4b",
      surface: "rgba(30,22,14,0.4)",
      textPrimary: "#ffe9a8",
      textSecondary: "#fff4d6",
      accent: "#ffcc33",
    },
    cardStyle: "integrated-soft",
    density: "low",
    radius: 18,
    headlinePosition: "top",
    accentElements: ["huge warm poster headline", "sun-washed texture, natural props"],
    preview: { from: "#d99b5c", to: "#8a5a28", accent: "#ffcc33" },
    example: "/examples/turka.jpg",
  },
];

export function getLibraryStyle(id: string): StyleProfile | null {
  const item = STYLE_LIBRARY.find((s) => s.id === id);
  if (!item) return null;
  // strip preview/description -> plain StyleProfile
  const { preview, description, example, ...profile } = item;
  void preview;
  void description;
  void example;
  return profile;
}

export const DEFAULT_STYLE_PROFILE: StyleProfile = getLibraryStyle("marketplace-clean")!;
