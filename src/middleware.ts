import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/core/auth/session";

/**
 * Whole-site auth gate on signed session cookies (email accounts). If
 * AUTH_SECRET is unset the gate is disabled (e.g. local dev without env).
 * /login, /register and the auth endpoints stay open; /admin additionally
 * requires the admin role.
 */
export async function middleware(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // Public: the landing page and its example images — visitors must be able to
  // see what the product does before signing up. The studio itself stays gated.
  if (
    pathname === "/" ||
    pathname.startsWith("/examples/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(secret, token);

  if (session) {
    const isAdminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
    if (isAdminArea && session.role !== "admin") {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Только для администратора." }, { status: 403 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // API calls get a clean 401; page requests are redirected to the login screen
  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // run on everything except Next internals and the favicon
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
