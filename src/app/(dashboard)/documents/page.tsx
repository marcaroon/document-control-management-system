import Link from "next/link";
import { getServerSession } from "@/lib/auth/session";
import { listVisibleDocuments } from "@/app/actions/documents";
import { hasPermission } from "@/lib/rbac/permissions";
import { DOCUMENT_TYPE_LABELS, type DocumentStatus, type DocumentType } from "@/lib/types/core";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { DocumentStatusBadge } from "@/components/shared/document-status-badge";
import { Plus, Download } from "lucide-react";

interface DocRow {
  id: string;
  documentNumber: string;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  currentRevisionNumber: number;
}

export default async function DocumentsPage() {
  const session = await getServerSession();
  const documents = (await listVisibleDocuments()) as unknown as DocRow[];
  const canCreate = session && hasPermission(session.role, "documents", "create");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            {documents.length} document{documents.length === 1 ? "" : "s"} visible to you
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/api/export/documents" download>
              <Download className="size-4" />
              Export Excel
            </a>
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href="/documents/new">
                <Plus className="size-4" />
                New document
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document #</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Rev.</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No documents yet. {canCreate ? "Create the first one to get started." : ""}
                </TableCell>
              </TableRow>
            )}
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">
                  <Link href={`/documents/${doc.id}`} className="hover:underline">
                    {doc.documentNumber}
                  </Link>
                </TableCell>
                <TableCell>{doc.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {DOCUMENT_TYPE_LABELS[doc.type]}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {doc.currentRevisionNumber}
                </TableCell>
                <TableCell>
                  <DocumentStatusBadge status={doc.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
