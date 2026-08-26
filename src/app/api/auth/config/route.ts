import { ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Публичный конфиг формы регистрации: нужен ли инвайт-код прямо сейчас.
 * Форма читает это на лету и показывает поле «Инвайт-код» только когда сервер
 * его действительно требует — UI не расходится с состоянием сервера, и при
 * повторном закрытии регистрации (возврат env) поле вернётся само, без сборки.
 */
export function GET() {
  return ok({ inviteRequired: Boolean(process.env.REGISTRATION_INVITE_CODE) });
}
