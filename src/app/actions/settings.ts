"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb, runAuditedWrite } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { requireServerSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { DOCUMENT_TYPES } from "@/lib/types/core";
import { validateTemplateSyntax } from "@/lib/numbering/template";

/**
 * §2: Settings (numbering, backup, access control) — Super Admin Full,
 * every other role has no access at all. This file's hasPermission
 * checks use "read"/"update" against the "settings" module, which §2's
 * matrix marks Super-Admin-only across the board.
 */

export async function getOrgSettings() {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "settings", "read")) {
    throw new Error("FORBIDDEN: role cannot view organization settings.");
  }

  const snap = await adminDb.collection("settings").doc(session.orgId).get();
  return serializeFirestoreData(snap.exists ? snap.data() : { numberingTemplates: {} });
}

/**
 * Read-only numbering templates for the "format hint" use case on the
 * document creation form — deliberately NOT gated by the "settings"
 * module permission (Super-Admin-only per §2), because the people who
 * most need to see the expected format are the ones CREATING documents
 * (Document Controller), not the ones configuring Settings. This
 * function only requires a valid session; createDocument() itself still
 * re-validates the typed number against the template server-side
 * regardless of what this returns, so there's no integrity gap from
 * loosening this particular read.
 */
export async function getNumberingTemplatesForHint(): Promise<Record<string, string>> {
  const session = await requireServerSession();
  const snap = await adminDb.collection("settings").doc(session.orgId).get();
  return (snap.data()?.numberingTemplates ?? {}) as Record<string, string>;
}

const updateNumberingSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  template: z.string().max(50),
});

/**
 * Sets or clears the numbering template for one document type. Clearing
 * (empty string) removes enforcement for that type entirely — handled
 * as a Firestore field DELETE, not an empty-string value, so
 * validateDocumentNumber()'s "no template configured -> always valid"
 * path is reached cleanly.
 */
export async function setNumberingTemplate(
  input: z.infer<typeof updateNumberingSchema>
) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "settings", "update")) {
    throw new Error("FORBIDDEN: role cannot update organization settings.");
  }

  const parsed = updateNumberingSchema.parse(input);
  const isClearing = parsed.template.trim() === "";

  if (!isClearing) {
    const syntaxCheck = validateTemplateSyntax(parsed.template);
    if (!syntaxCheck.valid) {
      throw new Error(syntaxCheck.reason);
    }
  }

  const ref = adminDb.collection("settings").doc(session.orgId);
  const snap = await ref.get();
  const existingTemplates = (snap.data()?.numberingTemplates ?? {}) as Record<string, string>;

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: isClearing ? "settings.numbering_template.clear" : "settings.numbering_template.set",
      module: "settings",
      targetId: session.orgId,
      targetType: "settings",
      oldValue: { documentType: parsed.documentType, template: existingTemplates[parsed.documentType] ?? null },
      newValue: { documentType: parsed.documentType, template: isClearing ? null : parsed.template },
    },
    (batch) => {
      const updatedTemplates = { ...existingTemplates };
      if (isClearing) {
        delete updatedTemplates[parsed.documentType];
      } else {
        updatedTemplates[parsed.documentType] = parsed.template;
      }
      batch.set(
        ref,
        { orgId: session.orgId, numberingTemplates: updatedTemplates },
        { merge: true }
      );
    }
  );

  revalidatePath("/settings/numbering");
  return { success: true };
}
