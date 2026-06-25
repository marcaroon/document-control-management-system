"use server";

import "server-only";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { requireServerSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { MODULES } from "@/lib/types/core";

/**
 * §2: Audit Trail is read-only for super_admin, document_controller,
 * management_representative — NO role has write access (every row is
 * system-generated from server actions, see §4 Rule 1-3 and every
 * runAuditedWrite() call across app/actions/**). This file only ever
 * reads; there is deliberately no createAuditLog() exported here or
 * anywhere outside lib/firebase/admin.ts's runAuditedWrite().
 */

const listAuditLogsSchema = z.object({
  module: z.enum(MODULES).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  startAfterId: z.string().optional(),
});

type ListAuditLogsInput = Partial<z.input<typeof listAuditLogsSchema>>;

export async function listAuditLogs(input: ListAuditLogsInput = {}) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "audit_trail", "read")) {
    throw new Error("FORBIDDEN: role cannot view the audit trail.");
  }

  const parsed = listAuditLogsSchema.parse(input);

  let query = adminDb
    .collection("audit_logs")
    .where("orgId", "==", session.orgId)
    .orderBy("timestamp", "desc");

  if (parsed.module) {
    query = adminDb
      .collection("audit_logs")
      .where("orgId", "==", session.orgId)
      .where("module", "==", parsed.module)
      .orderBy("timestamp", "desc");
  }

  if (parsed.startAfterId) {
    const cursorSnap = await adminDb.collection("audit_logs").doc(parsed.startAfterId).get();
    if (cursorSnap.exists) {
      query = query.startAfter(cursorSnap);
    }
  }

  const snap = await query.limit(parsed.limit).get();

  return {
    logs: serializeFirestoreData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    lastId: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : null,
    hasMore: snap.docs.length === parsed.limit,
  };
}

/**
 * Single-target audit history — e.g. "show me everything that happened
 * to this document," used from the document detail page. Distinct query
 * shape from listAuditLogs (filters by targetId, not module), so kept as
 * its own function rather than overloading one query builder.
 */
export async function listAuditLogsForTarget(targetId: string) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "audit_trail", "read")) {
    throw new Error("FORBIDDEN: role cannot view the audit trail.");
  }

  const snap = await adminDb
    .collection("audit_logs")
    .where("orgId", "==", session.orgId)
    .where("targetId", "==", targetId)
    .orderBy("timestamp", "desc")
    .limit(50)
    .get();

  return serializeFirestoreData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}
