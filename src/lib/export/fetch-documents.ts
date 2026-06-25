import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { canReadDocument } from "@/lib/rbac/permissions";
import type { ServerSession } from "@/lib/auth/session";
import type { ExportDocumentRow } from "./documents-xlsx";

/**
 * Fetches documents scoped exactly the same way listVisibleDocuments()
 * in app/actions/documents.ts does (same canReadDocument() row-level
 * filter), then resolves departmentId -> departmentName since Firestore
 * has no joins and the export needs a human-readable column, not an ID.
 *
 * This is NOT a "use server" Server Action — it's a plain async function
 * called directly from app/api/export/documents/route.ts. Server Actions
 * can only return plain serializable data to client code; this function
 * is never called from the client, so that constraint doesn't apply, but
 * it also means: do not import this from a client component. It must
 * only ever be called from another server-only file (a Route Handler,
 * in this case).
 */
export async function fetchScopedDocumentsForExport(
  session: ServerSession
): Promise<ExportDocumentRow[]> {
  let query = adminDb.collection("documents").where("orgId", "==", session.orgId);

  if (session.role === "read_only") {
    query = query.where("status", "==", "effective");
  } else if (session.role === "department_user") {
    query = query.where("departmentId", "==", session.departmentId);
  }

  const [docsSnap, deptsSnap] = await Promise.all([
    query.orderBy("updatedAt", "desc").get(),
    adminDb.collection("departments").where("orgId", "==", session.orgId).get(),
  ]);

  const departmentNameById = new Map(
    deptsSnap.docs.map((d) => [d.id, (d.data().name as string) ?? "Unknown"])
  );

  return docsSnap.docs
    .map((d) => d.data())
    .filter((doc) =>
      canReadDocument(session.role, session.departmentId, {
        departmentId: doc.departmentId,
        status: doc.status,
      })
    )
    .map((doc) => ({
      documentNumber: doc.documentNumber,
      title: doc.title,
      type: doc.type,
      status: doc.status,
      currentRevisionNumber: doc.currentRevisionNumber ?? 0,
      departmentName: departmentNameById.get(doc.departmentId) ?? "Unknown",
      effectiveDate: doc.effectiveDate ?? null,
      reviewDate: doc.reviewDate ?? null,
      updatedAt: doc.updatedAt ?? null,
    }));
}
