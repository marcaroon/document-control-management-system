"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { uploadDocumentVersion } from "@/lib/storage/upload";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Upload } from "lucide-react";

/**
 * §6: accepted formats include DOCX/XLSX/PPTX (Document Controllers
 * need to attach the real working file), but only PDF gets an in-app
 * preview — see components/documents/pdf-preview-dialog.tsx, which
 * renders Cloudinary's PDF-to-image transformation. This dialog
 * doesn't restrict by type beyond what app/actions/versions.ts already
 * validates server-side; the `accept` attribute below is a UX hint,
 * not the enforcement layer.
 */
const ACCEPTED_EXTENSIONS = ".pdf,.docx,.xlsx,.pptx,.doc,.xls,.ppt";

export function UploadRevisionDialog({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [changeDescription, setChangeDescription] = React.useState("");
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleUpload() {
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (!changeDescription.trim()) {
      setError("Describe what changed in this revision.");
      return;
    }

    setError(null);
    setProgress(0);

    try {
      await uploadDocumentVersion(documentId, file, changeDescription, (percent) =>
        setProgress(percent)
      );
      setOpen(false);
      setFile(null);
      setChangeDescription("");
      setProgress(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setProgress(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" />
          Upload revision
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a new revision</DialogTitle>
          <DialogDescription>
            PDF revisions get an in-app page preview after uploading.
            Word/Excel/PowerPoint files are accepted but download-only.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file">File</Label>
            <input
              id="file"
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="changeDescription">What changed?</Label>
            <Textarea
              id="changeDescription"
              value={changeDescription}
              onChange={(e) => setChangeDescription(e.target.value)}
              placeholder="e.g. Updated section 4.2 to reflect new inspection criteria"
            />
          </div>

          {progress !== null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={progress !== null}>
            {progress !== null ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
