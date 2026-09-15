/**
 * Ссылка на картинку → data URI, если ссылка ведёт в наше хранилище S3.
 *
 * Зачем: fal скачивает входные картинки со своих серверов в США, и до
 * twcstorage.ru иногда не дотягивается («Failed to download the file»,
 * 3 отказа за три недели, все на cards/*.jpg из потока «Фото товара →
 * Инфографика»). Наш сервер стоит в том же ДЦ, что и S3, и качает файл за
 * миллисекунды — отдаём модели байты, как при загрузке с устройства.
 *
 * Чужие адреса (fal.media и т. п.) не трогаем: их fal читает сам. При любой
 * ошибке возвращаем исходную ссылку — хуже, чем было, не станет.
 */

const MAX_BYTES = 12 * 1024 * 1024;

function isOurS3(url: string): boolean {
  const endpoint = process.env.S3_ENDPOINT ?? "";
  try {
    const host = new URL(url).host;
    return host.endsWith("twcstorage.ru") || (endpoint !== "" && host === new URL(endpoint).host);
  } catch {
    return false;
  }
}

export async function inlineRemoteImage(src: string): Promise<string> {
  if (!/^https?:\/\//i.test(src) || !isOurS3(src)) return src;
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) return src;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(type)) return src;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return src;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch (e) {
    console.error("[inline-image] fetch failed, passing URL through:", src.slice(-60), e);
    return src;
  }
}
