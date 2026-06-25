import { adminDb } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { getServerSession } from "@/lib/auth/session";
import { listDepartments } from "@/app/actions/organization";
import { listIsoClauses } from "@/app/actions/clauses";
import { listOrgUsers } from "@/app/actions/users";
import { hasPermission } from "@/lib/rbac/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditOrgProfileDialog } from "@/components/organization/edit-org-profile-dialog";
import { CreateDepartmentDialog } from "@/components/organization/create-department-dialog";
import { DepartmentRow } from "@/components/organization/department-row";
import { SeedClausesButton } from "@/components/clauses/seed-clauses-button";

export default async function OrganizationPage() {
  const session = await getServerSession();
  if (!session) return null;

  const orgSnap = await adminDb.collection("organizations").doc(session.orgId).get();
  const org = serializeFirestoreData(orgSnap.data());
  const departments = (await listDepartments()) as unknown as {
    id: string;
    name: string;
    headUserId: string | null;
  }[];

  const canManage = hasPermission(session.role, "org_profile", "create");
  const canManageClauses = hasPermission(session.role, "iso_clauses", "create");
  const clauseCount = canManageClauses ? (await listIsoClauses()).length : null;

  // Users are only needed (and only fetchable, per §2's users_roles
  // matrix) when the viewer can also manage departments — both
  // permissions are super_admin-only, so there is no case where one is
  // available without the other.
  const users = canManage
    ? ((await listOrgUsers()) as unknown as { uid: string; name: string }[])
    : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">Profile</CardTitle>
          {canManage && (
            <EditOrgProfileDialog
              orgId={session.orgId}
              initial={{
                name: org?.name,
                description: org?.description,
                industry: org?.industry,
                address: org?.address,
                email: org?.email,
                phone: org?.phone,
                website: org?.website,
                qualityPolicy: org?.qualityPolicy,
              }}
            />
          )}
        </CardHeader>
        <CardContent className="text-sm">
          {org?.name ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-medium">{org.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Industry</p>
                <p>{org.industry || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Description</p>
                <p>{org.description || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Email</p>
                <p>{org.email || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Phone</p>
                <p>{org.phone || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Address</p>
                <p>{org.address || "—"}</p>
              </div>
              {org.qualityPolicy && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Quality Policy</p>
                  <p className="whitespace-pre-wrap">{org.qualityPolicy}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">
              Not configured yet.{canManage ? " Click Edit to get started." : ""}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">Departments</CardTitle>
          {canManage && <CreateDepartmentDialog users={users} />}
        </CardHeader>
        <CardContent className="text-sm">
          {departments.length === 0 ? (
            <p className="text-muted-foreground">
              No departments yet.{canManage ? " Add one to assign documents and users to it." : ""}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {departments.map((d) => (
                <DepartmentRow key={d.id} department={d} users={users} canManage={canManage} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canManageClauses && clauseCount === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              ISO 9001:2015 Clauses
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              No clauses seeded yet — required before documents can be
              mapped to ISO clauses. Browse them from the ISO Clauses
              menu in the sidebar once seeded.
            </p>
            <SeedClausesButton />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
