import { notFound } from "next/navigation";
import Link from "next/link";
import { adminDb } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { getServerSession } from "@/lib/auth/session";
import { listDocumentsForClause } from "@/app/actions/clauses";
import { hasPermission } from "@/lib/rbac/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentStatusBadge } from "@/components/shared/document-status-badge";
import { LinkExistingDocumentDialog } from "@/components/clauses/link-existing-document-dialog";
import type { DocumentStatus } from "@/lib/types/core";
import { Plus } from "lucide-react";

export default async function ClauseDetailPage({
  params,
}: {
  params: Promise<{ clauseId: string }>;
}) {
  const { clauseId } = await params;
  const session = await getServerSession();
  if (!session) notFound();

  const snap = await adminDb.collection("iso_clauses").doc(clauseId).get();
  if (!snap.exists) notFound();

  const clause = serializeFirestoreData(snap.data()!);
  if (clause.orgId !== session.orgId) notFound();

  const rawDocs = await listDocumentsForClause(clauseId);
  const documents = rawDocs as unknown as {
    id: string;
    documentNumber: string;
    title: string;
    status: DocumentStatus;
  }[];

  const clauseLabel = `${clause.clauseNumber} ${clause.title}`;
  const canLinkDocuments = hasPermission(session.role, "documents", "update");
  const canCreateDocuments = hasPermission(session.role, "documents", "create");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Clause {clause.clauseNumber}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{clause.title}</h1>
      </div>

      {clause.objective && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Objective</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{clause.objective}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Mapped documents ({documents.length})
          </CardTitle>
          <div className="flex gap-2">
            {canLinkDocuments && (
              <LinkExistingDocumentDialog clauseId={clauseId} clauseLabel={clauseLabel} />
            )}
            {canCreateDocuments && (
              <Button size="sm" asChild>
                <Link href={`/documents/new?clauseId=${clauseId}`}>
                  <Plus className="size-3.5" />
                  New document
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents are mapped to this clause yet.
              {canLinkDocuments || canCreateDocuments
                ? " Link an existing document or create a new one above."
                : ""}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between text-sm">
                  <Link href={`/documents/${doc.id}`} className="hover:underline">
                    {doc.documentNumber} — {doc.title}
                  </Link>
                  <DocumentStatusBadge status={doc.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
