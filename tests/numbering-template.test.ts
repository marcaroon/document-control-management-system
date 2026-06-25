import { describe, it, expect } from "vitest";
import { validateTemplateSyntax, validateDocumentNumber } from "@/lib/numbering/template";

describe("validateTemplateSyntax", () => {
  it("accepts a simple prefix template", () => {
    expect(validateTemplateSyntax("QM-{number}").valid).toBe(true);
  });

  it("accepts a template with both prefix and suffix", () => {
    expect(validateTemplateSyntax("PRO-{number}-2025").valid).toBe(true);
  });

  it("accepts a template with the placeholder at the start", () => {
    expect(validateTemplateSyntax("{number}/WI/REV").valid).toBe(true);
  });

  it("rejects a template missing the placeholder entirely", () => {
    const result = validateTemplateSyntax("QM-001");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/placeholder/);
  });

  it("rejects a template with the placeholder used twice", () => {
    const result = validateTemplateSyntax("{number}-{number}");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/exactly once/);
  });

  it("rejects a template with regex-special characters in the literal part", () => {
    const result = validateTemplateSyntax("QM.{number}");
    expect(result.valid).toBe(false);
  });
});

describe("validateDocumentNumber", () => {
  it("passes any document number when no template is configured", () => {
    expect(validateDocumentNumber("anything-goes-123", undefined).valid).toBe(true);
  });

  it("accepts a number matching a simple prefix template", () => {
    expect(validateDocumentNumber("QM-001", "QM-{number}").valid).toBe(true);
    expect(validateDocumentNumber("QM-42", "QM-{number}").valid).toBe(true);
  });

  it("rejects a number with the wrong prefix", () => {
    expect(validateDocumentNumber("PRO-001", "QM-{number}").valid).toBe(false);
  });

  it("rejects a number missing the numeric part", () => {
    expect(validateDocumentNumber("QM-", "QM-{number}").valid).toBe(false);
  });

  it("rejects a number with non-digit characters where {number} should be", () => {
    expect(validateDocumentNumber("QM-abc", "QM-{number}").valid).toBe(false);
  });

  it("accepts a number matching a prefix+suffix template", () => {
    expect(validateDocumentNumber("PRO-7-2025", "PRO-{number}-2025").valid).toBe(true);
  });

  it("rejects a number with the right number but wrong suffix", () => {
    expect(validateDocumentNumber("PRO-7-2024", "PRO-{number}-2025").valid).toBe(false);
  });

  it("surfaces a distinct error for a misconfigured template rather than blaming the typed input", () => {
    const result = validateDocumentNumber("QM-001", "QM-001");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/misconfigured/);
  });

  it("is case-sensitive on the literal parts", () => {
    expect(validateDocumentNumber("qm-001", "QM-{number}").valid).toBe(false);
  });
});
