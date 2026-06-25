"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateDepartment, deleteDepartment } from "@/app/actions/organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Pencil, Trash2 } from "lucide-react";

interface UserOption {
  uid: string;
  name: string;
}

export function DepartmentRow({
  department,
  users,
  canManage,
}: {
  department: { id: string; name: string; headUserId: string | null };
  users: UserOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [name, setName] = React.useState(department.name);
  const [headUserId, setHeadUserId] = React.useState(department.headUserId ?? "none");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const headName = department.headUserId
    ? users.find((u) => u.uid === department.headUserId)?.name ?? "Unknown"
    : null;

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await updateDepartment({
        id: department.id,
        name: name.trim(),
        headUserId: headUserId === "none" ? null : headUserId,
      });
      setEditOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update department.");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    setPending(true);
    setDeleteError(null);
    try {
      await deleteDepartment(department.id);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete department.");
      setPending(false);
    }
  }

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span>
          {department.name}
          {headName && <span className="text-muted-foreground"> · Head: {headName}</span>}
        </span>

        {canManage && (
          <div className="flex gap-1">
            <Dialog
              open={editOpen}
              onOpenChange={(v) => {
                setEditOpen(v);
                if (v) {
                  setName(department.name);
                  setHeadUserId(department.headUserId ?? "none");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7">
                  <Pencil className="size-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit department</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
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
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={pending}>
                    {pending ? "Saving…" : "Save"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
    </li>
  );
}
