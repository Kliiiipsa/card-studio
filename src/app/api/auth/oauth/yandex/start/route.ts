import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { yandexConfigured, yandexAuthorizeUrl } from "@/core/auth/oauth-yandex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "yandex_oauth_state";

/** Старт входа через Яндекс: ставим CSRF-state в куку и уводим на Яндекс. */
const SITE_URL = process.env.SITE_URL || "https://kartogen.ru";

export function GET(req: Request) {
  void req;
  if (!yandexConfigured()) {
    return NextResponse.redirect(new URL("/login?error=oauth_off", SITE_URL));
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
