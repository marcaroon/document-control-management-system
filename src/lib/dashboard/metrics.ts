import { DOCUMENT_STATUSES, DOCUMENT_STATUS_LABELS, type DocumentStatus } from "@/lib/types/core";

/**
 * Pure aggregation logic for the dashboard, per §9 Phase 4 ("Dashboard
 * charts... Dashboard reflects live data"). Lives outside any
 * "use server" file specifically so it can take a Map parameter and be
 * called directly from tests — Server Actions can only accept
 * JSON-serializable arguments when invoked from client code, which a
 * Map is not. The actual Server Action (app/actions/dashboard-metrics.ts
 * getDashboardMetrics) is a thin Firestore-fetching wrapper around this.
 */

export interface RawDocForMetrics {
  status: DocumentStatus;
  departmentId: string;
  reviewDate: string | { seconds: number } | null;
}

export interface DashboardMetrics {
  statusCounts: Record<DocumentStatus, number>;
  statusChartData: { status: string; label: string; count: number }[];
  departmentChartData: { departmentName: string; count: number }[];
  dueForReviewCount: number;
  totalVisible: number;
}

/**
 * "Due for review" is computed from reviewDate <= now AND status in
 * (effective, under_review) — informational only, consistent with the
 * explicit decision that review-date transitions are manual, not
 * automated (see lib/rbac/permissions.ts comment above getNextStatus).
 * This function surfaces the count; it does not transition anything.
 */
export function computeDashboardMetrics(
  docs: RawDocForMetrics[],
  departmentNameById: Map<string, string>,
  nowSeconds: number
): DashboardMetrics {
  const statusCounts = Object.fromEntries(
    DOCUMENT_STATUSES.map((s) => [s, 0])
  ) as Record<DocumentStatus, number>;

  const countByDepartment = new Map<string, number>();
  let dueForReviewCount = 0;

  for (const doc of docs) {
    statusCounts[doc.status]++;

    const deptName = departmentNameById.get(doc.departmentId) ?? "Unassigned";
    countByDepartment.set(deptName, (countByDepartment.get(deptName) ?? 0) + 1);

    const reviewDateSeconds =
      typeof doc.reviewDate === "string"
        ? Math.floor(new Date(doc.reviewDate).getTime() / 1000)
        : doc.reviewDate?.seconds ?? null;
    if (
      reviewDateSeconds !== null &&
      reviewDateSeconds <= nowSeconds &&
      (doc.status === "effective" || doc.status === "under_review")
    ) {
      dueForReviewCount++;
    }
  }

  return {
    statusCounts,
    statusChartData: DOCUMENT_STATUSES.map((s) => ({
      status: s,
      label: DOCUMENT_STATUS_LABELS[s],
      count: statusCounts[s],
    })),
    departmentChartData: Array.from(countByDepartment.entries()).map(
      ([departmentName, count]) => ({ departmentName, count })
    ),
    dueForReviewCount,
    totalVisible: docs.length,
  };
}
