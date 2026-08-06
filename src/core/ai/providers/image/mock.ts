import type { ImageProvider, T2IRequest, I2IRequest, ImageResult, GeneratedImage } from "../types";

/**
 * Offline image stand-in. Generates a deterministic premium-looking SVG mock
 * "card" so the full generation flow (preview, history, export) works before
 * the fal.ai token is added. Swap via AI_IMAGE_PROVIDER=fal.
 */
export class MockImageProvider implements ImageProvider {
  readonly id = "mock";

  async textToImage(req: T2IRequest): Promise<ImageResult> {
    await delay(900);
    return this.build(req, "T2I");
  }

  async imageToImage(req: I2IRequest): Promise<ImageResult> {
    await delay(1100);
    return this.build(req, "I2I");
  }

  private build(req: T2IRequest, tag: string): ImageResult {
    const count = req.count ?? 2;
    const [w, h] = ratioToSize(req.aspectRatio ?? "3:4");
    const images: GeneratedImage[] = Array.from({ length: count }, (_, i) => ({
      url: svgDataUrl(req.prompt, tag, i, w, h),
      width: w,
      height: h,
    }));
    return { images, provider: this.id };
  }
}

function ratioToSize(ratio: string): [number, number] {
  switch (ratio) {
    case "4:5":
      return [864, 1080];
    case "1:1":
      return [1024, 1024];
    case "9:16":
      return [720, 1280];
    case "3:4":
    default:
      return [900, 1200];
  }
}

const PALETTES = [
  ["#6d28d9", "#4f46e5", "#0ea5e9"],
  ["#0f172a", "#1e293b", "#6366f1"],
  ["#111827", "#374151", "#10b981"],
  ["#3730a3", "#6d28d9", "#db2777"],
];

function svgDataUrl(prompt: string, tag: string, i: number, w: number, h: number): string {
  const pal = PALETTES[i % PALETTES.length];
  const label = escapeXml(prompt.slice(0, 64));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${pal[0]}"/>
      <stop offset="0.55" stop-color="${pal[1]}"/>
      <stop offset="1" stop-color="${pal[2]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <rect x="${w * 0.28}" y="${h * 0.26}" width="${w * 0.44}" height="${w * 0.44}" rx="${w * 0.06}" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>
  <text x="${w * 0.5}" y="${h * 0.5}" font-family="Segoe UI, Arial, sans-serif" font-size="${w * 0.05}" fill="#ffffff" fill-opacity="0.85" text-anchor="middle">PREVIEW</text>
  <text x="${w * 0.08}" y="${h * 0.12}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="${w * 0.045}" fill="#ffffff">Kartogen</text>
  <text x="${w * 0.08}" y="${h * 0.9}" font-family="Segoe UI, Arial, sans-serif" font-size="${w * 0.026}" fill="#ffffff" fill-opacity="0.8">${tag} mock · ${label}</text>
</svg>`;
  const encoded = Buffer.from(svg, "utf-8").toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
