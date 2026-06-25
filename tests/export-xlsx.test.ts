import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildDocumentListWorkbook, type ExportDocumentRow } from "@/lib/export/documents-xlsx";

/**
 * Verifies the generated .xlsx buffer is actually a valid, readable
 * workbook with the expected structure — not just "the function ran
 * without throwing." Reads the buffer back with ExcelJS to confirm
 * sheet names, headers, and row data round-trip correctly.
 */

const sampleRows: ExportDocumentRow[] = [
  {
    documentNumber: "QM-001",
    title: "Quality Manual",
    type: "quality_manual",
    status: "effective",
    currentRevisionNumber: 2,
    departmentName: "Quality Assurance",
    effectiveDate: { seconds: 1700000000 },
    reviewDate: { seconds: 1750000000 },
    updatedAt: { seconds: 1710000000 },
  },
  {
    documentNumber: "PRO-014",
    title: "Incoming Inspection Procedure",
    type: "procedure",
    status: "draft",
    currentRevisionNumber: 0,
    departmentName: "Production",
    effectiveDate: null,
    reviewDate: null,
    updatedAt: { seconds: 1715000000 },
  },
];

describe("buildDocumentListWorkbook", () => {
  it("produces a non-empty buffer", async () => {
    const buffer = await buildDocumentListWorkbook(sampleRows, "PT Pakis Jaya Garmindo");
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("produces a workbook with a Documents sheet and an Export Info sheet", async () => {
    const buffer = await buildDocumentListWorkbook(sampleRows, "PT Pakis Jaya Garmindo");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer.buffer as ArrayBuffer);

    const sheetNames = workbook.worksheets.map((s) => s.name);
    expect(sheetNames).toContain("Documents");
    expect(sheetNames).toContain("Export Info");
  });

  it("writes the correct header row", async () => {
    const buffer = await buildDocumentListWorkbook(sampleRows, "Test Org");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer.buffer as ArrayBuffer);

    const sheet = workbook.getWorksheet("Documents")!;
    const headerRow = sheet.getRow(1).values as unknown[];
    expect(headerRow.slice(1)).toEqual([
      "Document #",
      "Title",
      "Type",
      "Status",
      "Revision",
      "Department",
      "Effective Date",
      "Review Date",
      "Last Updated",
    ]);
  });

  it("writes one data row per input row, with human-readable labels for type/status", async () => {
    const buffer = await buildDocumentListWorkbook(sampleRows, "Test Org");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer.buffer as ArrayBuffer);

    const sheet = workbook.getWorksheet("Documents")!;
    expect(sheet.rowCount).toBe(sampleRows.length + 1);

    const firstDataRow = sheet.getRow(2).values as unknown[];
    expect(firstDataRow[1]).toBe("QM-001");
    expect(firstDataRow[3]).toBe("Quality Manual");
    expect(firstDataRow[4]).toBe("Effective");
  });

  it("handles null effectiveDate/reviewDate without throwing, rendering blank cells", async () => {
    const buffer = await buildDocumentListWorkbook(sampleRows, "Test Org");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer.buffer as ArrayBuffer);

    const sheet = workbook.getWorksheet("Documents")!;
    const secondDataRow = sheet.getRow(3).values as unknown[];
    expect(secondDataRow[7]).toBeFalsy();
    expect(secondDataRow[8]).toBeFalsy();
  });

  it("produces a valid workbook even with zero rows", async () => {
    const buffer = await buildDocumentListWorkbook([], "Empty Org");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer.buffer as ArrayBuffer);

    const sheet = workbook.getWorksheet("Documents")!;
    expect(sheet.rowCount).toBe(1);
  });

  it("includes the organization name and row count in the Export Info sheet", async () => {
    const buffer = await buildDocumentListWorkbook(sampleRows, "PT Pakis Jaya Garmindo");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer.buffer as ArrayBuffer);

    const infoSheet = workbook.getWorksheet("Export Info")!;
    const orgRow = infoSheet.getRow(1).values as unknown[];
    const countRow = infoSheet.getRow(3).values as unknown[];

    expect(orgRow[2]).toBe("PT Pakis Jaya Garmindo");
    expect(countRow[2]).toBe(sampleRows.length);
  });
});
