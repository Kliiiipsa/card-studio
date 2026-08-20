import { fail } from "@/lib/api";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin proxy for remote generated images so the export <canvas> isn't
 * tainted by cross-origin sources (which would block toBlob / downloads).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url).searchParams.get("url");
    if (!url || !/^https?:\/\//.test(url)) {
      throw new AppError("Некорректная ссылка на изображение.");
    }
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new AppError("Не удалось загрузить изображение.", 502);

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
      throw new AppError("Ссылка не является изображением или видео.");
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
