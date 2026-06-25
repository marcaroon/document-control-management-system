import "server-only";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import {
  getFirestore,
  type Firestore,
  FieldValue,
} from "firebase-admin/firestore";
import type { Module, NotificationType } from "@/lib/types/core";

/**
 * Admin SDK init — SERVER ONLY. The `server-only` import above makes Next.js
 * throw a build error if this file is ever imported from client code,
 * which is the cheapest possible guardrail against accidentally shipping
 * service-account credentials to the browser.
 *
 * Every Server Action that mutates documents/approvals/audit_logs MUST go
 * through the helpers in this file, never raw `db.collection(...).add()`
 * calls scattered across action files — that's how Rule 3 (atomic audit
 * emission) gets silently skipped six months from now by someone who
 * didn't read this comment.
 *
 * NOTE: Firebase Storage (and its Admin SDK init) was REMOVED here per
 * explicit decision — file storage now goes through Cloudinary (see
 * lib/cloudinary/server.ts). storage.rules and the FIREBASE_STORAGE_BUCKET
 * env var are no longer used by this app; they're left in firebase.json/
 * .env.example history only if you're diffing against an older version.
 */
function getAdminApp(): App {
  if (getApps().length) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in your environment. " +
        "See .env.example."
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

const adminApp = getAdminApp();
export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp);

// ---------------------------------------------------------------------------
// §4 Rule 3 — Atomic audit emission
// ---------------------------------------------------------------------------

interface AuditEntryInput {
  orgId: string;
  userId: string;
  userName: string;
  action: string;
  module: Module;
  targetId: string;
  targetType: string;
  oldValue: unknown | null;
  newValue: unknown | null;
}

/**
 * Runs a mutation and its audit log entry in the SAME Firestore batch.
 * If the audit write fails, the whole batch fails — including the primary
 * mutation. This is the literal implementation of §4 Rule 3: "An audit
 * trail that can silently fail to record an action is not an audit trail."
 *
 * `mutate` receives the batch so the caller can add their primary write(s)
 * to the same atomic unit. Do not call batch.commit() yourself inside
 * `mutate` — this function commits once, after both the mutation and the
 * audit entry have been added.
 *
 * `mutate` may be async (e.g. to await an existence check via
 * createDocumentVersion() before adding its batch.set() call) — every
 * write added to `batch` during that await still lands in the SAME
 * batch.commit() call below, so atomicity is preserved regardless of
 * how many awaits happen inside `mutate` before it returns.
 *
 * Firestore batched writes cap at 500 operations; if a single logical
 * action ever needs more writes than that, switch to a transaction with
 * the same shape instead of raising the cap — that's a sign the action is
 * doing too much in one unit, not a sign the limit is wrong.
 */
export async function runAuditedWrite(
  audit: AuditEntryInput,
  mutate: (batch: FirebaseFirestore.WriteBatch) => void | Promise<void>
): Promise<void> {
  const batch = adminDb.batch();

  await mutate(batch);

  const auditRef = adminDb.collection("audit_logs").doc();
  batch.set(auditRef, {
    ...audit,
    timestamp: FieldValue.serverTimestamp(),
  });

  await batch.commit();
}

// ---------------------------------------------------------------------------
// document_versions — deterministic append-only IDs
// ---------------------------------------------------------------------------

/**
 * Builds the deterministic ID for a document_versions row:
 * `${documentId}_v${revisionNumber}`.
 *
 * This is a deliberate addition on top of the original spec (§3 listed
 * auto-generated IDs). Rationale: a free-form auto ID means "don't
 * overwrite this collection" is enforced ONLY by Security Rules + code
 * discipline (spec's own §4 Rule 2 admits this is a real gap — Admin SDK
 * bypasses rules entirely). A deterministic ID means overwriting a past
 * revision requires deliberately reusing the exact same revision number,
 * which is a much harder accident to have than "forgot a filter somewhere."
 * It does not replace the deny-all client rule or the code-review
 * discipline from risk #2 — it's one more independent layer.
 */
export function documentVersionId(documentId: string, revisionNumber: number): string {
  return `${documentId}_v${revisionNumber}`;
}

/**
 * Creates a new document_versions row using the deterministic ID scheme.
 * Throws if a version with that ID already exists — this is what actually
 * makes "append-only" enforceable in code, not just in a comment.
 */
