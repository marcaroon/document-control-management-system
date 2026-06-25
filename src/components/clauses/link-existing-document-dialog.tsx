"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { listVisibleDocuments, updateDocumentMetadata } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Link2, Search } from "lucide-react";
import type { DocumentStatus, DocumentType } from "@/lib/types/core";

interface DocOption {
  id: string;
  documentNumber: string;
  title: string;
  status: DocumentStatus;
  type: DocumentType;
  clauseIds?: string[];
}

/**
 * "Add document" from the clause side, option 1 of 2 (see also
 * CreateDocumentForClauseLink for "create a brand new document
 * pre-tagged with this clause"). This one links an EXISTING document —
 * fetches the same RBAC-scoped document list every other view uses
 * (listVisibleDocuments already applies §2's row-level scope
 * qualifiers), then adds this clauseId to whichever document the user
 * picks via the same updateDocumentMetadata() action the document-side
 * ClauseTagger uses. There is no separate, parallel "link from clause
 * side" mutation path — both UIs converge on the same server action.
 */
export function LinkExistingDocumentDialog({
  clauseId,
  clauseLabel,
}: {
  clauseId: string;
  clauseLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [documents, setDocuments] = React.useState<DocOption[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [linkingId, setLinkingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && documents === null) {
      listVisibleDocuments()
        .then((docs) => setDocuments(docs as unknown as DocOption[]))
        .catch(() => setError("Failed to load documents."));
    }
  }, [open, documents]);

  const filtered = React.useMemo(() => {
    if (!documents) return [];
    const q = query.trim().toLowerCase();
    const candidates = documents.filter((d) => !d.clauseIds?.includes(clauseId));
    if (!q) return candidates;
    return candidates.filter(
      (d) => d.documentNumber.toLowerCase().includes(q) || d.title.toLowerCase().includes(q)
    );
  }, [documents, query, clauseId]);

  async function handleLink(doc: DocOption) {
    setLinkingId(doc.id);
    setError(null);
    try {
      const nextClauseIds = [...(doc.clauseIds ?? []), clauseId];
      await updateDocumentMetadata({ id: doc.id, clauseIds: nextClauseIds });
      setDocuments((prev) =>
        prev ? prev.map((d) => (d.id === doc.id ? { ...d, clauseIds: nextClauseIds } : d)) : prev
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link document.");
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="size-3.5" />
          Link existing document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link a document to {clauseLabel}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by document number or title…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {documents === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {query
                ? "No matching documents."
                : "Every visible document is already linked to this clause."}
            </p>
          ) : (
            filtered.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="truncate">
                  <span className="font-medium">{doc.documentNumber}</span> — {doc.title}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={linkingId === doc.id}
                  onClick={() => handleLink(doc)}
                >
                  {linkingId === doc.id ? "Linking…" : "Link"}
                </Button>
              </div>
            ))
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
