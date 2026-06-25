"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb, runAuditedWrite } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { requireServerSession } from "@/lib/auth/session";
import { hasPermission, canReadDocument } from "@/lib/rbac/permissions";
import { DOCUMENT_TYPES } from "@/lib/types/core";
import { validateDocumentNumber } from "@/lib/numbering/template";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Phase 1 scope per §9: "Document CRUD (no workflow) with Storage upload."
 * No status transitions here — that's Phase 2 (app/actions/approvals.ts).
 * Every document created in Phase 1 starts and stays in "draft" until
 * Phase 2's workflow exists.
 *
 * EVERY mutation in this file follows the same shape:
 *   1. requireServerSession() — who is calling, and from which org
 *   2. hasPermission() — is this role even allowed to attempt this
 *   3. (for single-doc operations) canReadDocument() / ownership checks —
 *      the row-level SCOPE CHECK that hasPermission() does NOT cover
 *      (see the big comment block in lib/rbac/permissions.ts)
 *   4. runAuditedWrite() — the mutation and its audit_logs row commit
 *      atomically or not at all (§4 Rule 3)
 * Do not add a new mutation to this file that skips any of these four
 * steps "just this once" — that's exactly how risk #1 and #4 from the
 * register stop being theoretical.
 */

const createDocumentSchema = z.object({
  documentNumber: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(DOCUMENT_TYPES),
  departmentId: z.string().min(1),
  processOwnerId: z.string().min(1),
  clauseIds: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export async function createDocument(input: CreateDocumentInput) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "documents", "create")) {
    throw new Error("FORBIDDEN: role cannot create documents.");
  }

  const parsed = createDocumentSchema.parse(input);

  // Document number uniqueness within the org — Firestore has no native
  // unique constraint (this is exactly the "no FK constraints" integrity
  // gap §1 calls out), so we check explicitly before writing. This is a
  // read-then-write race in theory (two controllers submitting the same
  // number in the same instant); acceptable for v1 given document
  // numbers are typically assigned from a controlled numbering template
  // (§7 Settings: numberingTemplates), not typed freely — revisit with a
  // transaction + a dedicated "reserved numbers" collection if collisions
  // ever actually occur in practice.
  const existing = await adminDb
    .collection("documents")
    .where("orgId", "==", session.orgId)
    .where("documentNumber", "==", parsed.documentNumber)
    .limit(1)
    .get();

  if (!existing.empty) {
    throw new Error(
      `Document number "${parsed.documentNumber}" already exists in this organization.`
    );
  }

  // Phase 3: numbering template format validation, per explicit decision
  // ("manual input, template only for format validation" — not
  // auto-generation). Looks up settings/{orgId}.numberingTemplates[type]
  // and checks the manually-typed documentNumber against it. If no
  // template is configured for this type, validateDocumentNumber()
  // passes through — numbering enforcement is opt-in per type, set up
  // from the Settings page (app/(dashboard)/settings/numbering), not a
  // hard requirement that blocks document creation before an org has
  // configured anything.
  const settingsSnap = await adminDb.collection("settings").doc(session.orgId).get();
  const numberingTemplates = (settingsSnap.data()?.numberingTemplates ?? {}) as Record<
    string,
    string
  >;
  const numberCheck = validateDocumentNumber(
    parsed.documentNumber,
    numberingTemplates[parsed.type]
  );
  if (!numberCheck.valid) {
    throw new Error(numberCheck.reason);
  }

  const docRef = adminDb.collection("documents").doc();

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "document.create",
      module: "documents",
      targetId: docRef.id,
      targetType: "document",
      oldValue: null,
      newValue: { documentNumber: parsed.documentNumber, title: parsed.title },
    },
    (batch) => {
      batch.set(docRef, {
        orgId: session.orgId,
        documentNumber: parsed.documentNumber,
        title: parsed.title,
        description: parsed.description ?? "",
        type: parsed.type,
        clauseIds: parsed.clauseIds,
        departmentId: parsed.departmentId,
        processOwnerId: parsed.processOwnerId,
        currentRevisionNumber: 0,
        currentFileUrl: "",
        currentVersionId: "",
        status: "draft",
        effectiveDate: null,
        reviewDate: null,
        keywords: parsed.keywords,
        isArchived: false,
        createdBy: session.uid,
        updatedBy: session.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  );

  revalidatePath("/documents");
  return { id: docRef.id };
}

const updateDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  clauseIds: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  processOwnerId: z.string().min(1).optional(),
});

