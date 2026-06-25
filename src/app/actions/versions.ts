"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb, runAuditedWrite, createDocumentVersion } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { requireServerSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import {
  getUploadSignature,
  getAuthenticatedAssetUrl,
  getPdfPagePreviewUrl,
  getPdfPageCount,
  deleteUploadedAsset,
  resolveResourceType,
  type UploadSignaturePayload,
} from "@/lib/cloudinary/server";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Storage backend, per explicit decision: Cloudinary, replacing
 * Firebase Storage entirely (see lib/cloudinary/server.ts for the full
 * access-control rationale this migration had to reconstruct without
 * Firestore-style Security Rules).
 *
 * §6 Preview & Compare feasibility notes, still applied:
 * - PDF gets an in-app preview, via Cloudinary's PDF-to-image
 *   transformation (getPdfPagePreviewUrl) — see
 *   components/documents/pdf-preview-dialog.tsx.
 * - Other formats (DOCX/XLSX/PPTX) are still ACCEPTED for upload but
 *   have no rendered preview — download only.
 * - "Compare versions" remains metadata-diff only, never content-diff.
 */
const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
];

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Returns a signed Cloudinary upload payload for the NEXT revision of
 * an EXISTING document. There is no separate "upload during creation"
 * variant — per the create-document form's flow (see
 * components/documents/new-document-form.tsx), the document is created
 * FIRST via createDocument(), and this function is then called against
 * the resulting documentId for the first revision, exactly the same
 * call this function handles for any later revision. The form just
 * sequences both calls together so it feels like one step to the user.
 *
 * Same role/state-machine checks as the rest of this codebase: only
 * Document Controller+ can upload, only while Draft or Under Review.
 */
export async function getUploadSignatureForVersion(
  documentId: string,
  mimeType: string
): Promise<UploadSignaturePayload & { revisionNumber: number }> {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "revisions", "create")) {
    throw new Error("FORBIDDEN: role cannot upload document revisions.");
  }

  if (!ACCEPTED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`File type "${mimeType}" is not accepted.`);
  }

  const docSnap = await adminDb.collection("documents").doc(documentId).get();
  if (!docSnap.exists) throw new Error("Document not found.");

  const docData = docSnap.data()!;
  if (docData.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }
  if (docData.status !== "draft" && docData.status !== "under_review") {
    throw new Error(`Cannot upload a new revision while the document is "${docData.status}".`);
  }

  const nextRevisionNumber = (docData.currentRevisionNumber ?? 0) + 1;
  const signature = getUploadSignature({
    orgId: session.orgId,
    documentId,
    revisionNumber: nextRevisionNumber,
    mimeType,
  });

  return { ...signature, revisionNumber: nextRevisionNumber };
}

const recordVersionSchema = z.object({
  documentId: z.string().min(1),
  publicId: z.string().min(1),
  revisionNumber: z.number().int().positive(),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  changeDescription: z.string().min(1).max(1000),
});

/**
 * Records a new document_versions row after the file has already been
 * uploaded directly to Cloudinary from the client (using the signature
 * from getUploadSignatureForVersion). Re-validates everything
 * server-side rather than trusting the client's claims about what it
 * uploaded:
 *   1. Re-derives the EXPECTED publicId from documentId + the current
 *      server-side revision count, and requires the client's publicId
 *      to match EXACTLY — this is the same anti-mismatch guard the old
 *      Firebase Storage version had (see the historical comment this
 *      replaced), re-implemented for Cloudinary's publicId instead of
 *      a Storage path.
 *   2. Writes the document_versions row (deterministic ID) AND updates
 *      the parent documents/{id} pointer fields in the same audited
 *      batch.
 * If the Firestore write fails AFTER a successful Cloudinary upload,
 * the orphaned asset is deleted (cleanup) — see the catch block.
 */
