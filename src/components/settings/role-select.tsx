"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { changeUserRole } from "@/app/actions/users";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/types/core";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

export function RoleSelect({
  uid,
  currentRole,
  isSelf,
}: {
  uid: string;
  currentRole: Role;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleChange(value: string) {
    if (value === currentRole) return;
    setPending(true);
    setError(null);
    try {
      await changeUserRole({ uid, role: value as Role });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change role.");
    } finally {
      setPending(false);
    }
  }

  // Self-demotion is blocked server-side too (see app/actions/users.ts
  // changeUserRole) — disabling the control here is just to avoid the
  // confusing "click it, wait, get an error" round-trip for a case that
  // can never succeed.
  if (isSelf) {
    return (
      <span className="text-sm text-muted-foreground">
        {ROLE_LABELS[currentRole]} (you)
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Select value={currentRole} onValueChange={handleChange}>
        <SelectTrigger className="w-56" disabled={pending}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
