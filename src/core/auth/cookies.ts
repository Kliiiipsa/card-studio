import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "./session";
import type { UserRecord } from "./store";

/** JSON response with a fresh signed session cookie for the given user. */
export async function respondWithSession<T extends object>(
  body: T,
  user: UserRecord,
): Promise<NextResponse> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new AppError("Доступ не настроен: AUTH_SECRET не задан.", 500);
  const token = await createSessionToken(secret, { email: user.email, role: user.role });
  const res = NextResponse.json(body);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
