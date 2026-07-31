import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/core/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  // legacy shared-password cookie from the old gate
  res.cookies.set("wb_gate", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
