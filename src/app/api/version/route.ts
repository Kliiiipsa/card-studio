import { promises as fs } from "node:fs";
import path from "node:path";
import { ok } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Версия работающей сборки — для тоста «Kartogen обновился» в открытых
 * вкладках. Next пишет уникальный BUILD_ID при каждой сборке; после деплоя
 * значение меняется, и старые вкладки узнают об обновлении.
 */
let cached: string | null = null;

export async function GET() {
  if (!cached) {
    try {
      cached = (await fs.readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim();
    } catch {
      cached = "dev";
    }
  }
  return ok({ build: cached });
}
