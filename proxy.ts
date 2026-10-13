import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate only (cookie present?). Pages and actions verify the session for real.
const PUBLIC = ["/login", "/register", "/forgot", "/reset"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const open = PUBLIC.includes(pathname) || pathname.startsWith("/api/");

  let res = NextResponse.next();
  if (!open && !req.cookies.has("xt_session")) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    res = NextResponse.redirect(url);
  }
  // Device id: used to reject referrals signed up from the referrer's own device.
  if (!req.cookies.has("xt_did"))
    res.cookies.set("xt_did", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 2 * 365 * 24 * 3600,
      path: "/",
    });
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
