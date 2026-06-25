import "server-only";
import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { adminDb } from "@/lib/firebase/admin";
import { fetchScopedDocumentsForExport } from "@/lib/export/fetch-documents";
import { buildDocumentListWorkbook } from "@/lib/export/documents-xlsx";

/**
 * GET /api/export/documents — downloads the document list as .xlsx.
 *
 * Why a Route Handler instead of a Server Action: Server Actions return
 * data to client JS, which then has to construct a Blob and trigger a
 * download itself — workable, but Route Handlers can set
 * Content-Disposition and stream binary data directly, which is the
 * standard way a browser link/button triggers a "Save As" download
 * without any client-side Blob plumbing.
 *
 * Same session + permission check pattern as every Server Action in
 * this codebase — a Route Handler is not exempt from §4's rules just
 * because it isn't a "use server" function.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  if (!hasPermission(session.role, "documents", "read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [rows, orgSnap] = await Promise.all([
    fetchScopedDocumentsForExport(session),
    adminDb.collection("organizations").doc(session.orgId).get(),
  ]);

  const orgName = (orgSnap.data()?.name as string) ?? "Organization";
  const fileBytes = await buildDocumentListWorkbook(rows, orgName);

  const dateStamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(fileBytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="documents-${dateStamp}.xlsx"`,
      "Content-Length": String(fileBytes.length),
    },
  });
}
