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
// За прокси Timeweb req.url может нести внутренний хост — строим редиректы от
// публичного адреса, иначе браузер уходит «в никуда» и человек видит ошибку.
const SITE_URL = process.env.SITE_URL || "https://kartogen.ru";

function fail(reason: string, code = "oauth") {
  console.error(`[yandex-oauth] fail: ${reason}`);
  const url = new URL("/login", SITE_URL);
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
  const providerError = url.searchParams.get("error");
  if (providerError || !code) return fail(`provider error/no code: ${providerError ?? "no code"}`);

  // CSRF: state из query должен совпасть с тем, что положили в куку на /start
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  if (!state || !cookieState || state !== cookieState) {
    return fail(`state mismatch (query=${Boolean(state)}, cookie=${Boolean(cookieState)})`);
  }

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return fail("AUTH_SECRET missing");

    const token = await yandexExchangeCode(code);
    if (!token) return fail("token exchange failed");
    const info = await yandexUserInfo(token);
    if (!info?.email) return fail("userinfo failed / no email");

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
    const res = NextResponse.redirect(new URL("/dashboard", SITE_URL));
    res.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    return fail(`exception: ${e instanceof Error ? e.message : String(e)}`);
  }
}