export async function updateDocumentMetadata(
  input: z.infer<typeof updateDocumentSchema>
) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "documents", "update")) {
    throw new Error("FORBIDDEN: role cannot update documents.");
  }

  const parsed = updateDocumentSchema.parse(input);
  const docRef = adminDb.collection("documents").doc(parsed.id);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new Error("Document not found.");
  }

  const data = snap.data()!;
  if (data.orgId !== session.orgId) {
    // Belt-and-suspenders: Security Rules already block this for client
    // writes, and this is a server action using the Admin SDK (which
    // bypasses rules) — so this explicit check is the ONLY thing
    // standing between a bug elsewhere in this function and a
    // cross-tenant write. Never remove this check on the assumption
    // "rules already cover it" — for Admin SDK code paths, they don't.
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }

  const { id, ...fields } = parsed;
  const updatePayload: Record<string, unknown> = { updatedBy: session.uid };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) updatePayload[key] = value;
  }

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "document.update",
      module: "documents",
      targetId: id,
      targetType: "document",
      oldValue: data,
      newValue: updatePayload,
    },
    (batch) => {
      batch.update(docRef, {
        ...updatePayload,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  );

  revalidatePath(`/documents/${id}`);
  return { success: true };
}

export async function archiveDocument(documentId: string) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "documents", "archive")) {
    throw new Error("FORBIDDEN: role cannot archive documents.");
  }

  const docRef = adminDb.collection("documents").doc(documentId);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error("Document not found.");

  const data = snap.data()!;
  if (data.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }

  // §5 state machine: Obsolete/Draft -> Archived only, manual action,
  // Document Controller+. Enforce the precondition here, not just the
  // role check — archiving an Effective document directly would skip
  // the supersession step that's supposed to produce an Obsolete record.
  if (data.status !== "obsolete" && data.status !== "draft") {
    throw new Error(
      `Cannot archive a document with status "${data.status}". ` +
        `Only "obsolete" or "draft" documents can be archived directly.`
    );
  }

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "document.archive",
      module: "documents",
      targetId: documentId,
      targetType: "document",
      oldValue: { status: data.status, isArchived: data.isArchived },
      newValue: { status: "archived", isArchived: true },
    },
    (batch) => {
      batch.update(docRef, {
        status: "archived",
        isArchived: true,
        updatedBy: session.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  );

  revalidatePath("/documents");
  return { success: true };
}

/**
 * Fetches documents visible to the current session, applying BOTH the
 * module-level permission check and the row-level scope qualifiers from
 * §2 (department_user -> own department only, read_only -> effective
 * only). This is the canonical example referenced in
 * lib/rbac/permissions.ts canReadDocument()'s docstring — any new list
 * view must follow this exact shape, not just hasPermission() alone.
 */
export async function listVisibleDocuments() {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "documents", "read")) {
    throw new Error("FORBIDDEN: role cannot read documents.");
  }

  let query = adminDb.collection("documents").where("orgId", "==", session.orgId);

  if (session.role === "read_only") {
    query = query.where("status", "==", "effective");
  } else if (session.role === "department_user") {
    query = query.where("departmentId", "==", session.departmentId);
  }

  const snap = await query.orderBy("updatedAt", "desc").get();

  interface RawDocRow {
    id: string;
    departmentId: string;
    status: import("@/lib/types/core").DocumentStatus;
    [key: string]: unknown;
  }

  return serializeFirestoreData(
    snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as RawDocRow)
      .filter((doc) =>
        canReadDocument(session.role, session.departmentId, {
          departmentId: doc.departmentId,
          status: doc.status,
        })
      )
  );
}
