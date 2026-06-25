"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb, adminAuth, runAuditedWrite, setUserRoleClaim } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { requireServerSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { ROLES } from "@/lib/types/core";
import { FieldValue } from "firebase-admin/firestore";

const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: z.enum(ROLES),
  departmentId: z.string().nullable(),
});

/**
 * Creates a Firebase Auth user (with a temporary password the org admin
 * communicates out-of-band — this is a v1 simplification; a production
 * rollout would send an invite email with a password-reset link instead,
 * which needs the email infra deferred to Phase 5 per §7) and the
 * matching Firestore users/{uid} doc.
 *
 * Sets custom claims directly here rather than waiting for the Cloud
 * Function trigger (functions/src/index.ts syncUserRoleClaim) to fire
 * asynchronously — for a brand-new account, the user should be able to
 * log in immediately with correct claims, not race a Firestore trigger.
 */
export async function inviteUser(input: z.infer<typeof inviteUserSchema>) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "users_roles", "create")) {
    throw new Error("FORBIDDEN: role cannot create users.");
  }

  const parsed = inviteUserSchema.parse(input);

  const tempPassword = crypto.randomUUID();
  const userRecord = await adminAuth.createUser({
    email: parsed.email,
    password: tempPassword,
    displayName: parsed.name,
  });

  await adminAuth.setCustomUserClaims(userRecord.uid, {
    role: parsed.role,
    orgId: session.orgId,
    departmentId: parsed.departmentId,
  });

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "user.invite",
      module: "users_roles",
      targetId: userRecord.uid,
      targetType: "user",
      oldValue: null,
      newValue: { email: parsed.email, role: parsed.role },
    },
    (batch) => {
      batch.set(adminDb.collection("users").doc(userRecord.uid), {
        orgId: session.orgId,
        name: parsed.name,
        email: parsed.email,
        role: parsed.role,
        departmentId: parsed.departmentId,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  );

  revalidatePath("/settings/access-control");

  // Temp password is returned ONCE so the inviting admin can hand it to
  // the new user out-of-band. It is never stored or logged anywhere
  // else — not in the audit log above (intentionally excluded from
  // newValue) and not retrievable again after this response.
  return { uid: userRecord.uid, tempPassword };
}

const changeRoleSchema = z.object({
  uid: z.string().min(1),
  role: z.enum(ROLES),
});

/**
 * Changes a user's role. This is the action that exercises the full
 * revocation mechanism end to end:
 *   1. setUserRoleClaim() sets the new claim AND revokes refresh tokens
 *      AND writes tokensValidAfter.
 *   2. The target user's open session(s), via the Firestore listener in
 *      components/providers/auth-provider.tsx, detect the stale token
 *      and force a refresh / sign-out within the latency of a Firestore
 *      snapshot update.
 * See lib/firebase/admin.ts setUserRoleClaim() for the full rationale.
 */
export async function changeUserRole(input: z.infer<typeof changeRoleSchema>) {
  const session = await requireServerSession({ checkRevoked: true });

  if (!hasPermission(session.role, "users_roles", "update")) {
    throw new Error("FORBIDDEN: role cannot change user roles.");
  }

  const parsed = changeRoleSchema.parse(input);

  const targetRef = adminDb.collection("users").doc(parsed.uid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new Error("User not found.");

  const targetData = targetSnap.data()!;
  if (targetData.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: user belongs to a different organization.");
  }

  if (parsed.uid === session.uid && parsed.role !== session.role) {
    // A super_admin demoting themselves is legal in principle, but it
    // immediately revokes their own session mid-request — surfacing a
    // confusing partial-failure UX (the Firestore write succeeds, then
    // their own next request fails auth). Block self-demotion from this
    // action; require a second super_admin to do it instead.
    throw new Error(
      "Cannot change your own role from this action — ask another Super Admin to do it."
    );
  }

  const oldRole = targetData.role;

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "user.role_change",
      module: "users_roles",
      targetId: parsed.uid,
      targetType: "user",
      oldValue: { role: oldRole },
      newValue: { role: parsed.role },
    },
    (batch) => {
      batch.update(targetRef, {
        role: parsed.role,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  );

  // Runs AFTER the audited Firestore write commits. If this throws, the
  // role change is already recorded in Firestore but claims/revocation
  // didn't happen — that's a real gap (see note below), not something
  // this function silently papers over.
  await setUserRoleClaim(parsed.uid, {
    role: parsed.role,
    orgId: session.orgId,
    departmentId: targetData.departmentId ?? null,
  });

  revalidatePath("/settings/access-control");
  return { success: true };
}

/**
 * KNOWN GAP, FLAGGED RATHER THAN HIDDEN: the Firestore write (role +
 * audit log) and the claims/revocation call above are NOT atomic with
 * each other — they're two separate operations (Firestore batch, then
 * an Admin Auth API call). If the process crashes between them, you get
 * a Firestore record saying the role changed but the user's token still
 * carries the old role until the Cloud Function trigger
 * (functions/src/index.ts syncUserRoleClaim) eventually fires on the
 * same Firestore write and reconciles it — which it will, since it
 * listens on the same users/{uid} document this function just wrote to.
 * So the system self-heals within the trigger's normal latency (seconds,
 * not the 1-hour gap this whole mechanism exists to avoid) but does NOT
 * revoke the stale token immediately in that crash scenario. Acceptable
 * for v1; if this needs to be airtight, wrap both in a Cloud Tasks
 * retry queue instead of a bare await.
 */

export async function listOrgUsers() {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "users_roles", "read")) {
    throw new Error("FORBIDDEN: role cannot list users.");
  }

  const snap = await adminDb
    .collection("users")
    .where("orgId", "==", session.orgId)
    .orderBy("name", "asc")
    .get();

  return serializeFirestoreData(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
}
