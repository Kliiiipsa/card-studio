export type ExportFormat = "png" | "jpg";

export interface ExportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  ratio: string;
}

/** WB-friendly card sizes. 3:4 is the WB standard. */
export const EXPORT_PRESETS: ExportPreset[] = [
  { id: "900x1200", label: "900 × 1200", width: 900, height: 1200, ratio: "3:4" },
  { id: "1200x1600", label: "1200 × 1600", width: 1200, height: 1600, ratio: "3:4" },
  { id: "ratio-3-4", label: "3:4 (1080 × 1440)", width: 1080, height: 1440, ratio: "3:4" },
  { id: "ratio-4-5", label: "4:5 (1080 × 1350)", width: 1080, height: 1350, ratio: "4:5" },
];

/** Aspect ratios offered to the image model. */
export const ASPECT_RATIOS = [
  { id: "3:4", label: "3:4 (маркетплейс)" },
  { id: "4:5", label: "4:5" },
  { id: "1:1", label: "1:1" },
  { id: "9:16", label: "9:16" },
  // «Как у исходного фото» — только для «Обычного фото» с загруженным референсом;
  // на клиенте резолвится в реальные пропорции загруженного изображения.
  { id: "original", label: "Как у исходного фото" },
] as const;

export type AspectRatioId = (typeof ASPECT_RATIOS)[number]["id"];