export async function recordUploadedVersion(input: z.infer<typeof recordVersionSchema>) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "revisions", "create")) {
    throw new Error("FORBIDDEN: role cannot upload document revisions.");
  }

  const parsed = recordVersionSchema.parse(input);

  if (parsed.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File exceeds the ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit.`);
  }
  if (!ACCEPTED_MIME_TYPES.includes(parsed.fileType)) {
    throw new Error(`File type "${parsed.fileType}" is not accepted.`);
  }

  const docRef = adminDb.collection("documents").doc(parsed.documentId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new Error("Document not found.");

  const docData = docSnap.data()!;
  if (docData.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }
  if (docData.status !== "draft" && docData.status !== "under_review") {
    throw new Error(
      `Cannot upload a new revision while the document is "${docData.status}". ` +
        `Start a new revision from Under Review, or use the existing Draft.`
    );
  }

  const expectedRevisionNumber = (docData.currentRevisionNumber ?? 0) + 1;
  if (parsed.revisionNumber !== expectedRevisionNumber) {
    throw new Error(
      `Revision number mismatch: expected ${expectedRevisionNumber}, got ` +
        `${parsed.revisionNumber}. Another revision may have been uploaded ` +
        `concurrently — reload and try again.`
    );
  }

  const expectedPublicId = `organizations/${session.orgId}/documents/${parsed.documentId}/v${parsed.revisionNumber}`;
  if (parsed.publicId !== expectedPublicId) {
    throw new Error("FORBIDDEN: uploaded asset does not match the expected document/revision.");
  }

  try {
    await runAuditedWrite(
      {
        orgId: session.orgId,
        userId: session.uid,
        userName: session.email ?? session.uid,
        action: "document_version.create",
        module: "revisions",
        targetId: parsed.documentId,
        targetType: "document_version",
        oldValue: { previousRevisionNumber: docData.currentRevisionNumber },
        newValue: {
          revisionNumber: parsed.revisionNumber,
          fileName: parsed.fileName,
          changeDescription: parsed.changeDescription,
        },
      },
      async (batch) => {
        const versionRef = await createDocumentVersion(batch, {
          documentId: parsed.documentId,
          revisionNumber: parsed.revisionNumber,
          fileUrl: parsed.publicId,
          fileName: parsed.fileName,
          fileType: parsed.fileType,
          fileSizeBytes: parsed.fileSizeBytes,
          changeDescription: parsed.changeDescription,
          changedBy: session.uid,
          resourceType: resolveResourceType(parsed.fileType),
        });

        batch.update(docRef, {
          currentRevisionNumber: parsed.revisionNumber,
          currentFileUrl: parsed.publicId,
          currentVersionId: versionRef.id,
          status: docData.status === "under_review" ? "draft" : docData.status,
          updatedBy: session.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    );
  } catch (err) {
    // Cleanup: the file is already on Cloudinary, but the Firestore
    // write failed — delete the orphaned asset rather than leaving a
    // file that no document_versions row ever points to. Best-effort:
    // if the cleanup delete itself fails, log and continue surfacing
    // the original error rather than masking it.
    await deleteUploadedAsset(parsed.publicId).catch((cleanupErr) => {
      console.error("Failed to clean up orphaned Cloudinary asset:", parsed.publicId, cleanupErr);
    });
    throw err;
  }

  revalidatePath(`/documents/${parsed.documentId}`);
  return { revisionNumber: parsed.revisionNumber, publicId: parsed.publicId };
}

/**
 * Returns a download/view URL for a stored revision. PDFs get a
 * page-preview image URL (Cloudinary transformation) when preview is
 * requested; everything else (and PDFs when preview isn't requested)
 * gets a direct authenticated download URL. Looks up resourceType from
 * the document_versions row itself rather than re-deriving it from a
 * MIME type passed in by the caller — the row is the one place that
 * authoritatively recorded what Cloudinary resource type the asset was
 * actually uploaded as (see resolveResourceType in
 * lib/cloudinary/server.ts, called once at upload time in
 * recordUploadedVersion above).
 */
export async function getDownloadUrl(
  versionId: string,
  documentId: string,
  options: { preview?: boolean; page?: number } = {}
): Promise<{ url: string }> {
  const session = await requireServerSession();

  const docSnap = await adminDb.collection("documents").doc(documentId).get();
  if (!docSnap.exists) throw new Error("Document not found.");
  const docData = docSnap.data()!;
  if (docData.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }

  const versionSnap = await adminDb.collection("document_versions").doc(versionId).get();
  if (!versionSnap.exists) throw new Error("Version not found.");
  const versionData = versionSnap.data()!;
  if (versionData.documentId !== documentId) {
    throw new Error("FORBIDDEN: version does not belong to the requested document.");
  }

  const publicId: string = versionData.fileUrl;
  const resourceType: "image" | "raw" = versionData.resourceType ?? "raw";

  const expectedPrefix = `organizations/${session.orgId}/documents/${documentId}/`;
  if (!publicId.startsWith(expectedPrefix)) {
    throw new Error("FORBIDDEN: asset does not match the requested document.");
  }

  if (options.preview && resourceType === "image") {
    return { url: getPdfPagePreviewUrl(publicId, options.page ?? 1) };
  }

  return { url: getAuthenticatedAssetUrl(publicId, resourceType) };
}

export async function listDocumentVersions(documentId: string) {
  const session = await requireServerSession();

  const docSnap = await adminDb.collection("documents").doc(documentId).get();
  if (!docSnap.exists) throw new Error("Document not found.");
  if (docSnap.data()!.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }

  const snap = await adminDb
    .collection("document_versions")
    .where("documentId", "==", documentId)
    .orderBy("revisionNumber", "desc")
    .get();

  return serializeFirestoreData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

/**
 * Returns the total number of pages for a PDF document version.
 * Used by the preview dialog to know when to disable the "Next" button.
 */
export async function getVersionPageCount(
  versionId: string,
  documentId: string
): Promise<{ pageCount: number }> {
  const session = await requireServerSession();

  const docSnap = await adminDb.collection("documents").doc(documentId).get();
  if (!docSnap.exists) throw new Error("Document not found.");
  const docData = docSnap.data()!;
  if (docData.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }

  const versionSnap = await adminDb.collection("document_versions").doc(versionId).get();
  if (!versionSnap.exists) throw new Error("Version not found.");
  const versionData = versionSnap.data()!;
  if (versionData.documentId !== documentId) {
    throw new Error("FORBIDDEN: version does not belong to the requested document.");
  }

  const publicId: string = versionData.fileUrl;
  const resourceType: "image" | "raw" = versionData.resourceType ?? "raw";

  if (resourceType !== "image") {
    return { pageCount: 1 };
  }

  const pageCount = await getPdfPageCount(publicId);
  return { pageCount };
}
