"use server";

import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { requireServerSession } from "@/lib/auth/session";
import { canReadDocument } from "@/lib/rbac/permissions";
import type { DocumentStatus, DocumentType } from "@/lib/types/core";

/**
 * §9 Phase 4: "global search... returns across documents/clauses/org
 * data." Per explicit decision: client-side instant (search-as-you-type)
 * rather than a server round-trip per keystroke.
 *
 * SECURITY NOTE on what this sends to the browser: this index is
 * fetched ONCE per search-page visit and held in client memory for
 * instant filtering. It intentionally includes ONLY lightweight,
 * low-sensitivity fields needed to match and display a result —
 * documentNumber, title, type, status, clause numbers/titles, org
 * name/quality policy text. It does NOT include document `description`,
 * `currentFileUrl`/storage paths, user PII, or anything from
 * document_versions/document_approvals/audit_logs. Every document row
 * that goes into the index has already passed the same
 * canReadDocument() row-level scope check used everywhere else in this
 * codebase (department_user -> own department only, read_only ->
 * effective only) — this is not a separate, looser access path, it's
 * the same RBAC scoping applied before the data ever leaves the server.
 *
 * SCALE NOTE: this fetches ALL matching rows for the org in one go, not
 * paginated. Fine for the document/clause counts a single QMS deployment
 * realistically has (hundreds, not tens of thousands). If an org's
 * document count grows large enough that this payload becomes slow to
 * fetch or large to hold in browser memory, the fix is narrowing what's
 * indexed or moving to a real search service — not a tweak to this
 * function.
 */

export interface SearchableDocument {
  kind: "document";
  id: string;
  documentNumber: string;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
}

export interface SearchableClause {
  kind: "clause";
  id: string;
  clauseNumber: string;
  title: string;
}

export interface SearchableOrgField {
  kind: "org_profile";
  id: string;
  label: string;
  value: string;
}

export type SearchIndexItem = SearchableDocument | SearchableClause | SearchableOrgField;

export async function getSearchIndex(): Promise<SearchIndexItem[]> {
  const session = await requireServerSession();

  const [docsSnap, clausesSnap, orgSnap] = await Promise.all([
    adminDb.collection("documents").where("orgId", "==", session.orgId).get(),
    adminDb.collection("iso_clauses").where("orgId", "==", session.orgId).get(),
    adminDb.collection("organizations").doc(session.orgId).get(),
  ]);

  const documents: SearchableDocument[] = docsSnap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter(({ data }) =>
      canReadDocument(session.role, session.departmentId, {
        departmentId: data.departmentId,
        status: data.status,
      })
    )
    .map(({ id, data }) => ({
      kind: "document" as const,
      id,
      documentNumber: data.documentNumber,
      title: data.title,
      type: data.type,
      status: data.status,
    }));

  const clauses: SearchableClause[] = clausesSnap.docs.map((d) => ({
    kind: "clause" as const,
    id: d.id,
    clauseNumber: d.data().clauseNumber,
    title: d.data().title,
  }));

  const orgData = orgSnap.data();
  const orgFields: SearchableOrgField[] = [];
  if (orgData?.name) {
    orgFields.push({
      kind: "org_profile",
      id: "org-name",
      label: "Organization",
      value: orgData.name,
    });
  }
  if (orgData?.qualityPolicy) {
    orgFields.push({
      kind: "org_profile",
      id: "org-quality-policy",
      label: "Quality Policy",
      value: orgData.qualityPolicy,
    });
  }

  return [...documents, ...clauses, ...orgFields];
}
