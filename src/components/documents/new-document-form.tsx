"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createDocument } from "@/app/actions/documents";
import { uploadDocumentVersion } from "@/lib/storage/upload";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/types/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { ClausePickerList, type ClauseOption } from "@/components/documents/clause-picker-list";

interface Department {
  id: string;
  name: string;
}

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.xlsx,.pptx,.doc,.xls,.ppt";

/**
 * Per explicit revision request: the create-document form now uploads
 * the first revision INLINE, instead of requiring a separate trip to
 * the document detail page afterward. This is a UX change, not a
 * workflow-rule change — §5's state machine still requires at least one
 * uploaded revision before a document can be submitted for review (see
 * submitForReview in app/actions/approvals.ts); this form just lets you
 * satisfy that in one step instead of two.
 *
 * Sequencing: createDocument() runs first (needs to exist before a
 * revision can be attached to it), THEN uploadDocumentVersion() runs
 * against the new documentId. If upload fails AFTER the document was
 * successfully created, the document is NOT rolled back — it exists as
 * an empty Draft, and the error message says so explicitly, with a
 * link to finish the upload from the document page. A full rollback
 * (deleting the just-created document on upload failure) was
 * deliberately not implemented: it would mean the *document creation
 * itself* fails because of a network blip during a LATER step, which
 * is a worse failure mode than "the document exists, finish the upload
 * when you retry."
 */
export function NewDocumentForm({
  departments,
  numberingTemplates,
  clauses,
  preselectedClauseId,
}: {
  departments: Department[];
  numberingTemplates: Record<string, string>;
  clauses: ClauseOption[];
  preselectedClauseId?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [createdDocumentId, setCreatedDocumentId] = React.useState<string | null>(null);

  const [documentNumber, setDocumentNumber] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<string>("");
  const [departmentId, setDepartmentId] = React.useState<string>("");
  const [clauseIds, setClauseIds] = React.useState<string[]>(
    preselectedClauseId ? [preselectedClauseId] : []
  );
  const [file, setFile] = React.useState<File | null>(null);
  const [changeDescription, setChangeDescription] = React.useState("Initial upload");

  function toggleClause(clauseId: string) {
    setClauseIds((prev) =>
      prev.includes(clauseId) ? prev.filter((id) => id !== clauseId) : [...prev, clauseId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!type || !departmentId) {
      setError("Document type and department are required.");
      return;
    }

    setSubmitting(true);
    try {
      // Step 1: create the document (Draft, no file yet).
      const result = await createDocument({
        documentNumber,
        title,
        description: description || undefined,
        type: type as (typeof DOCUMENT_TYPES)[number],
        departmentId,
        processOwnerId: departmentId, // v1 simplification: owner defaults to department; refine once a per-user picker exists
        clauseIds,
        keywords: [],
      });
      setCreatedDocumentId(result.id);

      // Step 2: upload the first revision against the document just
      // created, if a file was provided. Optional — a Document
      // Controller can still create a bare Draft and upload later from
      // the document page, same as before this change.
      if (file) {
        setUploadProgress(0);
        await uploadDocumentVersion(result.id, file, changeDescription, (percent) =>
          setUploadProgress(percent)
        );
      }

      router.push(`/documents/${result.id}`);
    } catch (err) {
      if (createdDocumentId) {
        // The document itself was created successfully; this failure
        // happened during the upload step. Say so explicitly rather
        // than implying the whole operation failed.
        setError(
          (err instanceof Error ? err.message : "Upload failed.") +
            ` The document was created — open it from the Documents list to finish uploading.`
        );
      } else {
        setError(err instanceof Error ? err.message : "Failed to create document.");
      }
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label>Document type</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue placeholder="Select a type" />
          </SelectTrigger>
          <SelectContent>
            {DOCUMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="documentNumber">Document number</Label>
        <Input
          id="documentNumber"
          placeholder={
            type && numberingTemplates[type]
              ? numberingTemplates[type].replace("{number}", "001")
              : "e.g. QM-001"
          }
          required
          value={documentNumber}
          onChange={(e) => setDocumentNumber(e.target.value)}
        />
        {type && numberingTemplates[type] && (
          <p className="text-xs text-muted-foreground">
            Expected format: <code className="rounded bg-muted px-1 py-0.5">{numberingTemplates[type]}</code>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Department</Label>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a department" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {departments.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No departments yet — create one from Organization settings first.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>ISO Clauses (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Link this document to the ISO 9001 clauses it satisfies. You
          can change this later from the document page.
        </p>
        {preselectedClauseId && (
          <p className="text-xs text-primary">
            Pre-selected from the clause page you came from — uncheck it below if that wasn&apos;t intended.
          </p>
        )}
        <ClausePickerList allClauses={clauses} selected={clauseIds} onToggle={toggleClause} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="file">First revision (optional)</Label>
        <p className="text-xs text-muted-foreground">
          You can attach the working file now, or skip this and upload
          it later from the document page. PDF gets an in-app preview;
          Word/Excel/PowerPoint are download-only.
        </p>
        <input
          id="file"
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        {file && (
          <Input
            className="mt-2"
            placeholder="What does this revision contain? (e.g. Initial upload)"
            value={changeDescription}
            onChange={(e) => setChangeDescription(e.target.value)}
          />
        )}
        {uploadProgress !== null && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting
            ? uploadProgress !== null
              ? "Uploading…"
              : "Creating…"
            : "Create document"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
