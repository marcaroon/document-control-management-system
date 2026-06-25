import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canTransition,
  getNextStatus,
  canReadDocument,
} from "@/lib/rbac/permissions";

/**
 * These tests cover the PURE-FUNCTION logic in permissions.ts —
 * no Firestore, no emulator, no network. They run with plain `vitest run`,
 * unlike tests/firestore-rules.tenant-isolation.test.ts which needs the
 * Emulator Suite. This is deliberate: the state machine and permission
 * matrix are exactly the kind of logic that should be testable in
 * isolation, and "I can't run the emulator here" is not an excuse to
 * skip verifying the parts that don't need it.
 *
 * Run with: npx vitest run tests/permissions.test.ts
 */

describe("State machine — canTransition / getNextStatus", () => {
  it("draft -> submitted_for_review via submit_for_review", () => {
    expect(canTransition("draft", "submit_for_review")).toBe(true);
    expect(getNextStatus("draft", "submit_for_review")).toBe("submitted_for_review");
  });

  it("submitted_for_review -> effective via approve", () => {
    expect(getNextStatus("submitted_for_review", "approve")).toBe("effective");
  });

  it("submitted_for_review -> draft via reject", () => {
    expect(getNextStatus("submitted_for_review", "reject")).toBe("draft");
  });

  it("submitted_for_review -> draft via request_revision", () => {
    expect(getNextStatus("submitted_for_review", "request_revision")).toBe("draft");
  });

  it("effective -> under_review via start_review (manual trigger, not scheduled)", () => {
    expect(getNextStatus("effective", "start_review")).toBe("under_review");
  });

  it("effective -> obsolete via supersede", () => {
    expect(getNextStatus("effective", "supersede")).toBe("obsolete");
  });

  it("under_review -> effective via confirm_current", () => {
    expect(getNextStatus("under_review", "confirm_current")).toBe("effective");
  });

  it("under_review -> draft via start_new_revision", () => {
    expect(getNextStatus("under_review", "start_new_revision")).toBe("draft");
  });

  it("obsolete -> archived via archive", () => {
    expect(getNextStatus("obsolete", "archive")).toBe("archived");
  });

  it("rejects illegal transitions: cannot approve a draft document", () => {
    expect(canTransition("draft", "approve")).toBe(false);
    expect(getNextStatus("draft", "approve")).toBeNull();
  });

  it("rejects illegal transitions: cannot submit an already-effective document", () => {
    expect(canTransition("effective", "submit_for_review")).toBe(false);
  });

  it("rejects illegal transitions: archived is a terminal state with no outgoing transitions", () => {
    expect(canTransition("archived", "submit_for_review")).toBe(false);
    expect(canTransition("archived", "approve")).toBe(false);
    expect(canTransition("archived", "archive")).toBe(false);
  });

  it("rejects illegal transitions: cannot start_review on a draft document", () => {
    expect(canTransition("draft", "start_review")).toBe(false);
  });

  it("rejects illegal transitions: cannot supersede a document already under review", () => {
    expect(canTransition("under_review", "supersede")).toBe(false);
  });
});

describe("Permission matrix — approval segregation of duty", () => {
  it("management_representative can approve/reject/request_revision", () => {
    expect(hasPermission("management_representative", "approvals", "approve")).toBe(true);
    expect(hasPermission("management_representative", "approvals", "reject")).toBe(true);
    expect(
      hasPermission("management_representative", "approvals", "request_revision")
    ).toBe(true);
  });

  it("super_admin can also approve (escape hatch, not the normal path)", () => {
    expect(hasPermission("super_admin", "approvals", "approve")).toBe(true);
  });

  it(
    "document_controller CANNOT approve their own submissions — deliberate segregation of duty (see README known-gaps note)",
    () => {
      expect(hasPermission("document_controller", "approvals", "approve")).toBe(false);
      expect(hasPermission("document_controller", "approvals", "reject")).toBe(false);
    }
  );

  it("document_controller CAN submit for review", () => {
    expect(hasPermission("document_controller", "approvals", "submit_for_review")).toBe(true);
  });

  it("management_representative CANNOT submit for review (that's the submitter's job, not the approver's)", () => {
    expect(
      hasPermission("management_representative", "approvals", "submit_for_review")
    ).toBe(false);
  });

  it("read_only and department_user cannot touch approvals at all", () => {
    expect(hasPermission("read_only", "approvals", "approve")).toBe(false);
    expect(hasPermission("department_user", "approvals", "approve")).toBe(false);
    expect(hasPermission("read_only", "approvals", "submit_for_review")).toBe(false);
  });

  it("document_controller and super_admin can create document revisions", () => {
    expect(hasPermission("document_controller", "revisions", "create")).toBe(true);
    expect(hasPermission("super_admin", "revisions", "create")).toBe(true);
  });

  it("management_representative, department_user, and read_only cannot upload revisions", () => {
    expect(hasPermission("management_representative", "revisions", "create")).toBe(false);
    expect(hasPermission("department_user", "revisions", "create")).toBe(false);
    expect(hasPermission("read_only", "revisions", "create")).toBe(false);
  });
});

describe("Row-level scope qualifiers — canReadDocument", () => {
  it("read_only can read an effective document", () => {
    expect(
      canReadDocument("read_only", null, { departmentId: "dept-1", status: "effective" })
    ).toBe(true);
  });

  it("read_only CANNOT read a draft document, even in no particular department", () => {
    expect(
      canReadDocument("read_only", null, { departmentId: "dept-1", status: "draft" })
    ).toBe(false);
  });

  it("read_only CANNOT read a submitted_for_review document", () => {
    expect(
      canReadDocument("read_only", null, {
        departmentId: "dept-1",
        status: "submitted_for_review",
      })
    ).toBe(false);
  });

  it("department_user can read a document in their own department regardless of status", () => {
    expect(
      canReadDocument("department_user", "dept-1", { departmentId: "dept-1", status: "draft" })
    ).toBe(true);
  });

  it("department_user CANNOT read a document in a different department", () => {
    expect(
      canReadDocument("department_user", "dept-1", { departmentId: "dept-2", status: "effective" })
    ).toBe(false);
  });

  it("super_admin, document_controller, and management_representative read unscoped", () => {
    for (const role of ["super_admin", "document_controller", "management_representative"] as const) {
      expect(canReadDocument(role, null, { departmentId: "dept-99", status: "draft" })).toBe(true);
    }
  });
});
