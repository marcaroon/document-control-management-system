import type { ServerTimestamp, Module, NotificationType, VisionMissionType, VisionMissionStatus } from "./core";

/**
 * audit_logs/{id} — APPEND-ONLY, IMMUTABLE.
 *
 * Critical invariant (see §4 Rule 1-3 and §11 handoff note):
 * - NEVER written from client SDK. Only from server actions via Admin SDK.
 * - Written in the SAME transaction/batch as the mutation it records.
 *   If this write fails, the mutation must fail too (see
 *   lib/firebase/admin.ts runAuditedTransaction()).
 * - Security rules deny ALL client writes, including Super Admin (§4 Rule 2).
 */
export interface AuditLog {
  id: string;
  orgId: string;
  userId: string;
  userName: string;
  action: string; // e.g. "document.create", "approval.approve", "user.role_change"
  module: Module;
  targetId: string;
  targetType: string; // e.g. "document", "user", "vision_mission"
  oldValue: unknown | null;
  newValue: unknown | null;
  timestamp: ServerTimestamp;
}

/** notifications/{id} */
export interface AppNotification {
  id: string;
  userId: string;
  orgId: string;
  type: NotificationType;
  relatedDocumentId?: string;
  message: string;
  isRead: boolean;
  createdAt: ServerTimestamp;
}

/** vision_mission/{id} */
export interface VisionMission {
  id: string;
  orgId: string;
  type: VisionMissionType;
  content: string;
  version: number;
  status: VisionMissionStatus;
  approvedBy: string | null;
  approvedAt: ServerTimestamp | null;
}

/** vision_mission/{id}/history/{id} — APPEND-ONLY subcollection */
export interface VisionMissionHistory {
  id: string;
  content: string;
  version: number;
  changedBy: string;
  changedAt: ServerTimestamp;
}
