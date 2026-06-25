"use client";

import * as React from "react";
import { onAuthStateChanged, onIdTokenChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import type { Role } from "@/lib/types/core";

/**
 * Closes the token-freshness gap described in lib/firebase/admin.ts
 * setUserRoleClaim(). Firebase ID tokens are valid for up to 1 hour after
 * issuance and don't auto-refresh just because a custom claim changed
 * server-side — a naive implementation would let a demoted user keep
 * their old permissions until their token happens to expire.
 *
 * Mechanism:
 * 1. setUserRoleClaim() (admin.ts) writes `tokensValidAfter` (unix seconds)
 *    to users/{uid} AND calls revokeRefreshTokens() every time a role
 *    changes.
 * 2. This provider keeps a live Firestore listener on users/{uid}.
 *    Whenever tokensValidAfter changes, it compares it against the
 *    CURRENT ID token's issued-at time (`auth_time` claim).
 * 3. If the token was issued before the revocation, it is stale by
 *    definition (revokeRefreshTokens does not invalidate the current
 *    short-lived ID token, only future refreshes) — so this provider
 *    force-refreshes the ID token immediately via getIdTokenResult(true).
 *    If the refresh itself fails (because the refresh token was revoked
 *    server-side), Firebase Auth signs the user out automatically; this
 *    provider also explicitly calls signOut() as a backstop and redirects
 *    to /login with a message, so the experience is "you've been signed
 *    out because your role changed" rather than a silent failure.
 *
 * This is a genuine push-style mechanism (Firestore's onSnapshot is
 * real-time), not a polling loop on a timer — staleness is detected
 * within the latency of a Firestore listener update, typically well
 * under a second while the app is open.
 */

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  orgId: string | null;
  departmentId: string | null;
  loading: boolean;
}

const AuthContext = React.createContext<AuthContextValue>({
  user: null,
  role: null,
  orgId: null,
  departmentId: null,
  loading: true,
});

export function useAuth() {
  return React.useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [role, setRole] = React.useState<Role | null>(null);
  const [orgId, setOrgId] = React.useState<string | null>(null);
  const [departmentId, setDepartmentId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Track auth state + token claims.
  React.useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult();
        setRole((tokenResult.claims.role as Role) ?? null);
      } else {
        // Signed out: clear every derived field here, in the one place
        // that already branches on "no user," rather than scattering a
        // second reset across the org/department effect below.
        setRole(null);
        setOrgId(null);
        setDepartmentId(null);
      }
      setLoading(false);
    });

    const unsubToken = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult();
        setRole((tokenResult.claims.role as Role) ?? null);
      }
    });

    return () => {
      unsubAuth();
      unsubToken();
    };
  }, []);

  // Live listener on users/{uid} for orgId/departmentId AND the
  // revocation-detection mechanism described above. Only subscribes
  // when a user is present; the null-user reset is handled by the
  // auth-state effect above, not here.
  React.useEffect(() => {
    if (!user) {
      return;
    }

    const unsub = onSnapshot(doc(db, "users", user.uid), async (snap) => {
      const data = snap.data();
      if (!data) return;

      setOrgId(data.orgId ?? null);
      setDepartmentId(data.departmentId ?? null);

      const tokensValidAfter: number | undefined = data.tokensValidAfter;
      if (!tokensValidAfter) return;

      const tokenResult = await user.getIdTokenResult();
      const tokenIssuedAtSeconds = Math.floor(
        new Date(tokenResult.issuedAtTime).getTime() / 1000
      );

      if (tokenIssuedAtSeconds < tokensValidAfter) {
        // Stale token holding a revoked/outdated role. Force a refresh —
        // if the refresh token itself was revoked, this throws and
        // Firebase Auth will already be tearing the session down; the
        // explicit signOut + redirect below is the backstop so the user
        // sees a clear reason rather than a generic error.
        try {
          await user.getIdToken(true);
        } catch {
          await signOut(auth);
          if (typeof window !== "undefined") {
            window.location.href = "/login?reason=role_changed";
          }
        }
      }
    });

    return () => unsub();
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, role, orgId, departmentId, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
