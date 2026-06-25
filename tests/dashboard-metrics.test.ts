import { describe, it, expect } from "vitest";
import { computeDashboardMetrics, type RawDocForMetrics } from "@/lib/dashboard/metrics";

describe("computeDashboardMetrics", () => {
  it("counts documents by status correctly", () => {
    const docs: RawDocForMetrics[] = [
      { status: "draft", departmentId: "d1", reviewDate: null },
      { status: "draft", departmentId: "d1", reviewDate: null },
      { status: "effective", departmentId: "d2", reviewDate: null },
    ];

    const result = computeDashboardMetrics(docs, new Map([["d1", "QA"], ["d2", "Production"]]), 0);

    expect(result.statusCounts.draft).toBe(2);
    expect(result.statusCounts.effective).toBe(1);
    expect(result.statusCounts.archived).toBe(0);
    expect(result.totalVisible).toBe(3);
  });

  it("includes every status in statusChartData even when count is zero", () => {
    const result = computeDashboardMetrics([], new Map(), 0);
    expect(result.statusChartData).toHaveLength(6);
    expect(result.statusChartData.every((d) => d.count === 0)).toBe(true);
  });

  it("groups documents by department name, not departmentId", () => {
    const docs: RawDocForMetrics[] = [
      { status: "effective", departmentId: "dept-abc", reviewDate: null },
      { status: "draft", departmentId: "dept-abc", reviewDate: null },
      { status: "effective", departmentId: "dept-xyz", reviewDate: null },
    ];

    const result = computeDashboardMetrics(
      docs,
      new Map([["dept-abc", "Quality Assurance"], ["dept-xyz", "Production"]]),
      0
    );

    const qa = result.departmentChartData.find((d) => d.departmentName === "Quality Assurance");
    const prod = result.departmentChartData.find((d) => d.departmentName === "Production");
    expect(qa?.count).toBe(2);
    expect(prod?.count).toBe(1);
  });

  it('falls back to "Unassigned" for a departmentId not in the lookup map', () => {
    const docs: RawDocForMetrics[] = [
      { status: "draft", departmentId: "missing-dept", reviewDate: null },
    ];

    const result = computeDashboardMetrics(docs, new Map(), 0);
    expect(result.departmentChartData).toEqual([{ departmentName: "Unassigned", count: 1 }]);
  });

  it("counts a document as due for review only if reviewDate is in the past AND status is effective or under_review", () => {
    const nowSeconds = 1_700_000_000;
    const docs: RawDocForMetrics[] = [
      { status: "effective", departmentId: "d1", reviewDate: { seconds: nowSeconds - 1000 } },
      { status: "under_review", departmentId: "d1", reviewDate: { seconds: nowSeconds - 1 } },
      { status: "effective", departmentId: "d1", reviewDate: { seconds: nowSeconds + 1000 } },
      { status: "draft", departmentId: "d1", reviewDate: { seconds: nowSeconds - 1000 } },
      { status: "effective", departmentId: "d1", reviewDate: null },
    ];

    const result = computeDashboardMetrics(docs, new Map(), nowSeconds);
    expect(result.dueForReviewCount).toBe(2);
  });

  it("treats a reviewDate exactly equal to now as due (inclusive boundary)", () => {
    const nowSeconds = 1_700_000_000;
    const docs: RawDocForMetrics[] = [
      { status: "effective", departmentId: "d1", reviewDate: { seconds: nowSeconds } },
    ];

    const result = computeDashboardMetrics(docs, new Map(), nowSeconds);
    expect(result.dueForReviewCount).toBe(1);
  });

  it("handles an empty document list without throwing", () => {
    const result = computeDashboardMetrics([], new Map(), Date.now());
    expect(result.totalVisible).toBe(0);
    expect(result.dueForReviewCount).toBe(0);
    expect(result.departmentChartData).toEqual([]);
  });
});
