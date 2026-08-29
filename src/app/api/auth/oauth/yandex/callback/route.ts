import { NextResponse } from "next/server";
import { yandexExchangeCode, yandexUserInfo } from "@/core/auth/oauth-yandex";
import { upsertOAuthUser } from "@/core/auth/store";
import { normalizeEmail } from "@/core/auth/domains";
import { recordConsent } from "@/core/auth/consent";
import { grantWelcomeBonus } from "@/core/billing/welcome";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/core/auth/session";
import { clientIp } from "@/lib/request-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "yandex_oauth_state";

function fail(req: Request, code = "oauth") {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", code);
  const res = NextResponse.redirect(url);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/** Возврат от Яндекса: проверяем state, меняем code на токен, логиним. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code) return fail(req);

  // CSRF: state из query должен совпасть с тем, что положили в куку на /start
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  if (!state || !cookieState || state !== cookieState) return fail(req);

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return fail(req);

    const token = await yandexExchangeCode(code);
    if (!token) return fail(req);
    const info = await yandexUserInfo(token);
    if (!info?.email) return fail(req);

    const email = normalizeEmail(info.email);
    const { user, isNew } = await upsertOAuthUser(email);

    // Согласие и приветственный бонус — ровно один раз, при первом входе.
    // Согласие даётся действием («Войти с Яндекс ID» с пометкой у кнопки).
    if (isNew) {
      await recordConsent({
        email,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      }).catch(() => undefined);
      await grantWelcomeBonus(email).catch(() => undefined);
    }

    const sessionToken = await createSessionToken(secret, { email: user.email, role: user.role });
    const res = NextResponse.redirect(new URL("/dashboard", req.url));
    res.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch {
    return fail(req);
  }
}
