"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb, runAuditedWrite, addNotification } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { requireServerSession } from "@/lib/auth/session";
import { hasPermission, canTransition, getNextStatus } from "@/lib/rbac/permissions";
import { FieldValue } from "firebase-admin/firestore";
import type { ApprovalDecision } from "@/lib/types/core";

/**
 * §5 Approval & Document Lifecycle State Machine, implemented.
 *
 * Every function in this file follows the same shape as documents.ts,
 * PLUS a state-machine check that documents.ts didn't need:
 *   1. requireServerSession()
 *   2. hasPermission() — module-level "can this role even attempt this"
 *   3. canTransition() / getNextStatus() — is THIS status change legal
 *      right now, independent of role (e.g. you cannot "approve" a Draft
 *      document — there's nothing submitted yet)
 *   4. row/ownership scope checks
 *   5. runAuditedWrite() — mutation + document_approvals row (where
 *      applicable) + audit_logs row, atomically
 *   6. addNotification() inside the SAME batch, so a notification is
 *      never created for a transition that didn't actually commit
 *
 * Approval authority resolution: §2's matrix doesn't model "assigned
 * approver per document" (no field for it in §3's document_approvals
 * shape either — approverId is set at DECISION time, not at submission
 * time). So submit_for_review notifies EVERY management_representative
 * in the org, and whichever one acts first becomes the approverId on
 * the decision. If GIN/DBG needs a single assigned approver per
 * department later, that's a schema change (an approverId or
 * approverPoolIds field on documents), not a server-action change —
 * flagging it here so it doesn't get treated as a quick tweak later.
 */

const submitForReviewSchema = z.object({
  documentId: z.string().min(1),
});

export async function submitForReview(input: z.infer<typeof submitForReviewSchema>) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "approvals", "submit_for_review")) {
    throw new Error("FORBIDDEN: role cannot submit documents for review.");
  }

  const { documentId } = submitForReviewSchema.parse(input);
  const docRef = adminDb.collection("documents").doc(documentId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new Error("Document not found.");

  const docData = docSnap.data()!;
  if (docData.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }

  if (!canTransition(docData.status, "submit_for_review")) {
    throw new Error(
      `Cannot submit for review: document is "${docData.status}", not "draft".`
    );
  }

  // A document needs at least one uploaded revision before it can be
  // submitted — submitting an empty Draft would create an approval
  // workflow with nothing for the approver to actually review.
  if (!docData.currentVersionId) {
    throw new Error(
      "Upload at least one revision before submitting this document for review."
    );
  }

  const nextStatus = getNextStatus(docData.status, "submit_for_review")!;
  const approvalRef = adminDb.collection("document_approvals").doc();

  // Resolve who to notify: every management_representative in the org.
  const approversSnap = await adminDb
    .collection("users")
    .where("orgId", "==", session.orgId)
    .where("role", "==", "management_representative")
    .where("isActive", "==", true)
    .get();

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "document.submit_for_review",
      module: "approvals",
      targetId: documentId,
      targetType: "document",
      oldValue: { status: docData.status },
      newValue: { status: nextStatus, approvalId: approvalRef.id },
    },
    (batch) => {
      batch.update(docRef, {
        status: nextStatus,
        updatedBy: session.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });

      batch.set(approvalRef, {
        documentId,
        revisionNumber: docData.currentRevisionNumber,
        requestedBy: session.uid,
        requestedAt: FieldValue.serverTimestamp(),
        approverId: null,
        decision: "pending" satisfies ApprovalDecision,
        decisionNotes: "",
        decidedAt: null,
      });

      for (const approverDoc of approversSnap.docs) {
        addNotification(batch, {
          userId: approverDoc.id,
          orgId: session.orgId,
          type: "pending_approval",
          relatedDocumentId: documentId,
          message: `"${docData.title}" (${docData.documentNumber}) was submitted for your review.`,
        });
      }
    }
  );

  revalidatePath(`/documents/${documentId}`);
  return { success: true, approvalId: approvalRef.id };
}

