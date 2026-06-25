/**
 * Pure, side-effect-free helpers extracted from lib/cloudinary/server.ts
 * specifically so they can be unit-tested directly (see
 * tests/cloudinary-resource-type.test.ts) — server.ts has a top-level
 * `import "server-only"`, which throws if imported outside the Next.js
 * server runtime (including from Vitest), so anything that needs to be
 * testable in isolation has to live outside that file. Same separation
 * pattern as lib/dashboard/metrics.ts and lib/numbering/template.ts.
 */

/**
 * Maps a MIME type to the Cloudinary resource type it will actually be
 * stored under. PDFs go through as "image" (Cloudinary can rasterize
 * them page-by-page, which is what makes PDF preview work); everything
 * else this app accepts (DOCX/XLSX/PPTX/legacy Office formats) goes
 * through as "raw" (stored as-is, no transformation support,
 * download-only). This must be used BOTH when building the upload
 * signature (so the client uploads to the matching endpoint) AND when
 * persisting document_versions.resourceType (so download/preview URL
 * generation later knows which type to ask for) — both call sites are
 * in app/actions/versions.ts.
 */
export function resolveResourceType(mimeType: string): "image" | "raw" {
  return mimeType === "application/pdf" ? "image" : "raw";
}

/**
 * Builds the deterministic public_id for a document revision upload —
 * direct equivalent of documentVersionId()'s path convention from the
 * old Firebase Storage integration. Cloudinary public_ids cannot
 * contain certain characters reliably across all asset types, so this
 * intentionally excludes the original filename (kept separately in
 * Firestore's document_versions.fileName) rather than appending it here.
 */
export function buildPublicId(orgId: string, documentId: string, revisionNumber: number): string {
  return `organizations/${orgId}/documents/${documentId}/v${revisionNumber}`;
}
