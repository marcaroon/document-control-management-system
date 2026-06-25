import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, getDoc, setDoc } from "firebase/firestore";

/**
 * §11 handoff note #4 (mandatory, explicitly called out as a precondition
 * for Phase 1 being "done"):
 * "Write a rules-emulator test specifically for risk #4 (cross-tenant
 * access attempt) before Phase 1 is considered done."
 *
 * Risk #4 from the risk register (§10): "Cross-tenant data leakage if
 * orgId filtering is inconsistent ... a tenant isolation bug here isn't
 * a cosmetic bug, it's a confidentiality breach with audit/regulatory
 * implications."
 *
 * RUN THIS WITH THE EMULATOR ACTIVE:
 *   firebase emulators:exec --only firestore "npx vitest run tests/firestore-rules.tenant-isolation.test.ts"
 * (or start emulators separately with `firebase emulators:start` and run
 * `npx vitest run tests/firestore-rules.tenant-isolation.test.ts` against it)
 *
 * This suite intentionally does NOT cover every rule in firestore.rules —
 * see tests/firestore-rules.rbac.test.ts (Phase 1 follow-up) for the
 * broader RBAC matrix coverage. This file's only job is risk #4.
 */

const PROJECT_ID = "qms-rules-test";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

/** Seeds two orgs, each with one document, using admin (rules-bypassing) context. */
async function seedTwoTenants() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "documents", "doc-org-a"), {
      orgId: "org-a",
      documentNumber: "QM-001",
      title: "Org A Quality Manual",
      status: "effective",
      departmentId: "dept-a-1",
    });
    await setDoc(doc(db, "documents", "doc-org-b"), {
      orgId: "org-b",
      documentNumber: "QM-001",
      title: "Org B Quality Manual",
      status: "effective",
      departmentId: "dept-b-1",
    });
    await setDoc(doc(db, "audit_logs", "log-org-a"), {
      orgId: "org-a",
      userId: "user-a",
      userName: "A User",
      action: "document.create",
      module: "documents",
      targetId: "doc-org-a",
      targetType: "document",
      oldValue: null,
      newValue: { title: "Org A Quality Manual" },
    });
  });
}

describe("Risk #4 — cross-tenant data leakage", () => {
  it("a super_admin from org-a CANNOT read a single document belonging to org-b", async () => {
    await seedTwoTenants();

    const orgAAdmin = testEnv.authenticatedContext("user-a-admin", {
      role: "super_admin",
      orgId: "org-a",
      departmentId: null,
    });

    await assertFails(getDoc(doc(orgAAdmin.firestore(), "documents", "doc-org-b")));
  });

  it("a super_admin from org-a CAN read their own org's document", async () => {
    await seedTwoTenants();

    const orgAAdmin = testEnv.authenticatedContext("user-a-admin", {
      role: "super_admin",
      orgId: "org-a",
      departmentId: null,
    });

    await assertSucceeds(getDoc(doc(orgAAdmin.firestore(), "documents", "doc-org-a")));
  });

  it("a document_controller from org-b CANNOT read org-a's audit logs", async () => {
    await seedTwoTenants();

    const orgBController = testEnv.authenticatedContext("user-b-controller", {
      role: "document_controller",
      orgId: "org-b",
      departmentId: "dept-b-1",
    });

    await assertFails(getDoc(doc(orgBController.firestore(), "audit_logs", "log-org-a")));
  });

  it(
    "a department_user from org-a CANNOT read a document in their own org but a different department",
    async () => {
      await seedTwoTenants();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "documents", "doc-org-a-dept-2"), {
          orgId: "org-a",
          documentNumber: "WI-005",
          title: "Org A Dept 2 Work Instruction",
          status: "effective",
          departmentId: "dept-a-2",
        });
      });

      const deptUser = testEnv.authenticatedContext("user-a-dept1", {
        role: "department_user",
        orgId: "org-a",
        departmentId: "dept-a-1",
      });

      await assertFails(
        getDoc(doc(deptUser.firestore(), "documents", "doc-org-a-dept-2"))
      );
    }
  );

  it(
    "tampering with the orgId field on a CREATE to claim a different org is rejected",
    async () => {
      const orgAController = testEnv.authenticatedContext("user-a-controller", {
        role: "document_controller",
        orgId: "org-a",
        departmentId: "dept-a-1",
      });

      // Attempting to write a document tagged as org-b while authenticated
      // as an org-a user must fail — this is the exact attack risk #4
      // describes: client-supplied orgId being trusted instead of the
      // token's claim.
      await assertFails(
        setDoc(doc(orgAController.firestore(), "documents", "forged-doc"), {
          orgId: "org-b",
          documentNumber: "FORGED-001",
          title: "Should not be creatable",
          status: "draft",
          departmentId: "dept-b-1",
        })
      );
    }
  );

  it("an unauthenticated request cannot read any document from either org", async () => {
    await seedTwoTenants();
    const anon = testEnv.unauthenticatedContext();

    await assertFails(getDoc(doc(anon.firestore(), "documents", "doc-org-a")));
    await assertFails(getDoc(doc(anon.firestore(), "documents", "doc-org-b")));
  });
});

describe("Sanity check — document_versions/document_approvals/audit_logs deny-all client write", () => {
  it("even super_admin cannot write directly to audit_logs from the client", async () => {
    const orgAAdmin = testEnv.authenticatedContext("user-a-admin", {
      role: "super_admin",
      orgId: "org-a",
      departmentId: null,
    });

    await assertFails(
      setDoc(doc(orgAAdmin.firestore(), "audit_logs", "client-forged-log"), {
        orgId: "org-a",
        userId: "user-a-admin",
        userName: "Admin",
        action: "document.create",
        module: "documents",
        targetId: "doc-x",
        targetType: "document",
        oldValue: null,
        newValue: null,
      })
    );
  });

  it("even super_admin cannot write directly to document_versions from the client", async () => {
    const orgAAdmin = testEnv.authenticatedContext("user-a-admin", {
      role: "super_admin",
      orgId: "org-a",
      departmentId: null,
    });

    await assertFails(
      setDoc(doc(orgAAdmin.firestore(), "document_versions", "doc-x_v1"), {
        documentId: "doc-x",
        revisionNumber: 1,
        fileUrl: "https://example.com/forged.pdf",
        fileName: "forged.pdf",
        fileType: "application/pdf",
        fileSizeBytes: 100,
        changeDescription: "forged",
        changedBy: "user-a-admin",
      })
    );
  });
});
