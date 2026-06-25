import { describe, it, expect } from "vitest";
import { resolveResourceType, buildPublicId } from "@/lib/cloudinary/resource-type";

describe("resolveResourceType", () => {
  it('maps "application/pdf" to "image" (enables Cloudinary page-rasterization for preview)', () => {
    expect(resolveResourceType("application/pdf")).toBe("image");
  });

  it('maps DOCX to "raw"', () => {
    expect(
      resolveResourceType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("raw");
  });

  it('maps XLSX to "raw"', () => {
    expect(
      resolveResourceType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    ).toBe("raw");
  });

  it('maps PPTX to "raw"', () => {
    expect(
      resolveResourceType(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      )
    ).toBe("raw");
  });

  it('maps legacy Office formats (doc/xls/ppt) to "raw"', () => {
    expect(resolveResourceType("application/msword")).toBe("raw");
    expect(resolveResourceType("application/vnd.ms-excel")).toBe("raw");
    expect(resolveResourceType("application/vnd.ms-powerpoint")).toBe("raw");
  });

  it('maps any unrecognized MIME type to "raw" (safe default — never silently treats an unknown format as previewable)', () => {
    expect(resolveResourceType("application/octet-stream")).toBe("raw");
    expect(resolveResourceType("")).toBe("raw");
  });
});

describe("buildPublicId", () => {
  it("builds the expected org/document/revision path", () => {
    expect(buildPublicId("org-1", "doc-1", 3)).toBe("organizations/org-1/documents/doc-1/v3");
  });

  it("produces different public_ids for different revision numbers of the same document", () => {
    const v1 = buildPublicId("org-1", "doc-1", 1);
    const v2 = buildPublicId("org-1", "doc-1", 2);
    expect(v1).not.toBe(v2);
  });

  it("produces different public_ids for the same document/revision under different orgs (tenant isolation in the path itself)", () => {
    const a = buildPublicId("org-a", "doc-1", 1);
    const b = buildPublicId("org-b", "doc-1", 1);
    expect(a).not.toBe(b);
  });
});
