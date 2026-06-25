import { describe, it, expect } from "vitest";
import { compileNumberingPattern, validateDocumentNumber } from "@/lib/numbering/pattern";

describe("compileNumberingPattern", () => {
  it("compiles {seq} to one-or-more digits", () => {
    const re = compileNumberingPattern("QM-{seq}");
    expect(re.test("QM-001")).toBe(true);
    expect(re.test("QM-1")).toBe(true);
    expect(re.test("QM-")).toBe(false);
    expect(re.test("QM-abc")).toBe(false);
  });

  it("compiles {dept} to one-or-more uppercase letters", () => {
    const re = compileNumberingPattern("{dept}-{seq}");
    expect(re.test("QA-001")).toBe(true);
    expect(re.test("qa-001")).toBe(false); // lowercase rejected
    expect(re.test("-001")).toBe(false); // empty dept rejected
  });

  it("compiles {year} to exactly 4 digits", () => {
    const re = compileNumberingPattern("{year}-{seq}");
    expect(re.test("2026-001")).toBe(true);
    expect(re.test("26-001")).toBe(false);
    expect(re.test("20266-001")).toBe(false);
  });

  it("escapes regex-special literal characters (dots, parens) so they're treated literally", () => {
    const re = compileNumberingPattern("QM.{seq}");
    expect(re.test("QM.001")).toBe(true);
    expect(re.test("QMX001")).toBe(false); // dot must be literal, not "any character"
  });

  it("anchors the pattern so partial matches don't pass", () => {
    const re = compileNumberingPattern("QM-{seq}");
    expect(re.test("XQM-001")).toBe(false);
    expect(re.test("QM-001X")).toBe(false);
  });

  it("throws on an unrecognized placeholder", () => {
    expect(() => compileNumberingPattern("QM-{sequence}")).toThrow(/Unknown placeholder/);
  });

  it("handles a template with multiple placeholders and literals", () => {
    const re = compileNumberingPattern("{type}/{dept}/{year}-{seq}");
    expect(re.test("SOP/QA/2026-001")).toBe(true);
    expect(re.test("SOP/QA/2026")).toBe(false); // missing the -{seq} part
  });
});

describe("validateDocumentNumber", () => {
  it("passes anything when no template is configured (fail-open for unconfigured orgs)", () => {
    expect(validateDocumentNumber("anything-goes-123", undefined)).toEqual({ valid: true });
  });

  it("validates a conforming number against a configured template", () => {
    expect(validateDocumentNumber("QM-001", "QM-{seq}")).toEqual({ valid: true });
  });

  it("rejects a non-conforming number with a clear reason", () => {
    const result = validateDocumentNumber("WI-001", "QM-{seq}");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("WI-001");
    }
  });

  it("throws (does not silently pass) when the saved template itself is malformed", () => {
    expect(() => validateDocumentNumber("QM-001", "QM-{bogus}")).toThrow(/Unknown placeholder/);
  });
});
