"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  submitForReview,
  approveDocument,
  rejectDocument,
  requestRevision,
  startReview,
  confirmDocumentCurrent,
  supersedeDocument,
} from "@/app/actions/approvals";
import { archiveDocument } from "@/app/actions/documents";
import { hasPermission, canTransition } from "@/lib/rbac/permissions";
import type { Role, DocumentStatus } from "@/lib/types/core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, RotateCcw, Send, RefreshCcw, Archive, History } from "lucide-react";

interface Props {
  documentId: string;
  status: DocumentStatus;
  role: Role;
  pendingApprovalId: string | null;
}

/**
 * Decides which workflow buttons to show. This UI-level filtering is a
 * convenience, not a security boundary — every action below re-checks
 * hasPermission() and canTransition() server-side regardless of what
 * this component renders. Hiding a button a role can't use is about
 * avoiding a confusing "click it and get a FORBIDDEN error" experience,
 * not about access control.
 */
export function WorkflowActions({ documentId, status, role, pendingApprovalId }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = React.useState("");
  const [decisionDialogOpen, setDecisionDialogOpen] = React.useState<
    "reject" | "request_revision" | null
  >(null);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }

  const canSubmit =
    status === "draft" &&
    canTransition(status, "submit_for_review") &&
    hasPermission(role, "approvals", "submit_for_review");

  const canDecide =
    status === "submitted_for_review" &&
    !!pendingApprovalId &&
    hasPermission(role, "approvals", "approve");

  const canStartReview =
    status === "effective" &&
    canTransition(status, "start_review") &&
    hasPermission(role, "documents", "update");

  const canConfirmCurrent =
    status === "under_review" &&
    canTransition(status, "confirm_current") &&
    hasPermission(role, "documents", "update");

  const canSupersede =
    status === "effective" &&
    canTransition(status, "supersede") &&
    hasPermission(role, "documents", "archive");

  const canArchive =
    (status === "obsolete" || status === "draft") &&
    hasPermission(role, "documents", "archive");

  if (!canSubmit && !canDecide && !canStartReview && !canConfirmCurrent && !canSupersede && !canArchive) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canSubmit && (
          <Button
            disabled={pending}
            onClick={() => run(() => submitForReview({ documentId }))}
          >
            <Send className="size-4" />
            Submit for review
          </Button>
        )}

        {canDecide && pendingApprovalId && (
          <>
            <Button
              disabled={pending}
              onClick={() =>
                run(() => approveDocument({ documentId, approvalId: pendingApprovalId }))
              }
            >
              <CheckCircle2 className="size-4" />
              Approve
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setDecisionDialogOpen("request_revision")}
            >
              <RotateCcw className="size-4" />
              Request revision
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => setDecisionDialogOpen("reject")}
            >
              <XCircle className="size-4" />
              Reject
            </Button>
          </>
        )}

        {canStartReview && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => startReview({ documentId }))}
          >
            <History className="size-4" />
            Start review
          </Button>
        )}

        {canConfirmCurrent && (
          <Button
            disabled={pending}
            onClick={() => run(() => confirmDocumentCurrent({ documentId }))}
          >
            <CheckCircle2 className="size-4" />
            Confirm still current
          </Button>
        )}

        {canSupersede && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => supersedeDocument({ documentId }))}
          >
            <RefreshCcw className="size-4" />
            Mark obsolete
          </Button>
        )}

        {canArchive && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => archiveDocument(documentId))}
          >
            <Archive className="size-4" />
            Archive
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog
        open={decisionDialogOpen !== null}
        onOpenChange={(open) => !open && setDecisionDialogOpen(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionDialogOpen === "reject" ? "Reject document" : "Request revision"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={decisionNotes}
            onChange={(e) => setDecisionNotes(e.target.value)}
            placeholder="Explain what needs to change…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialogOpen(null)}>
              Cancel
            </Button>
            <Button
              variant={decisionDialogOpen === "reject" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => {
                if (!pendingApprovalId) return;
                const fn = decisionDialogOpen === "reject" ? rejectDocument : requestRevision;
                run(() =>
                  fn({ documentId, approvalId: pendingApprovalId, notes: decisionNotes })
                ).then(() => {
                  setDecisionDialogOpen(null);
                  setDecisionNotes("");
                });
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
