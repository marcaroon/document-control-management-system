/**
 * Core domain enums and shared types.
 *
 * These are the single source of truth for role names, document statuses,
 * and approval decisions. Both server actions (lib/rbac/permissions.ts) and
 * Firestore security rules (firestore.rules) must stay in sync with the
 * string values here — if you rename a role, grep the whole repo, including
 * firestore.rules, which is NOT type-checked and will not warn you.
 */

// §2 RBAC Matrix — exactly 5 roles, static enum for v1 (risk #5: defer dynamic roles)
export const ROLES = [
  "super_admin",
  "document_controller",
  "management_representative",
  "department_user",
  "read_only",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  document_controller: "Document Controller",
  management_representative: "Management Representative",
  department_user: "Department User",
  read_only: "Read Only",
};

// §5 Document lifecycle state machine — exact transitions enforced in
// lib/rbac/permissions.ts -> canTransitionDocument()
export const DOCUMENT_STATUSES = [
  "draft",
  "submitted_for_review",
  "under_review",
  "effective",
  "obsolete",
  "archived",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Draft",
  submitted_for_review: "Submitted for Review",
  under_review: "Under Review",
  effective: "Effective",
  obsolete: "Obsolete",
  archived: "Archived",
};

// §3 document_approvals.decision
export const APPROVAL_DECISIONS = [
  "pending",
  "approved",
  "rejected",
  "revision_requested",
] as const;

export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

// §3 documents.type — fixed enum per the flagged design-conflict resolution
// (spec §3: "Recommendation: fixed enum for v1")
export const DOCUMENT_TYPES = [
  "quality_manual",
  "procedure",
  "work_instruction",
  "form",
  "policy",
  "record",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  quality_manual: "Quality Manual",
  procedure: "Procedure",
  work_instruction: "Work Instruction",
  form: "Form",
  policy: "Policy",
  record: "Record",
};

// §3 notifications.type
export const NOTIFICATION_TYPES = [
  "pending_approval",
  "approval_decided", // added in Phase 2: distinct from new_revision so an
                       // approve/reject/request_revision outcome isn't
                       // misrepresented as "someone uploaded a new file"
  "upcoming_review",
  "expired_document",
  "new_revision",
  "new_upload",
  "role_changed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// §3 vision_mission.type / status
export const VISION_MISSION_TYPES = ["vision", "mission"] as const;
export type VisionMissionType = (typeof VISION_MISSION_TYPES)[number];

export const VISION_MISSION_STATUSES = ["draft", "approved"] as const;
export type VisionMissionStatus = (typeof VISION_MISSION_STATUSES)[number];

/** Modules referenced by the RBAC matrix in §2 — used as keys into PERMISSIONS. */
export const MODULES = [
  "documents",
  "revisions",
  "approvals",
  "iso_clauses",
  "org_profile",
  "vision_mission",
  "audit_trail",
  "notifications",
  "settings",
  "users_roles",
] as const;

export type Module = (typeof MODULES)[number];

/** Actions referenced by the RBAC matrix in §2. */
export type Action =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "archive"
  | "approve"
  | "reject"
  | "request_revision"
  | "submit_for_review"
  | "propose";

/** Server timestamp placeholder type — actual value is a Firestore Timestamp. */
export type ServerTimestamp = { seconds: number; nanoseconds: number } | null;
