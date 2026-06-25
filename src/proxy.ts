import { NextResponse, type NextRequest } from "next/server";

/**
 * §8 originally specified "middleware.ts — Route protection via custom
 * claims." Next.js 16 renamed this file convention to proxy.ts (same
 * runtime, same export shape — `middleware.ts` is deprecated but still
 * works with a warning). This file is that route-protection layer,
 * just under the name this Next.js version expects.
 *
 * Edge runtime cannot use firebase-admin (it needs Node.js APIs the
 * Edge runtime doesn't have), so this DOES NOT verify the ID token
 * cryptographically — it only checks for the PRESENCE of a session
 * cookie and does a coarse-grained redirect (signed-out users away from
 * the dashboard, signed-in users away from /login).
 *
 * Fine-grained role checks (e.g. "is this role even allowed to see
 * /settings/access-control") happen in two places that DO verify the
 * token properly:
 *   1. Server Components / Server Actions in the (dashboard) route group,
 *      via lib/auth/session.ts (Node.js runtime, can use firebase-admin's
 *      adminAuth.verifyIdToken / verifySessionCookie).
 *   2. Firestore Security Rules, for actual data access.
 *
 * Treat this proxy as a UX convenience (fast redirect, no flash of
 * protected content) — never as the security boundary. The security
 * boundary is firestore.rules + the Server Action checks, full stop.
 */

const PUBLIC_PATHS = ["/login", "/api/auth"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const sessionCookie = request.cookies.get("__session")?.value;

  if (!sessionCookie && !isPublicPath && pathname !== "/") {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (sessionCookie && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
