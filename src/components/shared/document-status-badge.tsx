import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from "@/lib/types/core";

const STATUS_STYLES: Record<DocumentStatus, string> = {
  draft: "bg-status-draft-bg text-status-draft border-transparent",
  submitted_for_review: "bg-status-review-bg text-status-review border-transparent",
  under_review: "bg-status-review-bg text-status-review border-transparent",
  effective: "bg-status-effective-bg text-status-effective border-transparent",
  obsolete: "bg-status-obsolete-bg text-status-obsolete border-transparent",
  archived: "bg-status-archived-bg text-status-archived border-transparent",
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[status])}>
      {DOCUMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
