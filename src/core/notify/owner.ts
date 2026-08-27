import "server-only";
import { notifyTelegram } from "./telegram";
import { sendOwnerAlert } from "@/core/auth/mailer";

/**
 * Уведомление владельцу по всем рабочим каналам сразу (best-effort, параллельно).
 *  - Почта — надёжный канал с прода (тот же транспорт, что и коды подтверждения),
 *    транспорт в РФ (Timeweb/NotiSend) → сюда идёт ПОЛНОЕ содержание с email клиента.
 *  - Telegram — пуш на телефон через релей на Vercel (вне РФ). Персональные данные
 *    (email клиента) сюда НЕ кладём: канал трансграничный, а детали и так в письме.
 *    Поэтому у Telegram отдельный, обезличенный текст (`telegramBody`).
 * Никогда не бросает исключений: не отправленное уведомление не роняет сценарий.
 */
export async function notifyOwner(
  subject: string,
  emailBody: string,
  telegramBody?: string,
): Promise<void> {
  const tgText = telegramBody ?? emailBody;
  const full = tgText ? `${subject}\n\n${tgText}` : subject;
  await Promise.allSettled([
    sendOwnerAlert(subject, emailBody || subject),
    notifyTelegram(full),
  ]);
}
