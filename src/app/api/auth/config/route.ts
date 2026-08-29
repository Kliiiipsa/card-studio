import { ok } from "@/lib/api";
import { yandexConfigured } from "@/core/auth/oauth-yandex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Публичный конфиг формы регистрации: нужен ли инвайт-код прямо сейчас.
 * Форма читает это на лету и показывает поле «Инвайт-код» только когда сервер
 * его действительно требует — UI не расходится с состоянием сервера, и при
 * повторном закрытии регистрации (возврат env) поле вернётся само, без сборки.
 */
export function GET() {
  return ok({
    inviteRequired: Boolean(process.env.REGISTRATION_INVITE_CODE),
    // Кнопка показывается только при явном флаге YANDEX_OAUTH_VISIBLE=true.
    // Так можно чинить поток (роуты гейтятся отдельно, по наличию ключей),
    // не показывая клиентам сырую кнопку.
    yandexOauth: yandexConfigured() && process.env.YANDEX_OAUTH_VISIBLE === "true",
  });
}
