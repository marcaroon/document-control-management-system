import type { Role, Module, Action, DocumentStatus } from "@/lib/types/core";

/**
 * RBAC permission matrix — code form of spec §2.
 *
 * THIS FILE IS THE SOURCE OF TRUTH. firestore.rules expresses the same
 * matrix in a different language (security rules can't import TS), so any
 * change here must be mirrored there by hand. There is no build step that
 * keeps them in sync automatically — that's a known gap, not an oversight;
 * see the comment block at the top of firestore.rules for the manual
 * sync checklist.
 *
 * Scope/qualifier semantics from §2 that a flat boolean can't express:
 * - "Read (scoped to dept)"   -> department_user reads are filtered by
 *                                 departmentId === user's departmentId
 *                                 (enforced in the Firestore query + rules,
 *                                 not here — this file only answers yes/no
 *                                 on the module-action pair)
 * - "Read (approved only)"    -> read_only reads are filtered by
 *                                 status === 'effective'
 * - "Full (own)" (Notifications) -> every role can manage notifications,
 *                                    but only ones addressed to themselves
 *                                    (userId === auth.uid), enforced by query
 *                                    + rules, not by this matrix
 *
 * Treat PERMISSIONS as "can this role even attempt this action on this
 * module" — the scoping qualifiers above are a SEPARATE check that callers
 * must also apply. Forgetting the scope check after passing the module
 * check is the most likely RBAC bug in this codebase; grep for
 * "SCOPE CHECK REQUIRED" comments at each call site as a reminder.
 */

type PermissionMatrix = Record<Module, Partial<Record<Action, Role[]>>>;

export const PERMISSIONS: PermissionMatrix = {
  documents: {
    create: ["super_admin", "document_controller"],
    read: [
      "super_admin",
      "document_controller",
      "management_representative",
      "department_user",
      "read_only",
    ],
    update: ["super_admin", "document_controller"],
    delete: ["super_admin", "document_controller"],
    archive: ["super_admin", "document_controller"],
    // "Request changes" from Mgmt Representative is modeled as a review
    // action, not a document mutation — see document_reviews / approvals.
  },
  revisions: {
    create: ["super_admin", "document_controller"],
    read: [
      "super_admin",
      "document_controller",
      "management_representative",
      "department_user",
      "read_only",
    ],
  },
  approvals: {
    submit_for_review: ["super_admin", "document_controller"],
    approve: ["super_admin", "management_representative"],
    reject: ["super_admin", "management_representative"],
    request_revision: ["super_admin", "management_representative"],
    read: ["super_admin", "document_controller", "management_representative"],
  },
  iso_clauses: {
    create: ["super_admin", "document_controller"],
    read: [
      "super_admin",
      "document_controller",
      "management_representative",
      "department_user",
      "read_only",
    ],
    update: ["super_admin", "document_controller"],
    delete: ["super_admin", "document_controller"],
  },
  org_profile: {
    create: ["super_admin"],
    read: [
      "super_admin",
      "document_controller",
      "management_representative",
      "department_user",
      "read_only",
    ],
    update: ["super_admin"],
    delete: ["super_admin"],
  },
  vision_mission: {
    create: ["super_admin"],
    read: [
      "super_admin",
      "document_controller",
      "management_representative",
      "department_user",
      "read_only",
    ],
    update: ["super_admin"],
    propose: ["super_admin", "document_controller"],
    approve: ["super_admin", "management_representative"],
  },
  audit_trail: {
    // No role has "create" / "update" / "delete" here — system-generated only.
    read: ["super_admin", "document_controller", "management_representative"],
  },
  notifications: {
    // "Full (own)" for every role — module-level check passes for all roles;
    // the per-row scoping (userId === auth.uid) is the real gate.
    create: [
      "super_admin",
      "document_controller",
      "management_representative",
      "department_user",
      "read_only",
    ],
    read: [
      "super_admin",
      "document_controller",
      "management_representative",
      "department_user",
      "read_only",
    ],
    update: [
      "super_admin",
      "document_controller",
      "management_representative",
      "department_user",
      "read_only",
    ],
    delete: [
      "super_admin",
      "document_controller",
      "management_representative",
      "department_user",
      "read_only",
    ],
  },
  settings: {
    create: ["super_admin"],
    read: ["super_admin"],
    update: ["super_admin"],
    delete: ["super_admin"],
  },
  users_roles: {
    create: ["super_admin"],
    read: ["super_admin"],
    update: ["super_admin"],
    delete: ["super_admin"],
  },
};

/**
 * Module-level permission check. Returns false if the role/module/action
 * combination is not in the matrix at all.
 *
 * IMPORTANT: this answers "is this role allowed to attempt this action on
 * this module type" — NOT "is this role allowed on THIS SPECIFIC ROW".
 * Row-level scope checks (department, ownership, approved-only) are
 * separate and must be applied by the caller. See scopedDocumentRead()
 * below for the canonical example.
 */
export function hasPermission(role: Role, module: Module, action: Action): boolean {
  const allowedRoles = PERMISSIONS[module]?.[action];
  return allowedRoles?.includes(role) ?? false;
}

/**
 * Scope check for reading a single document, mirroring the qualifiers in
 * §2's "Documents" row: department_user is scoped to their own department,
 * read_only sees only status === 'effective'.
 *
 * Call this AFTER hasPermission(role, "documents", "read") returns true.
 * It is not a substitute for the module check — it narrows it.
 */
export function canReadDocument(
  role: Role,
  userDepartmentId: string | null,
  doc: { departmentId: string; status: DocumentStatus }
): boolean {
  if (role === "read_only") {
    return doc.status === "effective";
  }
  if (role === "department_user") {
    return doc.departmentId === userDepartmentId;
  }
  // super_admin, document_controller, management_representative: unscoped read
  return true;
}

/**
 * Document lifecycle state machine — exact transitions per §5.
 * Returns the allowed next statuses for a given current status and the
 * action being taken. This is intentionally separate from PERMISSIONS:
 * "can this role approve documents" (module check) is a different question
 * from "is Draft -> Effective a legal transition" (state machine check).
 * Both must pass.
 */
const TRANSITIONS: Record<DocumentStatus, Partial<Record<string, DocumentStatus>>> = {
  draft: {
    submit_for_review: "submitted_for_review",
  },
  submitted_for_review: {
    approve: "effective",
    reject: "draft",
    request_revision: "draft",
  },
  effective: {
    start_review: "under_review", // manual trigger for v1 — see roadmap note below
    supersede: "obsolete",
  },
  under_review: {
    confirm_current: "effective",
    start_new_revision: "draft",
  },
  obsolete: {
    archive: "archived",
  },
  archived: {},
};

/**
 * NOTE on "Effective -> Under Review" (review date reached):
 * Per explicit decision, this is a MANUAL action triggered by a
 * Document Controller+ in v1, NOT an automated Cloud Scheduler job.
 * The transition exists in the state machine below and is reachable via
 * the "start_review" action from the document detail page. Automating
 * this (Cloud Scheduler + Cloud Function scanning reviewDate <= today) is
 * deferred — revisit if review-date tracking becomes a compliance
 * requirement rather than a convenience.
 */
export function getNextStatus(
  current: DocumentStatus,
  action: string
): DocumentStatus | null {
  return TRANSITIONS[current]?.[action] ?? null;
}

export function canTransition(current: DocumentStatus, action: string): boolean {
  return getNextStatus(current, action) !== null;
}
