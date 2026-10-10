import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken } from "./lib/auth";

// Password gate for the dashboard. Webhooks and /api/health stay public (they verify their own secrets).
// With DASHBOARD_PASSWORD unset (mock mode) the dashboard is open, for local dev only.

export async function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await authToken(password))) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api/vaani|api/calcom|api/health|api/talk|talk|login|_next|favicon.ico|icon\.svg|apple-icon|.*\.(?:svg|png|ico|jpg|webp)$).*)"],
};
