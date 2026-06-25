import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listIsoClauses } from "@/app/actions/clauses";
import { hasPermission } from "@/lib/rbac/permissions";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { NotificationBell } from "@/components/shared/notification-bell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  // Fetched here (Server Component) rather than inside the sidebar
  // client component, so the sidebar's clause sub-menu is present on
  // first paint instead of flashing empty then populating after a
  // client-side fetch. Only fetched at all if the role can read
  // clauses — same gate the sidebar link itself already uses.
  const rawClauses = hasPermission(session.role, "iso_clauses", "read")
    ? await listIsoClauses()
    : [];
  const clauses = rawClauses as unknown as {
    id: string;
    clauseNumber: string;
    title: string;
    parentClauseId: string | null;
  }[];

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar role={session.role} clauses={clauses} />
      <main className="flex-1 bg-muted/30">
        <div className="sticky top-0 z-10 flex justify-end border-b bg-card px-6 py-2">
          <NotificationBell />
        </div>
        <div className="mx-auto max-w-6xl p-6">{children}</div>
      </main>
    </div>
  );
}
