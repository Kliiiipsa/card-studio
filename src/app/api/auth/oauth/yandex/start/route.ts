import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { yandexConfigured, yandexAuthorizeUrl } from "@/core/auth/oauth-yandex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "yandex_oauth_state";

/** Старт входа через Яндекс: ставим CSRF-state в куку и уводим на Яндекс. */
export function GET(req: Request) {
  if (!yandexConfigured()) {
    return NextResponse.redirect(new URL("/login?error=oauth_off", req.url));
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(yandexAuthorizeUrl(state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 минут на прохождение авторизации
  });
  return res;
}
