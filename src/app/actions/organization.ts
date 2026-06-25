"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb, runAuditedWrite } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { requireServerSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { FieldValue } from "firebase-admin/firestore";

const orgProfileSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  industry: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  website: z.string().url().optional().or(z.literal("")),
  qualityPolicy: z.string().max(5000).optional(),
});

export async function updateOrganizationProfile(
  orgId: string,
  input: z.infer<typeof orgProfileSchema>
) {
  const session = await requireServerSession();

  if (session.orgId !== orgId) {
    throw new Error("FORBIDDEN: cannot modify a different organization.");
  }
  if (!hasPermission(session.role, "org_profile", "update")) {
    throw new Error("FORBIDDEN: role cannot update the organization profile.");
  }

  const parsed = orgProfileSchema.parse(input);
  const orgRef = adminDb.collection("organizations").doc(orgId);
  const snap = await orgRef.get();

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "organization.update",
      module: "org_profile",
      targetId: orgId,
      targetType: "organization",
      oldValue: snap.data() ?? null,
      newValue: parsed,
    },
    (batch) => {
      batch.set(
        orgRef,
        { ...parsed, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
  );

  revalidatePath("/organization");
  return { success: true };
}

const departmentSchema = z.object({
  name: z.string().min(1).max(100),
  headUserId: z.string().nullable().optional(),
});

export async function createDepartment(input: z.infer<typeof departmentSchema>) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "org_profile", "create")) {
    throw new Error("FORBIDDEN: role cannot create departments.");
  }

  const parsed = departmentSchema.parse(input);
  const deptRef = adminDb.collection("departments").doc();

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "department.create",
      module: "org_profile",
      targetId: deptRef.id,
      targetType: "department",
      oldValue: null,
      newValue: parsed,
    },
    (batch) => {
      batch.set(deptRef, {
        orgId: session.orgId,
        name: parsed.name,
        headUserId: parsed.headUserId ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  );

  revalidatePath("/organization");
  return { id: deptRef.id };
}

export async function listDepartments() {
  const session = await requireServerSession();

  const snap = await adminDb
    .collection("departments")
    .where("orgId", "==", session.orgId)
    .orderBy("name", "asc")
    .get();

  return serializeFirestoreData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

const updateDepartmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  headUserId: z.string().nullable().optional(),
});

export async function updateDepartment(input: z.infer<typeof updateDepartmentSchema>) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "org_profile", "update")) {
    throw new Error("FORBIDDEN: role cannot update departments.");
  }

  const parsed = updateDepartmentSchema.parse(input);
  const ref = adminDb.collection("departments").doc(parsed.id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Department not found.");

  const data = snap.data()!;
  if (data.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: department belongs to a different organization.");
  }

  const { id, ...fields } = parsed;
  const updatePayload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) updatePayload[key] = value;
  }

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "department.update",
      module: "org_profile",
      targetId: id,
      targetType: "department",
      oldValue: { name: data.name, headUserId: data.headUserId },
      newValue: updatePayload,
    },
    (batch) => {
      batch.update(ref, updatePayload);
    }
  );

  revalidatePath("/organization");
  return { success: true };
}

/**
 * Deletes a department only if nothing currently references it — per
 * explicit decision, this is a safety check against orphaning data, not
 * a soft-delete/archive mechanism. Checks BOTH documents.departmentId
 * and users.departmentId; a department with either still attached
 * cannot be deleted. This mirrors the same "check before destructive
 * action" posture as seedIsoClauses() in app/actions/clauses.ts
 * refusing to silently overwrite existing data.
 */
export async function deleteDepartment(departmentId: string) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "org_profile", "create")) {
    // Delete is gated on the same permission as create (§2 doesn't
    // distinguish a separate "delete department" capability) — both
    // are Super-Admin-only structural changes to the org.
    throw new Error("FORBIDDEN: role cannot delete departments.");
  }

  const ref = adminDb.collection("departments").doc(departmentId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Department not found.");

  const data = snap.data()!;
  if (data.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: department belongs to a different organization.");
  }

  const [docsSnap, usersSnap] = await Promise.all([
    adminDb
      .collection("documents")
      .where("orgId", "==", session.orgId)
      .where("departmentId", "==", departmentId)
      .limit(1)
      .get(),
    adminDb
      .collection("users")
      .where("orgId", "==", session.orgId)
      .where("departmentId", "==", departmentId)
      .limit(1)
      .get(),
  ]);

  if (!docsSnap.empty) {
    throw new Error(
      "Cannot delete this department — it still has documents assigned to it. " +
        "Reassign or archive those documents first."
    );
  }
  if (!usersSnap.empty) {
    throw new Error(
      "Cannot delete this department — it still has users assigned to it. " +
        "Reassign those users to a different department first."
    );
  }

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "department.delete",
      module: "org_profile",
      targetId: departmentId,
      targetType: "department",
      oldValue: { name: data.name },
      newValue: null,
    },
    (batch) => {
      batch.delete(ref);
    }
  );

  revalidatePath("/organization");
  return { success: true };
}
