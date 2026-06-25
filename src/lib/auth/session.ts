import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import type { Role } from "@/lib/types/core";

export interface ServerSession {
  uid: string;
  email: string | null;
  role: Role;
  orgId: string;
  departmentId: string | null;
}

/**
 * Verifies the session cookie cryptographically via Admin SDK and returns
 * the decoded claims. This is the function every Server Action and
 * protected Server Component must call before doing anything else.
 *
 * Returns null if there is no valid session — callers decide whether
 * that means "redirect to login" or "throw," depending on context.
 *
 * checkRevoked: true additionally checks the revocation list maintained
 * by Firebase Auth (revokeRefreshTokens in lib/firebase/admin.ts
 * setUserRoleClaim writes to this list). This adds a network round-trip
 * per call, so it is NOT the default — most reads don't need it, since
 * the session cookie itself has a bounded lifetime. Use checkRevoked:
 * true specifically for sensitive mutations (role changes, approvals,
 * settings writes) where you want certainty the caller's role hasn't
 * just been revoked mid-session, on top of the client-side detection in
 * components/providers/auth-provider.tsx (defense in depth — the client
 * mechanism can theoretically be bypassed by a modified client; this
 * server-side check cannot).
 */
export async function getServerSession(
  options: { checkRevoked?: boolean } = {}
): Promise<ServerSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(
      sessionCookie,
      options.checkRevoked ?? false
    );

    const role = decoded.role as Role | undefined;
    const orgId = decoded.orgId as string | undefined;
    if (!role || !orgId) {
      // Token exists but is missing the claims this app depends on —
      // treat as unauthenticated rather than guessing defaults. This
      // happens for a brand-new user whose claims haven't been set yet
      // (see functions/src/index.ts syncUserRoleClaim) or for a token
      // issued before claims were attached.
      return null;
    }

    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      role,
      orgId,
      departmentId: (decoded.departmentId as string | null) ?? null,
    };
  } catch {
    // Expired, malformed, or revoked session cookie.
    return null;
  }
}

/**
 * Convenience wrapper for Server Actions that must reject unauthenticated
 * callers outright rather than handling null themselves.
 */
export async function requireServerSession(
  options: { checkRevoked?: boolean } = {}
): Promise<ServerSession> {
  const session = await getServerSession(options);
  if (!session) {
    throw new Error("UNAUTHENTICATED: no valid session.");
  }
  return session;
}
