import { notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listOrgUsers } from "@/app/actions/users";
import { listDepartments } from "@/app/actions/organization";
import { hasPermission } from "@/lib/rbac/permissions";
import { ROLE_LABELS, type Role } from "@/lib/types/core";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RoleSelect } from "@/components/settings/role-select";
import { InviteUserDialog } from "@/components/settings/invite-user-dialog";

interface UserRow {
  uid: string;
  name: string;
  email: string;
  role: Role;
  departmentId: string | null;
  isActive: boolean;
}

export default async function AccessControlPage() {
  const session = await getServerSession();
  if (!session || !hasPermission(session.role, "users_roles", "read")) notFound();

  const rawUsers = await listOrgUsers();
  const users = rawUsers as unknown as UserRow[];

  const rawDepartments = await listDepartments();
  const departments = rawDepartments as unknown as { id: string; name: string }[];
  const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));

  const canManage = hasPermission(session.role, "users_roles", "create");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Access Control</h1>
          <p className="text-sm text-muted-foreground">
            {users.length} user{users.length === 1 ? "" : "s"} in this organization.
          </p>
        </div>
        {canManage && <InviteUserDialog departments={departments} />}
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.uid}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell className="text-muted-foreground">
                  {user.departmentId ? departmentNameById.get(user.departmentId) ?? "—" : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? "outline" : "secondary"}>
                    {user.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canManage ? (
                    <RoleSelect
                      uid={user.uid}
                      currentRole={user.role}
                      isSelf={user.uid === session.uid}
                    />
                  ) : (
                    ROLE_LABELS[user.role]
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Changing a role immediately revokes the user&apos;s active session —
        they&apos;ll be signed out and need to log in again with their new
        permissions.
      </p>
    </div>
  );
}
