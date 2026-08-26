import { fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { safeFetchMedia } from "@/lib/safe-fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin proxy for remote generated images so the export <canvas> isn't
 * tainted by cross-origin sources (which would block toBlob / downloads).
 * Загрузка через safeFetchMedia — с защитой от SSRF (аудит 2026-08-26):
 * приватные адреса и редиректы во внутреннюю сеть заблокированы.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url).searchParams.get("url");
    if (!url) throw new AppError("Некорректная ссылка на изображение.");

    const { buf, contentType } = await safeFetchMedia(url);
    if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
      throw new AppError("Ссылка не является изображением или видео.");
    }
    return new Response(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
