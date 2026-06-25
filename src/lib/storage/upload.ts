"use client";

import {
  getUploadSignatureForVersion,
  recordUploadedVersion,
} from "@/app/actions/versions";

/**
 * Full client-side upload flow for a new document revision, via
 * Cloudinary (replacing Firebase Storage per explicit decision):
 *   1. getUploadSignatureForVersion() (Server Action) — authoritatively
 *      computes the next revisionNumber from current server state and
 *      returns a signed upload payload (signature, timestamp, publicId,
 *      etc.) generated server-side. The client never sees or needs the
 *      Cloudinary API secret.
 *   2. Direct POST to Cloudinary's upload REST endpoint with the signed
 *      parameters — this bypasses Server Actions for the byte transfer
 *      itself; Server Actions are not built for large binary uploads
 *      (no native multipart streaming, and platform body size limits
 *      make a 50MB QMS attachment impractical to push through one).
 *      Cloudinary verifies the signature server-side on their end and
 *      rejects the upload if any signed parameter was tampered with.
 *   3. recordUploadedVersion() (Server Action) — re-validates everything
 *      server-side and writes the document_versions + documents rows
 *      atomically with an audit log entry. If this fails after the
 *      Cloudinary upload succeeded, the orphaned asset is cleaned up
 *      server-side (see versions.ts).
 *
 * Progress reporting: fetch() does not expose upload progress natively
 * the way XMLHttpRequest does, so this uses XHR for the actual upload
 * call specifically to keep the progress callback working — the rest
 * of the flow (steps 1 and 3) uses the normal Server Action call
 * mechanism (which itself uses fetch() under the hood, that's fine,
 * it's not the large binary transfer).
 */
export async function uploadDocumentVersion(
  documentId: string,
  file: File,
  changeDescription: string,
  onProgress?: (percent: number) => void
): Promise<{ revisionNumber: number }> {
  const signature = await getUploadSignatureForVersion(documentId, file.type);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", signature.apiKey);
  formData.append("timestamp", String(signature.timestamp));
  formData.append("signature", signature.signature);
  formData.append("public_id", signature.publicId);
  formData.append("type", signature.type);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.((event.loaded / event.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let message = `Upload failed with status ${xhr.status}.`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed?.error?.message) message = parsed.error.message;
        } catch {
          // response wasn't JSON — fall back to the generic message above
        }
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));

    xhr.send(formData);
  });

  const result = await recordUploadedVersion({
    documentId,
    publicId: signature.publicId,
    revisionNumber: signature.revisionNumber,
    fileName: file.name,
    fileType: file.type,
    fileSizeBytes: file.size,
    changeDescription,
  });

  return { revisionNumber: result.revisionNumber };
}
