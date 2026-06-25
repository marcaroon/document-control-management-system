"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb, runAuditedWrite, addNotification } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { requireServerSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { VISION_MISSION_TYPES } from "@/lib/types/core";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Vision & Mission, per explicit decision: simple propose -> approve,
 * not a full draft/proposed/approved state machine like documents (§5).
 * Two states only (§3's VisionMissionStatus: "draft" | "approved"):
 *   - "draft" = there is a pending edit awaiting MR approval.
 *   - "approved" = no pending edit; content reflects the last approval.
 *
 * §2: super_admin has full CRUD; document_controller can "propose
 * edits"; management_representative "approves." Implemented as:
 *   - proposeVisionMissionEdit() — super_admin OR document_controller
 *     writes new content, sets status "draft", and ALSO appends the
 *     PREVIOUS approved version into the history subcollection (so the
 *     append-only history captures every version that was ever live,
 *     not every keystroke of every draft).
 *   - approveVisionMissionEdit() — super_admin OR management_representative
 *     flips status to "approved" and stamps approvedBy/approvedAt. The
 *     content was already written at propose time; approval doesn't
 *     change content, only status.
 *   - rejectVisionMissionEdit() — discards the pending draft content,
 *     reverting to the last approved version. Needed because §2/§3 don't
 *     give vision_mission a "rejected" status distinct from "draft" the
 *     way documents have one.
 */

const proposeSchema = z.object({
  type: z.enum(VISION_MISSION_TYPES),
  content: z.string().min(1).max(5000),
});

export async function proposeVisionMissionEdit(input: z.infer<typeof proposeSchema>) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "vision_mission", "propose")) {
    throw new Error("FORBIDDEN: role cannot propose Vision/Mission edits.");
  }

  const parsed = proposeSchema.parse(input);

  // One row per type, per org, found by query rather than a fixed ID.
  const existingSnap = await adminDb
    .collection("vision_mission")
    .where("orgId", "==", session.orgId)
    .where("type", "==", parsed.type)
    .limit(1)
    .get();

  const isFirstEverProposal = existingSnap.empty;
  const docRef = isFirstEverProposal
    ? adminDb.collection("vision_mission").doc()
    : existingSnap.docs[0].ref;
  const existingData = isFirstEverProposal ? null : existingSnap.docs[0].data();

  const approversSnap = await adminDb
    .collection("users")
    .where("orgId", "==", session.orgId)
    .where("role", "==", "management_representative")
    .where("isActive", "==", true)
    .get();

  const nextVersion = isFirstEverProposal ? 1 : (existingData!.version ?? 0) + 1;

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "vision_mission.propose",
      module: "vision_mission",
      targetId: docRef.id,
      targetType: "vision_mission",
      oldValue: existingData ? { content: existingData.content, version: existingData.version } : null,
      newValue: { content: parsed.content, version: nextVersion },
    },
    (batch) => {
      // Archive the PREVIOUS APPROVED version into history before
      // overwriting it with the new draft — only meaningful if there
      // was a previously approved version.
      if (!isFirstEverProposal && existingData!.status === "approved") {
        const historyRef = docRef.collection("history").doc();
        batch.set(historyRef, {
          content: existingData!.content,
          version: existingData!.version,
          changedBy: existingData!.approvedBy ?? session.uid,
          changedAt: existingData!.approvedAt ?? FieldValue.serverTimestamp(),
        });
      }

      batch.set(
        docRef,
        {
          orgId: session.orgId,
          type: parsed.type,
          content: parsed.content,
          version: nextVersion,
          status: "draft",
          approvedBy: null,
          approvedAt: null,
        },
        { merge: true }
      );

      for (const approverDoc of approversSnap.docs) {
        addNotification(batch, {
          userId: approverDoc.id,
          orgId: session.orgId,
          type: "pending_approval",
          message: `A new ${parsed.type} statement was proposed and needs your approval.`,
        });
      }
    }
  );

  revalidatePath("/vision-mission");
  return { id: docRef.id, version: nextVersion };
}

const decisionSchema = z.object({
  id: z.string().min(1),
});

export async function approveVisionMissionEdit(input: z.infer<typeof decisionSchema>) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "vision_mission", "approve")) {
    throw new Error("FORBIDDEN: role cannot approve Vision/Mission edits.");
  }

  const { id } = decisionSchema.parse(input);
  const ref = adminDb.collection("vision_mission").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Vision/Mission record not found.");

  const data = snap.data()!;
  if (data.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: record belongs to a different organization.");
  }
  if (data.status !== "draft") {
    throw new Error(`Nothing pending to approve — current status is "${data.status}".`);
  }

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "vision_mission.approve",
      module: "vision_mission",
      targetId: id,
      targetType: "vision_mission",
      oldValue: { status: "draft" },
      newValue: { status: "approved" },
    },
    (batch) => {
      batch.update(ref, {
        status: "approved",
        approvedBy: session.uid,
        approvedAt: FieldValue.serverTimestamp(),
      });
    }
  );

  revalidatePath("/vision-mission");
  return { success: true };
}

/**
 * Discards a pending draft, reverting status (and content, if a prior
 * approved history entry exists) back to the last approved version.
 * First-ever proposals have no history to revert to — in that edge
 * case the draft content is marked "approved" by fiat since there is
 * nothing else to fall back to. Flagging this rather than hiding it.
 */
export async function rejectVisionMissionEdit(input: z.infer<typeof decisionSchema>) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "vision_mission", "approve")) {
    throw new Error("FORBIDDEN: role cannot reject Vision/Mission edits.");
  }

  const { id } = decisionSchema.parse(input);
  const ref = adminDb.collection("vision_mission").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Vision/Mission record not found.");

  const data = snap.data()!;
  if (data.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: record belongs to a different organization.");
  }
  if (data.status !== "draft") {
    throw new Error(`Nothing pending to reject — current status is "${data.status}".`);
  }

  const historySnap = await ref.collection("history").orderBy("version", "desc").limit(1).get();
  const lastApproved = historySnap.empty ? null : historySnap.docs[0].data();

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "vision_mission.reject",
      module: "vision_mission",
      targetId: id,
      targetType: "vision_mission",
      oldValue: { status: "draft", content: data.content },
      newValue: { status: "approved", reverted: !!lastApproved },
    },
    (batch) => {
      batch.update(ref, {
        status: "approved",
        ...(lastApproved
          ? { content: lastApproved.content, version: lastApproved.version }
          : {}),
      });
    }
  );

  revalidatePath("/vision-mission");
  return { success: true, reverted: !!lastApproved };
}

export async function getVisionMission() {
  const session = await requireServerSession();

  const snap = await adminDb
    .collection("vision_mission")
    .where("orgId", "==", session.orgId)
    .get();

  return serializeFirestoreData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}
