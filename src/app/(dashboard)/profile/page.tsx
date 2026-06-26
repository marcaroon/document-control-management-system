import { getMyProfile } from "@/app/actions/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { User, Mail, Building2, Shield } from "lucide-react";

export default async function ProfilePage() {
  const profile = await getMyProfile();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground">
          View your account information and manage your password.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Avatar + Name */}
            <div className="flex items-center gap-4">
              <span className="flex size-14 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground ring-4 ring-primary/10">
                {profile.name
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "U"}
              </span>
              <div>
                <p className="text-lg font-semibold">{profile.name}</p>
                <Badge
                  variant="secondary"
                  className="mt-0.5 text-xs font-medium"
                >
                  {profile.roleLabel}
                </Badge>
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p>{profile.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Shield className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Role</p>
                  <p>{profile.roleLabel}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Building2 className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Department</p>
                  <p>{profile.departmentName ?? "Not assigned"}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Change Password Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
