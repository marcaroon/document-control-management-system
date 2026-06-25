"use server";

import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { requireServerSession } from "@/lib/auth/session";
import { canReadDocument } from "@/lib/rbac/permissions";
import {
  computeDashboardMetrics,
  type DashboardMetrics,
  type RawDocForMetrics,
} from "@/lib/dashboard/metrics";

/**
 * Thin Firestore-fetching wrapper around the pure aggregation logic in
 * lib/dashboard/metrics.ts (see that file for the full rationale on why
 * the logic itself lives outside this "use server" file).
 *
 * Uses the SAME RBAC-scoped document set every other view uses
 * (canReadDocument() row filter) — a department_user's dashboard
 * reflects only their department's documents, a read_only's dashboard
 * reflects only effective documents, exactly like every list view in
 * this codebase. There is no separate, unscoped "admin dashboard" data
 * path.
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const session = await requireServerSession();

  let query = adminDb.collection("documents").where("orgId", "==", session.orgId);
  if (session.role === "read_only") {
    query = query.where("status", "==", "effective");
  } else if (session.role === "department_user") {
    query = query.where("departmentId", "==", session.departmentId);
  }

  const [docsSnap, deptsSnap] = await Promise.all([
    query.get(),
    adminDb.collection("departments").where("orgId", "==", session.orgId).get(),
  ]);

  const departmentNameById = new Map(
    deptsSnap.docs.map((d) => [d.id, (d.data().name as string) ?? "Unknown"])
  );

  const visibleDocs = serializeFirestoreData(
    docsSnap.docs
      .map((d) => d.data())
      .filter((doc) =>
        canReadDocument(session.role, session.departmentId, {
          departmentId: doc.departmentId,
          status: doc.status,
        })
      )
  );

  return computeDashboardMetrics(
    visibleDocs as RawDocForMetrics[],
    departmentNameById,
    Math.floor(Date.now() / 1000)
  );
}
