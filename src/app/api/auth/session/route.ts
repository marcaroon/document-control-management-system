import "server-only";
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";

/**
 * Exchanges a short-lived Firebase ID token (from client-side
 * signInWithEmailAndPassword, etc.) for a long-lived HttpOnly session
 * cookie. This is the standard Firebase Auth + Next.js pattern: the
 * client SDK handles the actual sign-in UI/flow, then hands the
 * resulting ID token to this route, which verifies it and mints a
 * cookie middleware.ts can check WITHOUT needing client JS to run.
 *
 * The cookie is HttpOnly (not readable by client JS) and Secure in
 * production — this is deliberately NOT the same as the client SDK's own
 * IndexedDB-based session, which is what components/providers/
 * auth-provider.tsx uses for real-time claim/role updates in the UI.
 * The two coexist: cookie for server-side route protection, client SDK
 * session for live UI state.
 */
const SESSION_DURATION_MS = 60 * 60 * 24 * 5 * 1000; // 5 days, Firebase's max for session cookies

export async function POST(request: Request) {
  const { idToken } = await request.json();

  if (!idToken || typeof idToken !== "string") {
    return NextResponse.json({ error: "idToken is required" }, { status: 400 });
  }

  try {
    // Verify before minting — refuses to create a session cookie for a
    // token that's already invalid/expired/tampered.
    await adminAuth.verifyIdToken(idToken);

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS,
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set("__session", sessionCookie, {
      maxAge: SESSION_DURATION_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Failed to create session cookie:", error);
    return NextResponse.json({ error: "Invalid ID token" }, { status: 401 });
  }
}
