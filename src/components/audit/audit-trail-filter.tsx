"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { MODULES } from "@/lib/types/core";

const MODULE_LABELS: Record<string, string> = {
  documents: "Documents",
  revisions: "Revisions",
  approvals: "Approvals",
  iso_clauses: "ISO Clauses",
  org_profile: "Organization Profile",
  vision_mission: "Vision & Mission",
  audit_trail: "Audit Trail",
  notifications: "Notifications",
  settings: "Settings",
  users_roles: "Users & Roles",
};

export function AuditTrailFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentModule = searchParams.get("module") ?? "all";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === "all") {
      params.delete("module");
    } else {
      params.set("module", value);
    }
    router.push(`/audit-trail?${params.toString()}`);
  }

  return (
    <Select value={currentModule} onValueChange={handleChange}>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="All modules" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All modules</SelectItem>
        {MODULES.map((m) => (
          <SelectItem key={m} value={m}>
            {MODULE_LABELS[m]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
