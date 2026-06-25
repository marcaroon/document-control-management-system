"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateOrganizationProfile } from "@/app/actions/organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

interface OrgProfile {
  name?: string;
  description?: string;
  industry?: string;
  address?: string;
  email?: string;
  phone?: string;
  website?: string;
  qualityPolicy?: string;
}

export function EditOrgProfileDialog({
  orgId,
  initial,
}: {
  orgId: string;
  initial: OrgProfile;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<OrgProfile>(initial);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function set<K extends keyof OrgProfile>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.name?.trim()) {
      setError("Organization name is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await updateOrganizationProfile(orgId, {
        name: form.name.trim(),
        description: form.description || undefined,
        industry: form.industry || undefined,
        address: form.address || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        website: form.website || "",
        qualityPolicy: form.qualityPolicy || undefined,
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update organization profile.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setForm(initial); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit organization profile</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-name">Name</Label>
            <Input id="org-name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-industry">Industry</Label>
            <Input
              id="org-industry"
              value={form.industry ?? ""}
              onChange={(e) => set("industry", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-description">Description</Label>
            <Textarea
              id="org-description"
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-address">Address</Label>
            <Input
              id="org-address"
              value={form.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-email">Email</Label>
              <Input
                id="org-email"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-phone">Phone</Label>
              <Input
                id="org-phone"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-website">Website</Label>
            <Input
              id="org-website"
              placeholder="https://"
              value={form.website ?? ""}
              onChange={(e) => set("website", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-quality-policy">Quality Policy</Label>
            <Textarea
              id="org-quality-policy"
              className="min-h-24"
              value={form.qualityPolicy ?? ""}
              onChange={(e) => set("qualityPolicy", e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
