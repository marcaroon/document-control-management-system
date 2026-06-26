import { notFound } from "next/navigation";
import { adminDb } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { getServerSession } from "@/lib/auth/session";
import { canReadDocument, hasPermission } from "@/lib/rbac/permissions";
import { listDocumentVersions } from "@/app/actions/versions";
import { listIsoClauses } from "@/app/actions/clauses";
import { listAuditLogsForTarget } from "@/app/actions/audit";
import { listDepartments } from "@/app/actions/organization";
import { getFavoriteStatus } from "@/app/actions/favorites";
import { DOCUMENT_TYPE_LABELS, type DocumentStatus, type DocumentType } from "@/lib/types/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentStatusBadge } from "@/components/shared/document-status-badge";
import { UploadRevisionDialog } from "@/components/documents/upload-revision-dialog";
import { WorkflowActions } from "@/components/documents/workflow-actions";
import { VersionHistoryTable } from "@/components/documents/version-history-table";
import { ClauseTagger } from "@/components/documents/clause-tagger";
import { AuditHistoryList } from "@/components/audit/audit-history-list";
import { FavoriteToggle } from "@/components/documents/favorite-toggle";
import { RecordViewOnMount } from "@/components/documents/record-view-on-mount";
import { DecisionBanner } from "@/components/documents/decision-banner";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();
  if (!session) notFound();

  const snap = await adminDb.collection("documents").doc(id).get();
  if (!snap.exists) notFound();

  const data = serializeFirestoreData(snap.data()!);

  if (data.orgId !== session.orgId) {
    // Same org check as every server action — a stray Admin SDK read
    // here would otherwise leak existence/metadata of another org's
    // document through a 404-vs-not-404 timing/content difference.
    notFound();
  }

  if (!canReadDocument(session.role, session.departmentId, {
    departmentId: data.departmentId,
    status: data.status,
  })) {
    notFound();
  }

  const status = data.status as DocumentStatus;

  // Find the pending approval row for this document, if any — needed by
  // WorkflowActions to know which approvalId to act on. document_approvals
  // has no direct "current pending one" pointer on the documents doc
  // itself (§3's schema doesn't add one), so this is a small lookup
  // rather than a field read.
  let pendingApprovalId: string | null = null;
  if (status === "submitted_for_review") {
    const approvalSnap = await adminDb
      .collection("document_approvals")
      .where("documentId", "==", id)
      .where("decision", "==", "pending")
      .limit(1)
      .get();
    pendingApprovalId = approvalSnap.empty ? null : approvalSnap.docs[0].id;
  }

  // Resolve the reviewer's display name for the decision banner
  let reviewerName: string | null = null;
  if (data.lastApprovalDecidedBy) {
    const reviewerSnap = await adminDb.collection("users").doc(data.lastApprovalDecidedBy as string).get();
    if (reviewerSnap.exists) {
      const reviewerData = reviewerSnap.data()!;
      reviewerName = reviewerData.name || reviewerData.email || null;
    }
  }

  const canUpload =
    hasPermission(session.role, "revisions", "create") &&
    (status === "draft" || status === "under_review");

  const rawVersions = await listDocumentVersions(id);
  const versions = rawVersions.map((v) => {
    const version = v as unknown as {
      id: string;
      revisionNumber: number;
      fileName: string;
      fileType: string;
      fileUrl: string;
      changeDescription: string;
      changedBy: string;
      createdAt: string | null;
    };
    return version;
  });

  const rawClauses = await listIsoClauses();
  const allClauses = rawClauses as unknown as { id: string; clauseNumber: string; title: string }[];
  const canEditDocument = hasPermission(session.role, "documents", "update");
  const canViewAudit = hasPermission(session.role, "audit_trail", "read");
  const rawAuditLogs = canViewAudit ? await listAuditLogsForTarget(id) : [];
  const auditLogs = rawAuditLogs as unknown as import("@/components/audit/audit-history-list").AuditLogEntry[];
  const isFavorite = await getFavoriteStatus(id);

  const rawDepartments = await listDepartments();
  const departments = rawDepartments as unknown as { id: string; name: string }[];
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));
  const departmentName = deptMap.get(data.departmentId as string) ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <RecordViewOnMount documentId={id} />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{data.documentNumber}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <FavoriteToggle documentId={id} initialIsFavorite={isFavorite} />
          <DocumentStatusBadge status={status} />
        </div>
      </div>

      {data.lastApprovalDecision && (
        <DecisionBanner
          decision={data.lastApprovalDecision as "rejected" | "revision_requested"}
          notes={(data.lastApprovalNotes as string) ?? null}
          reviewerName={reviewerName}
        />
      )}

      <WorkflowActions
        documentId={id}
        status={status}
        role={session.role}
        pendingApprovalId={pendingApprovalId}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Type</p>
            <p>{DOCUMENT_TYPE_LABELS[data.type as DocumentType]}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Department</p>
            <p>{departmentName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Current revision</p>
            <p>{data.currentRevisionNumber || "No revisions yet"}</p>
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground">Description</p>
            <p>{data.description || "—"}</p>
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground">ISO Clauses</p>
            <ClauseTagger
              documentId={id}
              allClauses={allClauses}
              selectedClauseIds={data.clauseIds ?? []}
              canEdit={canEditDocument}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Revision history
          </CardTitle>
          {canUpload && <UploadRevisionDialog documentId={id} />}
        </CardHeader>
        <CardContent>
          <VersionHistoryTable
            documentId={id}
            versions={versions}
          />
        </CardContent>
      </Card>

      {canViewAudit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Audit history
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AuditHistoryList logs={auditLogs} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