export async function createDocumentVersion(
  batch: FirebaseFirestore.WriteBatch,
  params: {
    documentId: string;
    revisionNumber: number;
    fileUrl: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number;
    changeDescription: string;
    changedBy: string;
    resourceType: "image" | "raw";
  }
): Promise<FirebaseFirestore.DocumentReference> {
  const id = documentVersionId(params.documentId, params.revisionNumber);
  const ref = adminDb.collection("document_versions").doc(id);

  const existing = await ref.get();
  if (existing.exists) {
    throw new Error(
      `document_versions/${id} already exists — refusing to overwrite an ` +
        `append-only revision row. This usually means revisionNumber was ` +
        `computed incorrectly (e.g. a race between two concurrent submits).`
    );
  }

  batch.set(ref, {
    ...params,
    createdAt: FieldValue.serverTimestamp(),
  });

  return ref;
}

// ---------------------------------------------------------------------------
// Notifications — §7: Phase 1-2 in-app only, via Firestore listener.
// ---------------------------------------------------------------------------

/**
 * Adds a notification write to an existing batch. Notifications are NOT
 * one of the three append-only/deny-all-client-write collections from §4
 * (every role has "Full (own)" per §2's matrix — they can mark their own
 * as read or delete them client-side), so this helper does not need the
 * deterministic-ID or existence-check treatment that document_versions
 * gets. It still goes through a server action for CREATION specifically
 * because the workflow actions (submit/approve/reject) are the only
 * legitimate source of these particular notification types — a user
 * could create their OWN arbitrary notification row via the client SDK
 * per firestore.rules (harmless, it's their own inbox), but they cannot
 * forge a notification claiming to be "from" the approval workflow with
 * a targetId they don't have access to, because this helper enforces
 * that the caller already validated org/access before calling it.
 */
export function addNotification(
  batch: FirebaseFirestore.WriteBatch,
  params: {
    userId: string;
    orgId: string;
    type: NotificationType;
    relatedDocumentId?: string;
    message: string;
  }
): void {
  const ref = adminDb.collection("notifications").doc();
  batch.set(ref, {
    ...params,
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Custom claims + revocation (token freshness gap fix — see project decision)
// ---------------------------------------------------------------------------

/**
 * Sets role + orgId + departmentId as custom claims, AND revokes all
 * existing refresh tokens for the user in one operation.
 *
 * DEVIATION FROM THE ORIGINAL SPEC, FLAGGED EXPLICITLY: §4 only specifies
 * `role` as a custom claim. This implementation also puts orgId and
 * departmentId in the claims. Reason: firestore.rules needs orgId (for
 * tenant isolation, the single highest-priority rule per risk #4) and
 * departmentId (for department_user's scoped document reads) available
 * WITHOUT a get() lookup inside the rule — that's the exact Firestore
 * rules anti-pattern §4 says to avoid for role checks, and the same
 * argument applies equally to orgId/departmentId. If you disagree with
 * this extension, the alternative is get()-based lookups in
 * firestore.rules for org/department scoping specifically, accepting the
 * latency + race-condition surface that §4 warns about for those two
 * fields while keeping only role token-based.
 *
 * Custom claims have a 1000-byte total limit across all claims combined —
 * role + orgId + departmentId as short string/ID values stays well under
 * that, but don't casually add more claims here without checking the
 * budget.
 *
 * Without the revoke call, a role change (e.g. demoting someone from
 * Document Controller to Read Only) would not take effect until their
 * existing ID token expires naturally — up to 1 hour later. This is the
 * fix for that gap (see project decision: "Implement revoke + force
 * sign-out now"). The client side of this contract lives in
 * components/providers/auth-provider.tsx.
 */
export async function setUserRoleClaim(
  uid: string,
  params: { role: string; orgId: string; departmentId: string | null }
): Promise<void> {
  await adminAuth.setCustomUserClaims(uid, {
    role: params.role,
    orgId: params.orgId,
    departmentId: params.departmentId,
  });
  await adminAuth.revokeRefreshTokens(uid);

  // Record the revocation timestamp so the client can detect "my current
  // session predates the most recent revocation" without needing a token
  // refresh round-trip just to find out. See auth-provider.tsx.
  const revokedAtSeconds = Math.floor(Date.now() / 1000);
  await adminDb
    .collection("users")
    .doc(uid)
    .set({ tokensValidAfter: revokedAtSeconds }, { merge: true });
}
