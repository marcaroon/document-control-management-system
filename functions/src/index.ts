import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();
const auth = getAuth();
const db = getFirestore();

/**
 * §11 handoff note #2: "Set up a Cloud Function ... that sets the custom
 * claim on user creation and on every role change — this is the
 * dependency everything in §4's RBAC enforcement relies on."
 *
 * This trigger fires on ANY write to users/{uid} (create or update). It
 * only acts when `role` is present and differs from the role already
 * baked into the user's current custom claims, so:
 * - It is idempotent — re-running it on an unrelated field update
 *   (e.g. photoUrl) is a no-op once claims already match.
 * - It works whether the role was set via a trusted Server Action
 *   (lib/firebase/admin.ts setUserRoleClaim already does claim-setting
 *   + revocation directly) OR via a direct Firestore write from some
 *   future admin tool that bypasses that helper — this is the backstop,
 *   not the primary path. The primary path remains the Server Action,
 *   per §4 Rule 1.
 *
 * IMPORTANT: this function does NOT call revokeRefreshTokens(). The
 * Server Action path (setUserRoleClaim) already revokes tokens
 * synchronously as part of the role-change request, which is the
 * fast path. If this trigger had to revoke tokens too, you'd get a
 * second wave of forced re-auth slightly later, which is confusing for
 * the end user without adding real security value (the revocation
 * already happened). This trigger exists for claim consistency, not
 * as a second revocation event.
 */
export const syncUserRoleClaim = onDocumentWritten(
  "users/{uid}",
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) return; // user document deleted — nothing to sync

    const { uid } = event.params;
    const newRole = after.role as string | undefined;
    const newOrgId = after.orgId as string | undefined;
    const newDepartmentId = (after.departmentId as string | null) ?? null;
    if (!newRole || !newOrgId) return;

    const userRecord = await auth.getUser(uid);
    const claims = userRecord.customClaims ?? {};

    const inSync =
      claims.role === newRole &&
      claims.orgId === newOrgId &&
      (claims.departmentId ?? null) === newDepartmentId;

    if (inSync) return; // already in sync, avoid redundant writes

    await auth.setCustomUserClaims(uid, {
      role: newRole,
      orgId: newOrgId,
      departmentId: newDepartmentId,
    });
  }
);

/**
 * Callable function so a trusted server action (or, in an emergency, an
 * authenticated admin tool) can force a claim resync + revocation without
 * going through a Firestore write. Mirrors lib/firebase/admin.ts
 * setUserRoleClaim() exactly — kept here too so the same capability exists
 * even if the Next.js server action layer is ever bypassed or unavailable.
 * Requires the CALLER to already hold the super_admin custom claim.
 */
export const forceRoleResync = onCall(async (request) => {
  if (request.auth?.token?.role !== "super_admin") {
    throw new HttpsError(
      "permission-denied",
      "Only super_admin can force a role resync."
    );
  }

  const targetUid = request.data?.uid as string | undefined;
  if (!targetUid) {
    throw new HttpsError("invalid-argument", "uid is required.");
  }

  const userDoc = await db.collection("users").doc(targetUid).get();
  const userData = userDoc.data();
  const role = userData?.role as string | undefined;
  const orgId = userData?.orgId as string | undefined;
  const departmentId = (userData?.departmentId as string | null) ?? null;
  if (!role || !orgId) {
    throw new HttpsError("not-found", "User document, role, or orgId field not found.");
  }

  await auth.setCustomUserClaims(targetUid, { role, orgId, departmentId });
  await auth.revokeRefreshTokens(targetUid);
  await db
    .collection("users")
    .doc(targetUid)
    .set({ tokensValidAfter: Math.floor(Date.now() / 1000) }, { merge: true });

  return { success: true, role, orgId, departmentId };
});
