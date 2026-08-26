import "server-only";
import { notifyTelegram } from "./telegram";
import { sendOwnerAlert } from "@/core/auth/mailer";

/**
 * Уведомление владельцу по всем рабочим каналам сразу (best-effort, параллельно).
 *  - Почта — надёжный канал с прода (тот же транспорт, что и коды подтверждения).
 *  - Telegram — пуш на телефон (релей через GitHub, если настроен, иначе напрямую).
 * Никогда не бросает исключений: не отправленное уведомление не роняет сценарий.
 */
export async function notifyOwner(subject: string, body: string): Promise<void> {
  const full = body ? `${subject}\n\n${body}` : subject;
  await Promise.allSettled([
    sendOwnerAlert(subject, body || subject),
    notifyTelegram(full),
  ]);
}
