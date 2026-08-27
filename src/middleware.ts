import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/core/auth/session";

/**
 * Whole-site auth gate on signed session cookies (email accounts). If
 * AUTH_SECRET is unset the gate is disabled (e.g. local dev without env).
 * /login, /register and the auth endpoints stay open; /admin additionally
 * requires the admin role.
 */
export async function middleware(req: NextRequest) {
  // Canonical domain: the technical *.twc1.net fqdn can't be detached from the
  // Timeweb app, so permanently redirect it (and any other alias) to kartogen.ru.
  // Sessions carry over — the auth cookie is host-scoped, but login works on the
  // canonical host, so users simply continue there.
  const host = req.headers.get("host") ?? "";
  const canonical = process.env.CANONICAL_HOST;
  if (canonical && host && host !== canonical && !host.startsWith("localhost")) {
    const url = req.nextUrl.clone();
    url.host = canonical;
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 301);
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // Public: the landing page and its example images — visitors must be able to
  // see what the product does before signing up. The studio itself stays gated.
  if (
    pathname === "/" ||
    pathname.startsWith("/examples/") ||
    pathname === "/help" || // public «как это работает» — гайд + FAQ для поиска и нейровыдачи
    pathname.startsWith("/help/") || // static help screenshots
    pathname === "/wildberries" || // SEO-посадочная под запросы про карточки WB
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/auth") ||
    // ЮKassa server-to-server notifications carry no session cookie; the
    // route itself trusts nothing from the body (re-fetches the payment)
    pathname === "/api/billing/yookassa/webhook" ||
    // legal documents are public by law
    pathname === "/terms" ||
    pathname === "/offer" ||
    pathname === "/privacy" ||
    pathname === "/pricing" ||
    // crawlers and link-preview bots must reach these without a session
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/llms.txt" ||
    pathname === "/og.jpg" ||
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png"
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
