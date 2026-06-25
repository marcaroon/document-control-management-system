import ExcelJS from "exceljs";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS } from "@/lib/types/core";
import type { DocumentType, DocumentStatus } from "@/lib/types/core";

/**
 * §9 Phase 4: "Excel/PDF export." Document list is the first export
 * target per explicit priority decision (PDF export deferred but
 * follows the same data-shaping pattern once needed).
 *
 * This function takes already-fetched, already-RBAC-scoped document
 * rows and turns them into an .xlsx buffer — it does NOT fetch data
 * itself or do any permission checking. That separation matters: the
 * caller (the API route) is responsible for calling listVisibleDocuments()
 * or equivalent, which already applies §2's row-level scope qualifiers
 * (department_user -> own department, read_only -> effective only).
 * This function trusts whatever rows it's given, so it must never be
 * called with unscoped data.
 */

export interface ExportDocumentRow {
  documentNumber: string;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  currentRevisionNumber: number;
  departmentName: string;
  effectiveDate: { seconds: number } | null;
  reviewDate: { seconds: number } | null;
  updatedAt: { seconds: number } | null;
}

function formatTimestamp(ts: { seconds: number } | null): string {
  if (!ts) return "";
  return new Date(ts.seconds * 1000).toLocaleDateString();
}

export async function buildDocumentListWorkbook(
  rows: ExportDocumentRow[],
  orgName: string
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QMS Document Control";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Documents", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Document #", key: "documentNumber", width: 16 },
    { header: "Title", key: "title", width: 40 },
    { header: "Type", key: "type", width: 18 },
    { header: "Status", key: "status", width: 20 },
    { header: "Revision", key: "currentRevisionNumber", width: 10 },
    { header: "Department", key: "departmentName", width: 20 },
    { header: "Effective Date", key: "effectiveDate", width: 16 },
    { header: "Review Date", key: "reviewDate", width: 16 },
    { header: "Last Updated", key: "updatedAt", width: 16 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      documentNumber: row.documentNumber,
      title: row.title,
      type: DOCUMENT_TYPE_LABELS[row.type],
      status: DOCUMENT_STATUS_LABELS[row.status],
      currentRevisionNumber: row.currentRevisionNumber,
      departmentName: row.departmentName,
      effectiveDate: formatTimestamp(row.effectiveDate),
      reviewDate: formatTimestamp(row.reviewDate),
      updatedAt: formatTimestamp(row.updatedAt),
    });
  }

  const infoSheet = workbook.addWorksheet("Export Info");
  infoSheet.columns = [{ width: 20 }, { width: 40 }];
  infoSheet.addRow(["Organization", orgName]);
  infoSheet.addRow(["Exported at", new Date().toLocaleString()]);
  infoSheet.addRow(["Total documents", rows.length]);
  infoSheet.getColumn(1).font = { bold: true };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(arrayBuffer as ArrayBuffer);
}
