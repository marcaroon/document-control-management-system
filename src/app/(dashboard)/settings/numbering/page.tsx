import { notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getOrgSettings } from "@/app/actions/settings";
import { hasPermission } from "@/lib/rbac/permissions";
import { NumberingSettingsForm } from "@/components/settings/numbering-settings-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NumberingSettingsPage() {
  const session = await getServerSession();
  if (!session || !hasPermission(session.role, "settings", "read")) notFound();

  const settings = await getOrgSettings();
  const numberingTemplates = (settings?.numberingTemplates ?? {}) as Record<string, string>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Numbering</h1>
        <p className="text-sm text-muted-foreground">
          Configure the expected document number format per document type.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Templates by document type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NumberingSettingsForm initialTemplates={numberingTemplates} />
        </CardContent>
      </Card>
    </div>
  );
}
