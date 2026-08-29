/**
 * Вход через Яндекс ID (OAuth 2.0). Мы запрашиваем минимум: email + имя
 * (см. регистрацию приложения в oauth.yandex.ru). Секрет живёт только в env.
 *
 * Поток: /start → редирект на authorize → пользователь подтверждает у Яндекса
 * → возврат на /callback с code → обмен code на access_token → /info отдаёт
 * email и имя → создаём/находим аккаунт и выдаём сессию.
 */
const AUTHORIZE = "https://oauth.yandex.ru/authorize";
const TOKEN = "https://oauth.yandex.ru/token";
const INFO = "https://login.yandex.ru/info?format=json";

const SITE_URL = process.env.SITE_URL || "https://kartogen.ru";
/** ДОЛЖЕН совпадать символ в символ с Redirect URI в кабинете Яндекса. */
export const YANDEX_REDIRECT_URI = `${SITE_URL}/api/auth/oauth/yandex/callback`;

export function yandexConfigured(): boolean {
  return Boolean(process.env.YANDEX_OAUTH_CLIENT_ID && process.env.YANDEX_OAUTH_CLIENT_SECRET);
}

export function yandexAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.YANDEX_OAUTH_CLIENT_ID ?? "",
    redirect_uri: YANDEX_REDIRECT_URI,
    state,
    force_confirm: "yes",
  });
  return `${AUTHORIZE}?${p.toString()}`;
}

/** Обмен authorization code на access token. */
export async function yandexExchangeCode(code: string): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.YANDEX_OAUTH_CLIENT_ID ?? "",
    client_secret: process.env.YANDEX_OAUTH_CLIENT_SECRET ?? "",
    redirect_uri: YANDEX_REDIRECT_URI,
  });
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { access_token?: string } | null;
  return data?.access_token ?? null;
}

/** Данные пользователя по access token: email (ключ аккаунта) + имя. */
export async function yandexUserInfo(
  token: string,
): Promise<{ email: string; name: string } | null> {
  const res = await fetch(INFO, { headers: { Authorization: `OAuth ${token}` } });
  if (!res.ok) return null;
  const d = (await res.json().catch(() => null)) as {
    default_email?: string;
    emails?: string[];
    login?: string;
    display_name?: string;
    real_name?: string;
    first_name?: string;
  } | null;
  if (!d) return null;
  const email = d.default_email || d.emails?.[0] || (d.login ? `${d.login}@yandex.ru` : "");
  if (!email) return null;
  const name = d.display_name || d.real_name || d.first_name || "";
  return { email, name };
}
