import { AlertTriangle, XOctagon } from "lucide-react";

interface DecisionBannerProps {
  decision: "rejected" | "revision_requested";
  notes: string | null;
  reviewerName: string | null;
}

const CONFIG = {
  revision_requested: {
    icon: AlertTriangle,
    title: "Revision Requested",
    subtitle: "Please address the reviewer's feedback and resubmit this document.",
    borderClass: "border-l-decision-revision",
    bgClass: "bg-decision-revision-bg",
    iconClass: "text-decision-revision",
    titleClass: "text-decision-revision",
  },
  rejected: {
    icon: XOctagon,
    title: "Document Rejected",
    subtitle:
      "This document was rejected by the reviewer. Review the feedback before making changes.",
    borderClass: "border-l-decision-rejected",
    bgClass: "bg-decision-rejected-bg",
    iconClass: "text-decision-rejected",
    titleClass: "text-decision-rejected",
  },
} as const;

/**
 * Contextual banner shown on the document detail page when the last
 * approval decision was a rejection or revision request. The banner
 * disappears once the document is re-submitted for review (the server
 * clears `lastApprovalDecision` at that point).
 */
export function DecisionBanner({ decision, notes, reviewerName }: DecisionBannerProps) {
  const cfg = CONFIG[decision];
  const Icon = cfg.icon;

  return (
    <div
      className={`rounded-lg ${cfg.borderClass} ${cfg.bgClass} p-4`}
      role="alert"
    >
      <div className="flex gap-3">
        <Icon className={`size-5 shrink-0 mt-0.5 ${cfg.iconClass}`} />
        <div className="flex flex-col gap-1 min-w-0">
          <p className={`text-sm font-semibold ${cfg.titleClass}`}>
            {cfg.title}
          </p>
          <p className={`text-sm ${cfg.titleClass} opacity-80`}>
            {cfg.subtitle}
          </p>
          {notes && (
            <blockquote
              className={`mt-2 border-l-2 pl-3 text-sm italic ${cfg.titleClass} opacity-90`}
            >
              &ldquo;{notes}&rdquo;
            </blockquote>
          )}
          {reviewerName && (
            <p className={`mt-1 text-xs ${cfg.titleClass} opacity-60`}>
              — {reviewerName}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
