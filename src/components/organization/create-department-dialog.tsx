"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createDepartment } from "@/app/actions/organization";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

interface UserOption {
  uid: string;
  name: string;
}

export function CreateDepartmentDialog({ users }: { users: UserOption[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [headUserId, setHeadUserId] = React.useState<string>("none");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setError("Department name is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createDepartment({
        name: name.trim(),
        headUserId: headUserId === "none" ? null : headUserId,
      });
      setOpen(false);
      setName("");
      setHeadUserId("none");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create department.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" />
          Add department
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a department</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dept-name">Name</Label>
            <Input
              id="dept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Quality Assurance"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Department head (optional)</Label>
            <Select value={headUserId} onValueChange={setHeadUserId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No head assigned</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.uid} value={u.uid}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={pending}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
