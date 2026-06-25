"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateDocumentMetadata } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ClausePickerList, type ClauseOption } from "@/components/documents/clause-picker-list";
import { Tag } from "lucide-react";

export function ClauseTagger({
  documentId,
  allClauses,
  selectedClauseIds,
  canEdit,
}: {
  documentId: string;
  allClauses: ClauseOption[];
  selectedClauseIds: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>(selectedClauseIds);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedClauses = allClauses.filter((c) => selectedClauseIds.includes(c.id));

  function toggle(clauseId: string) {
    setSelected((prev) =>
      prev.includes(clauseId) ? prev.filter((id) => id !== clauseId) : [...prev, clauseId]
    );
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    try {
      await updateDocumentMetadata({ id: documentId, clauseIds: selected });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update clauses.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedClauses.length === 0 && (
        <span className="text-sm text-muted-foreground">No clauses tagged.</span>
      )}
      {selectedClauses.map((c) => (
        <Badge key={c.id} variant="secondary">
          {c.clauseNumber} {c.title}
        </Badge>
      ))}

      {canEdit && (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setSelected(selectedClauseIds); }}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Tag className="size-3.5" />
              Edit
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tag ISO clauses</DialogTitle>
            </DialogHeader>

            <ClausePickerList allClauses={allClauses} selected={selected} onToggle={toggle} />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
