import Link from "next/link";
import { getServerSession } from "@/lib/auth/session";
import { listPendingApprovals } from "@/app/actions/approvals";
import { getDashboardMetrics } from "@/app/actions/dashboard-metrics";
import { listRecentDocuments, listFavoriteDocuments } from "@/app/actions/favorites";
import { hasPermission } from "@/lib/rbac/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/types/core";
import { StatusDistributionChart } from "@/components/dashboard/status-distribution-chart";
import { DepartmentBreakdownChart } from "@/components/dashboard/department-breakdown-chart";
import { Clock, Star } from "lucide-react";

export default async function DashboardPage() {
  const session = await getServerSession();

  const [pendingApprovals, metrics, recentDocs, favoriteDocs] = await Promise.all([
    session && hasPermission(session.role, "approvals", "read")
      ? listPendingApprovals()
      : Promise.resolve(null),
    getDashboardMetrics(),
    listRecentDocuments(),
    listFavoriteDocuments(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {session?.email} · {session ? ROLE_LABELS[session.role] : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Effective Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {metrics.statusCounts.effective}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {pendingApprovals !== null ? pendingApprovals.length : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Due for Review
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {metrics.dueForReviewCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Draft Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {metrics.statusCounts.draft}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Documents by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatusDistributionChart data={metrics.statusChartData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Documents by Department
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DepartmentBreakdownChart data={metrics.departmentChartData} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="size-4" />
              Recently Viewed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Documents you open will show up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recentDocs.map((doc) => (
                  <li key={doc.documentId} className="text-sm">
                    <Link href={`/documents/${doc.documentId}`} className="hover:underline">
                      <span className="font-medium">{doc.documentNumber}</span> — {doc.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Star className="size-4" />
              Favorites
            </CardTitle>
          </CardHeader>
          <CardContent>
            {favoriteDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Star a document from its page to pin it here.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {favoriteDocs.map((doc) => (
                  <li key={doc.documentId} className="text-sm">
                    <Link href={`/documents/${doc.documentId}`} className="hover:underline">
                      <span className="font-medium">{doc.documentNumber}</span> — {doc.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Reflects the {metrics.totalVisible} document{metrics.totalVisible === 1 ? "" : "s"}{" "}
        visible to your role. &quot;Due for review&quot; is informational — review-date
        transitions remain a manual action (see Phase 3 decisions), not an
        automated trigger.
      </p>
    </div>
  );
}
