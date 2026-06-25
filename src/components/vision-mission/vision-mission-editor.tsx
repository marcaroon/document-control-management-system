"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  proposeVisionMissionEdit,
  approveVisionMissionEdit,
  rejectVisionMissionEdit,
} from "@/app/actions/vision-mission";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { VisionMissionType } from "@/lib/types/core";

interface Props {
  type: VisionMissionType;
  record: {
    id: string;
    content: string;
    version: number;
    status: "draft" | "approved";
  } | null;
  canPropose: boolean;
  canApprove: boolean;
}

export function VisionMissionEditor({ type, record, canPropose, canApprove }: Props) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [content, setContent] = React.useState(record?.content ?? "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isPendingApproval = record?.status === "draft";

  async function handlePropose() {
    if (!content.trim()) {
      setError("Content cannot be empty.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await proposeVisionMissionEdit({ type, content });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to propose edit.");
    } finally {
      setPending(false);
    }
  }

  async function handleApprove() {
    if (!record) return;
    setPending(true);
    setError(null);
    try {
      await approveVisionMissionEdit({ id: record.id });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve.");
    } finally {
      setPending(false);
    }
  }

  async function handleReject() {
    if (!record) return;
    setPending(true);
    setError(null);
    try {
      await rejectVisionMissionEdit({ id: record.id });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium capitalize text-muted-foreground">{type}</h2>
        <div className="flex items-center gap-2">
          {isPendingApproval && <Badge variant="outline">Pending approval</Badge>}
          {record && <span className="text-xs text-muted-foreground">v{record.version}</span>}
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-32"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handlePropose} disabled={pending}>
              {pending ? "Submitting…" : "Propose this edit"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setContent(record?.content ?? "");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm">
            {record?.content || (
              <span className="text-muted-foreground">No {type} statement yet.</span>
            )}
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            {canPropose && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {record ? "Propose an edit" : `Write the ${type}`}
              </Button>
            )}
            {canApprove && isPendingApproval && (
              <>
                <Button size="sm" onClick={handleApprove} disabled={pending}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={handleReject} disabled={pending}>
                  Reject
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
