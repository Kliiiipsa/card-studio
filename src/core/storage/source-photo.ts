import { s3Enabled, s3Put } from "./s3";

/**
 * Исходное фото клиента рядом с результатом (решение владельца 2026-09-06):
 * без него в «Генерациях» админки нельзя понять, что модель сделала с фото и
 * откуда жалоба. Ключ sources/<id>.<ext> — тот же id, что у результата, так
 * что при удалении аккаунта уносится вместе с карточкой (см. deletion.ts).
 *
 * Клиент присылает data URL уже без EXIF (режется в браузере до отправки).
 * Никогда не бросает: не сохранился исходник — генерация всё равно идёт.
 */
export async function persistSourcePhoto(
  dataUrl: string | undefined,
  id: string,
): Promise<string | undefined> {
  if (!dataUrl || !s3Enabled()) return undefined;
  const m = /^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/i.exec(dataUrl);
  if (!m) return undefined;
  try {
    const ext = m[2].toLowerCase() === "jpeg" ? "jpg" : m[2].toLowerCase();
    const body = Buffer.from(m[3], "base64");
    return await s3Put(`sources/${id}.${ext}`, body, m[1]);
  } catch (e) {
    console.error("[source-photo] S3 put failed:", e);
    return undefined;
  }
}
