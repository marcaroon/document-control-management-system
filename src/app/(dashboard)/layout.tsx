import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listIsoClauses } from "@/app/actions/clauses";
import { hasPermission } from "@/lib/rbac/permissions";
import { adminDb } from "@/lib/firebase/admin";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { NotificationBell } from "@/components/shared/notification-bell";
import { UserMenu } from "@/components/shared/user-menu";

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

  // Fetch the user's display name for the UserMenu avatar. Falls back
  // to the email from the session token if the Firestore doc doesn't
  // have a name yet (e.g. during the brief window between account
  // creation and the first Firestore write completing).
  const userSnap = await adminDb.collection("users").doc(session.uid).get();
  const userName = (userSnap.data()?.name as string) ?? session.email ?? "User";

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar role={session.role} clauses={clauses} />
      <main className="flex-1 bg-muted/30">
        <div className="sticky top-0 z-10 flex items-center justify-end gap-1 border-b bg-card px-6 py-2">
          <NotificationBell />
          <UserMenu
            name={userName}
            email={session.email ?? ""}
            role={session.role}
          />
        </div>
        <div className="mx-auto max-w-6xl p-6">{children}</div>
      </main>
    </div>
  );
}