const decisionSchema = z.object({
  documentId: z.string().min(1),
  approvalId: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

/**
 * Shared implementation for approve/reject/request_revision — the three
 * decisions an MR can make on a submitted-for-review document. Kept as
 * one function (parameterized by `decision`) rather than three near-
 * identical copies, since the audited-write shape, the approval-row
 * update, and the notification-back-to-submitter are identical across
 * all three; only the resulting status and message text differ.
 */
async function decideApproval(
  decision: Exclude<ApprovalDecision, "pending">,
  input: z.infer<typeof decisionSchema>
) {
  const session = await requireServerSession();

  const action =
    decision === "approved"
      ? "approve"
      : decision === "rejected"
        ? "reject"
        : "request_revision";

  if (!hasPermission(session.role, "approvals", action)) {
    throw new Error(`FORBIDDEN: role cannot ${action} documents.`);
  }

  const parsed = decisionSchema.parse(input);
  const docRef = adminDb.collection("documents").doc(parsed.documentId);
  const approvalRef = adminDb.collection("document_approvals").doc(parsed.approvalId);

  const [docSnap, approvalSnap] = await Promise.all([docRef.get(), approvalRef.get()]);

  if (!docSnap.exists) throw new Error("Document not found.");
  if (!approvalSnap.exists) throw new Error("Approval request not found.");

  const docData = docSnap.data()!;
  const approvalData = approvalSnap.data()!;

  if (docData.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }
  if (approvalData.documentId !== parsed.documentId) {
    throw new Error("FORBIDDEN: approval record does not belong to this document.");
  }
  if (approvalData.decision !== "pending") {
    throw new Error(
      `This approval request was already decided ("${approvalData.decision}").`
    );
  }

  if (!canTransition(docData.status, action)) {
    throw new Error(
      `Cannot ${action}: document is "${docData.status}", not "submitted_for_review".`
    );
  }

  const nextStatus = getNextStatus(docData.status, action)!;

  const messageByDecision: Record<typeof decision, string> = {
    approved: `"${docData.title}" (${docData.documentNumber}) was approved and is now Effective.`,
    rejected: `"${docData.title}" (${docData.documentNumber}) was rejected and returned to Draft.`,
    revision_requested: `"${docData.title}" (${docData.documentNumber}) needs revisions — see the reviewer's notes.`,
  };

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: `document.${action}`,
      module: "approvals",
      targetId: parsed.documentId,
      targetType: "document",
      oldValue: { status: docData.status, decision: approvalData.decision },
      newValue: { status: nextStatus, decision },
    },
    (batch) => {
      const docUpdate: Record<string, unknown> = {
        status: nextStatus,
        updatedBy: session.uid,
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Only an APPROVAL sets effectiveDate — rejections/revision
      // requests return to Draft and effectiveDate is left untouched.
      if (decision === "approved") {
        docUpdate.effectiveDate = FieldValue.serverTimestamp();
      }
      batch.update(docRef, docUpdate);

      batch.update(approvalRef, {
        approverId: session.uid,
        decision,
        decisionNotes: parsed.notes ?? "",
        decidedAt: FieldValue.serverTimestamp(),
      });

      addNotification(batch, {
        userId: approvalData.requestedBy,
        orgId: session.orgId,
        type: "approval_decided",
        relatedDocumentId: parsed.documentId,
        message: messageByDecision[decision],
      });
    }
  );

  revalidatePath(`/documents/${parsed.documentId}`);
  return { success: true };
}

export async function approveDocument(input: z.infer<typeof decisionSchema>) {
  return decideApproval("approved", input);
}

export async function rejectDocument(input: z.infer<typeof decisionSchema>) {
  return decideApproval("rejected", input);
}

export async function requestRevision(input: z.infer<typeof decisionSchema>) {
  return decideApproval("revision_requested", input);
}

/**
 * "Effective -> Under Review" — manual trigger per explicit project
 * decision (NOT a Cloud Scheduler job; see the note in
 * lib/rbac/permissions.ts above getNextStatus). Any Document Controller+
 * can start a review when they judge it's time, independent of whatever
 * reviewDate is stored — reviewDate is informational, not enforced.
 */
const startReviewSchema = z.object({ documentId: z.string().min(1) });

export async function startReview(input: z.infer<typeof startReviewSchema>) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "documents", "update")) {
    throw new Error("FORBIDDEN: role cannot start a document review.");
  }

  const { documentId } = startReviewSchema.parse(input);
  const docRef = adminDb.collection("documents").doc(documentId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new Error("Document not found.");

  const docData = docSnap.data()!;
  if (docData.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }
  if (!canTransition(docData.status, "start_review")) {
    throw new Error(`Cannot start review: document is "${docData.status}", not "effective".`);
  }

  const nextStatus = getNextStatus(docData.status, "start_review")!;

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "document.start_review",
      module: "documents",
      targetId: documentId,
      targetType: "document",
      oldValue: { status: docData.status },
      newValue: { status: nextStatus },
    },
    (batch) => {
      batch.update(docRef, {
        status: nextStatus,
        updatedBy: session.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  );

  revalidatePath(`/documents/${documentId}`);
  return { success: true };
}

/**
 * "Under Review -> Effective" (confirm_current): the periodic review
 * concluded the existing revision is still adequate, no new revision
 * needed. Distinct from uploading a new revision while Under Review,
 * which instead routes through recordUploadedVersion() and lands back
 * in Draft (start_new_revision) — see app/actions/versions.ts.
 */
const confirmCurrentSchema = z.object({ documentId: z.string().min(1) });

export async function confirmDocumentCurrent(
  input: z.infer<typeof confirmCurrentSchema>
) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "documents", "update")) {
    throw new Error("FORBIDDEN: role cannot confirm a document review outcome.");
  }

  const { documentId } = confirmCurrentSchema.parse(input);
  const docRef = adminDb.collection("documents").doc(documentId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new Error("Document not found.");

  const docData = docSnap.data()!;
  if (docData.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }
  if (!canTransition(docData.status, "confirm_current")) {
    throw new Error(
      `Cannot confirm as current: document is "${docData.status}", not "under_review".`
    );
  }

  const nextStatus = getNextStatus(docData.status, "confirm_current")!;
  const reviewRef = adminDb.collection("document_reviews").doc();

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "document.confirm_current",
      module: "documents",
      targetId: documentId,
      targetType: "document",
      oldValue: { status: docData.status },
      newValue: { status: nextStatus },
    },
    (batch) => {
      batch.update(docRef, {
        status: nextStatus,
        updatedBy: session.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });

      batch.set(reviewRef, {
        documentId,
        reviewerId: session.uid,
        reviewDate: FieldValue.serverTimestamp(),
        outcome: "confirmed_current",
        notes: "",
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  );

  revalidatePath(`/documents/${documentId}`);
  return { success: true };
}

/**
 * "Effective -> Obsolete" (supersede): used when a document is being
 * replaced/retired without going through a new-revision review cycle.
 */
const supersedeSchema = z.object({
  documentId: z.string().min(1),
  reason: z.string().max(1000).optional(),
});

export async function supersedeDocument(input: z.infer<typeof supersedeSchema>) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "documents", "archive")) {
    throw new Error("FORBIDDEN: role cannot supersede documents.");
  }

  const parsed = supersedeSchema.parse(input);
  const docRef = adminDb.collection("documents").doc(parsed.documentId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new Error("Document not found.");

  const docData = docSnap.data()!;
  if (docData.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }
  if (!canTransition(docData.status, "supersede")) {
    throw new Error(`Cannot supersede: document is "${docData.status}", not "effective".`);
  }

  const nextStatus = getNextStatus(docData.status, "supersede")!;

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "document.supersede",
      module: "documents",
      targetId: parsed.documentId,
      targetType: "document",
      oldValue: { status: docData.status },
      newValue: { status: nextStatus, reason: parsed.reason ?? null },
    },
    (batch) => {
      batch.update(docRef, {
        status: nextStatus,
        updatedBy: session.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  );

  revalidatePath(`/documents/${parsed.documentId}`);
  return { success: true };
}

export async function listPendingApprovals() {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "approvals", "read")) {
    throw new Error("FORBIDDEN: role cannot view approvals.");
  }

  // document_approvals has no orgId field of its own (§3's schema scopes
  // it by documentId, not orgId directly). Firestore has no joins, so:
  // fetch pending approvals, then fetch their parent documents and
  // filter by orgId in application code. Fine at the data volumes a
  // single QMS deployment expects; revisit with a denormalized orgId
  // field on document_approvals if that assumption stops holding.
  const pendingSnap = await adminDb
    .collection("document_approvals")
    .where("decision", "==", "pending")
    .orderBy("requestedAt", "desc")
    .get();

  const results = await Promise.all(
    pendingSnap.docs.map(async (approvalDoc) => {
      const approval = approvalDoc.data();
      const docSnap = await adminDb.collection("documents").doc(approval.documentId).get();
      if (!docSnap.exists || docSnap.data()!.orgId !== session.orgId) return null;
      return {
        approvalId: approvalDoc.id,
        ...approval,
        document: { id: docSnap.id, ...docSnap.data() },
      };
    })
  );

  return serializeFirestoreData(results.filter((r): r is NonNullable<typeof r> => r !== null));
}
