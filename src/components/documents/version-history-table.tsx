"use client";

import * as React from "react";
import { getDownloadUrl } from "@/app/actions/versions";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, Eye, FileText } from "lucide-react";
import { PdfPreviewDialog } from "@/components/documents/pdf-preview-dialog";

interface VersionRow {
  id: string;
  revisionNumber: number;
  fileName: string;
  fileType: string;
  fileUrl: string;
  resourceType?: "image" | "raw";
  changeDescription: string;
  changedBy: string;
  createdAt: string | null;
}

/**
 * §6 Compare versions, applied: this table IS the v1 "compare" feature —
 * side-by-side metadata (revision date, changed by, change description)
 * plus a download/preview action for each revision. There is
 * deliberately no content-diff button here.
 *
 * Preview is only offered for rows where resourceType === "image"
 * (PDFs, per resolveResourceType in lib/cloudinary/server.ts) — every
 * other format gets download-only, with no dead-end "Preview" button
 * that would just fail.
 */
export function VersionHistoryTable({
  documentId,
  versions,
}: {
  documentId: string;
  versions: VersionRow[];
}) {
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = React.useState<VersionRow | null>(null);

  async function handleDownload(version: VersionRow) {
    setDownloadingId(version.id);
    try {
      const { url } = await getDownloadUrl(version.id, documentId);
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  }

  if (versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No revisions uploaded yet.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rev.</TableHead>
            <TableHead>File</TableHead>
            <TableHead>Change description</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((v) => {
            const canPreview = v.resourceType === "image";
            return (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.revisionNumber}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <FileText className="size-3.5 text-muted-foreground" />
                    {v.fileName}
                  </span>
                </TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">
                  {v.changeDescription}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canPreview && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewVersion(v)}
                      >
                        <Eye className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={downloadingId === v.id}
                      onClick={() => handleDownload(v)}
                    >
                      <Download className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {previewVersion && (
        <PdfPreviewDialog
          open={previewVersion !== null}
          onOpenChange={(open) => !open && setPreviewVersion(null)}
          documentId={documentId}
          versionId={previewVersion.id}
          fileName={previewVersion.fileName}
        />
      )}
    </>
  );
}
