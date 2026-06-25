"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { inviteUser } from "@/app/actions/users";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/types/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { UserPlus, Copy } from "lucide-react";

interface Department {
  id: string;
  name: string;
}

export function InviteUserDialog({ departments }: { departments: Department[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role | "">("");
  const [departmentId, setDepartmentId] = React.useState<string>("none");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [createdCredential, setCreatedCredential] = React.useState<
    { email: string; tempPassword: string } | null
  >(null);

  async function handleCreate() {
    if (!role) {
      setError("Choose a role.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await inviteUser({
        name,
        email,
        role,
        departmentId: departmentId === "none" ? null : departmentId,
      });
      setCreatedCredential({ email, tempPassword: result.tempPassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setPending(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setName("");
    setEmail("");
    setRole("");
    setDepartmentId("none");
    setError(null);
    setCreatedCredential(null);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" />
          Add user
        </Button>
      </DialogTrigger>
      <DialogContent>
        {createdCredential ? (
          <>
            <DialogHeader>
              <DialogTitle>User created</DialogTitle>
              <DialogDescription>
                Share this temporary password with {createdCredential.email} now —
                it will not be shown again and is not stored anywhere.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {createdCredential.tempPassword}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigator.clipboard.writeText(createdCredential.tempPassword)}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a user</DialogTitle>
              <DialogDescription>
                Creates the account immediately with a temporary password
                you&apos;ll need to share out-of-band.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-name">Name</Label>
                <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Department (optional)</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No department</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={pending}>
                {pending ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
