import { getServerSession } from "@/lib/auth/session";
import { getVisionMission } from "@/app/actions/vision-mission";
import { hasPermission } from "@/lib/rbac/permissions";
import { VisionMissionEditor } from "@/components/vision-mission/vision-mission-editor";
import { Card, CardContent } from "@/components/ui/card";
import type { VisionMissionType, VisionMissionStatus } from "@/lib/types/core";

interface VmRow {
  id: string;
  type: VisionMissionType;
  content: string;
  version: number;
  status: VisionMissionStatus;
}

export default async function VisionMissionPage() {
  const session = await getServerSession();
  if (!session) return null;

  const rawRecords = await getVisionMission();
  const records = rawRecords as unknown as VmRow[];

  const vision = records.find((r) => r.type === "vision") ?? null;
  const mission = records.find((r) => r.type === "mission") ?? null;

  const canPropose = hasPermission(session.role, "vision_mission", "propose");
  const canApprove = hasPermission(session.role, "vision_mission", "approve");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vision &amp; Mission</h1>
        <p className="text-sm text-muted-foreground">
          Edits are proposed by a Document Controller or Super Admin and
          take effect once approved by a Management Representative.
        </p>
      </div>

      <Card>
        <CardContent className="py-5">
          <VisionMissionEditor
            type="vision"
            record={vision}
            canPropose={canPropose}
            canApprove={canApprove}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-5">
          <VisionMissionEditor
            type="mission"
            record={mission}
            canPropose={canPropose}
            canApprove={canApprove}
          />
        </CardContent>
      </Card>
    </div>
  );
}
