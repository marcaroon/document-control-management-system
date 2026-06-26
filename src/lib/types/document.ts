import type {
  DocumentStatus,
  DocumentType,
  ApprovalDecision,
  ServerTimestamp,
} from "./core";

/** organizations/{orgId} */
export interface Organization {
  id: string;
  name: string;
  logoUrl?: string;
  description?: string;
  industry?: string;
  address?: string;
  email?: string;
  phone?: string;
  website?: string;
  orgStructureImageUrl?: string;
  qualityPolicy?: string;
  createdAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
}

/** users/{uid} — uid is the Firebase Auth UID, doc ID === uid, never a separate field */
export interface AppUser {
  uid: string;
  orgId: string;
  name: string;
  email: string;
  role: import("./core").Role;
  departmentId: string | null;
  photoUrl?: string;
  isActive: boolean;
  createdAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
}

/** departments/{id} */
export interface Department {
  id: string;
  orgId: string;
  name: string;
  headUserId: string | null;
  createdAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
}

/** documents/{id} */
export interface QmsDocument {
  id: string;
  orgId: string;
  documentNumber: string;
  title: string;
  description?: string;
  type: DocumentType;
  clauseIds: string[];
  departmentId: string;
  processOwnerId: string;
  currentRevisionNumber: number;
  currentFileUrl: string;
  currentVersionId: string;
  status: DocumentStatus;
  effectiveDate: ServerTimestamp;
  reviewDate: ServerTimestamp;
  keywords: string[];
  isArchived: boolean;
  /** Denormalized from the most recent document_approvals decision —
   *  set on reject/revision_requested, cleared on re-submit or approve. */
  lastApprovalDecision?: "rejected" | "revision_requested" | null;
  lastApprovalNotes?: string | null;
  lastApprovalDecidedBy?: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
}

/**
 * document_versions/{id} — APPEND-ONLY, never updated/deleted.
 * Document ID is deterministic: `${documentId}_v${revisionNumber}`.
 * This is a deliberate deviation from a free-form auto ID — see
 * lib/firebase/admin.ts createDocumentVersion() for the rationale
 * (defense-in-depth against accidental overwrite, not just a naming nicety).
 */
export interface DocumentVersion {
  id: string;
  documentId: string;
  revisionNumber: number;
  /** Cloudinary public_id (NOT a full URL) — resolved to a signed
   *  download/preview URL on demand via getDownloadUrl() in
   *  app/actions/versions.ts. Storage backend is Cloudinary per
   *  explicit decision; this was a Firebase Storage path in earlier
   *  versions of this app. */
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  /** Cloudinary resource type the asset was actually uploaded as —
   *  "image" for PDFs (enables page-preview transformations), "raw"
   *  for everything else (download-only). See resolveResourceType in
   *  lib/cloudinary/server.ts. */
  resourceType: "image" | "raw";
  changeDescription: string;
  changedBy: string;
  createdAt: ServerTimestamp;
}

/** document_approvals/{id} — APPEND-ONLY */
export interface DocumentApproval {
  id: string;
  documentId: string;
  revisionNumber: number;
  requestedBy: string;
  requestedAt: ServerTimestamp;
  approverId: string | null;
  decision: ApprovalDecision;
  decisionNotes?: string;
  decidedAt: ServerTimestamp | null;
}

/** document_reviews/{id} — periodic review cycle, distinct from approval workflow */
export interface DocumentReview {
  id: string;
  documentId: string;
  reviewerId: string;
  reviewDate: ServerTimestamp;
  outcome: "confirmed_current" | "needs_revision" | "needs_obsolescence";
  notes?: string;
  createdAt: ServerTimestamp;
}

/** iso_clauses/{id} — seeded per-org copy, see §3 "ISO clauses: template vs per-org copy" */
export interface IsoClause {
  id: string;
  orgId: string;
  clauseNumber: string;
  title: string;
  description?: string;
  objective?: string;
  parentClauseId: string | null;
}

/** settings/{orgId} */
export interface OrgSettings {
  orgId: string;
  numberingTemplates: Record<string, string>;
  backupSchedule?: { frequency: "daily" | "weekly"; lastRunAt: ServerTimestamp };
  themeConfig?: Record<string, string>;
}
