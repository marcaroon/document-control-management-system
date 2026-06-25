"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb, runAuditedWrite } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { requireServerSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { ISO_9001_2015_SEED, type ClauseSeed } from "@/lib/seed/iso-9001-2015";

/**
 * Seeds the ISO 9001:2015 clause structure (lib/seed/iso-9001-2015.ts)
 * into iso_clauses for the calling org. Per explicit decision: this is
 * the org's OWN COPY from the moment it's created — editing a clause's
 * description afterward only affects this org, matching §3's
 * recommendation ("seed a copy per org... lets an org annotate/customize
 * clause descriptions without risk of leaking into another org's view").
 *
 * Idempotency: refuses to run if the org already has ANY iso_clauses
 * rows, rather than silently creating duplicates on a second click. If
 * you need to re-seed after partial data loss, delete the existing rows
 * first (deliberately not automated — that's a destructive action that
 * deserves a human decision, not a button that silently wipes existing
 * customizations).
 */
export async function seedIsoClauses() {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "iso_clauses", "create")) {
    throw new Error("FORBIDDEN: role cannot create ISO clauses.");
  }

  const existing = await adminDb
    .collection("iso_clauses")
    .where("orgId", "==", session.orgId)
    .limit(1)
    .get();

  if (!existing.empty) {
    throw new Error(
      "This organization already has ISO clauses. Seeding again would " +
        "create duplicates — delete existing clauses first if you really " +
        "want to start over."
    );
  }

  const flatClauses: { parentNumber: string | null; clause: ClauseSeed }[] = [];
  for (const parent of ISO_9001_2015_SEED) {
    flatClauses.push({ parentNumber: null, clause: parent });
    for (const child of parent.children ?? []) {
      flatClauses.push({ parentNumber: parent.clauseNumber, clause: child });
    }
  }
  // Firestore batches cap at 500 writes — guard against the seed file
  // growing past a safe margin rather than failing opaquely mid-write.
  if (flatClauses.length > 480) {
    throw new Error(
      `Seed has ${flatClauses.length} clauses, too close to Firestore's ` +
        `500-write batch cap to seed safely in one batch. Split into ` +
        `multiple batches before increasing the seed data.`
    );
  }

  const parentIdByNumber = new Map<string, string>();

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "iso_clauses.seed",
      module: "iso_clauses",
      targetId: session.orgId,
      targetType: "iso_clauses_seed",
      oldValue: null,
      newValue: { clauseCount: flatClauses.length, source: "ISO 9001:2015" },
    },
    (batch) => {
      // Parents first, so parentIdByNumber is populated before children
      // are written in the second pass below — Firestore's .doc() IDs
      // are generated client-side immediately, no await needed for this.
      for (const { parentNumber, clause } of flatClauses) {
        if (parentNumber !== null) continue;
        const ref = adminDb.collection("iso_clauses").doc();
        parentIdByNumber.set(clause.clauseNumber, ref.id);
        batch.set(ref, {
          orgId: session.orgId,
          clauseNumber: clause.clauseNumber,
          title: clause.title,
          description: clause.description ?? "",
          objective: clause.objective ?? "",
          parentClauseId: null,
        });
      }

      for (const { parentNumber, clause } of flatClauses) {
        if (parentNumber === null) continue;
        const ref = adminDb.collection("iso_clauses").doc();
        const parentId = parentIdByNumber.get(parentNumber) ?? null;
        batch.set(ref, {
          orgId: session.orgId,
          clauseNumber: clause.clauseNumber,
          title: clause.title,
          description: clause.description ?? "",
          objective: clause.objective ?? "",
          parentClauseId: parentId,
        });
      }
    }
  );

  revalidatePath("/organization");
  revalidatePath("/", "layout"); // sidebar fetches clauses in the layout - must refresh after seeding
  return { success: true, clauseCount: flatClauses.length };
}

const createClauseSchema = z.object({
  clauseNumber: z.string().min(1).max(20),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  objective: z.string().max(1000).optional(),
  parentClauseId: z.string().nullable().optional(),
});

export async function createIsoClause(input: z.infer<typeof createClauseSchema>) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "iso_clauses", "create")) {
    throw new Error("FORBIDDEN: role cannot create ISO clauses.");
  }

  const parsed = createClauseSchema.parse(input);
  const ref = adminDb.collection("iso_clauses").doc();

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "iso_clause.create",
      module: "iso_clauses",
      targetId: ref.id,
      targetType: "iso_clause",
      oldValue: null,
      newValue: parsed,
    },
    (batch) => {
      batch.set(ref, {
        orgId: session.orgId,
        clauseNumber: parsed.clauseNumber,
        title: parsed.title,
        description: parsed.description ?? "",
        objective: parsed.objective ?? "",
        parentClauseId: parsed.parentClauseId ?? null,
      });
    }
  );

  revalidatePath("/", "layout");
  return { id: ref.id };
}

const updateClauseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  objective: z.string().max(1000).optional(),
});

export async function updateIsoClause(input: z.infer<typeof updateClauseSchema>) {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "iso_clauses", "update")) {
    throw new Error("FORBIDDEN: role cannot update ISO clauses.");
  }

  const parsed = updateClauseSchema.parse(input);
  const ref = adminDb.collection("iso_clauses").doc(parsed.id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Clause not found.");

  const data = snap.data()!;
  if (data.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: clause belongs to a different organization.");
  }

  const { id, ...fields } = parsed;
  const updatePayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) updatePayload[key] = value;
  }

  await runAuditedWrite(
    {
      orgId: session.orgId,
      userId: session.uid,
      userName: session.email ?? session.uid,
      action: "iso_clause.update",
      module: "iso_clauses",
      targetId: id,
      targetType: "iso_clause",
      oldValue: data,
      newValue: updatePayload,
    },
    (batch) => {
      batch.update(ref, updatePayload);
    }
  );

  revalidatePath(`/clauses/${id}`);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function listIsoClauses() {
  const session = await requireServerSession();

  if (!hasPermission(session.role, "iso_clauses", "read")) {
    throw new Error("FORBIDDEN: role cannot view ISO clauses.");
  }

  const snap = await adminDb
    .collection("iso_clauses")
    .where("orgId", "==", session.orgId)
    .orderBy("clauseNumber", "asc")
    .get();

  return serializeFirestoreData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

/**
 * Documents tagged against a given clause — the "clause<->document
 * mapping" half of §9's Phase 2 scope. documents.clauseIds is an array
 * field (§3), so this uses array-contains rather than a join table.
 */
export async function listDocumentsForClause(clauseId: string) {
  const session = await requireServerSession();

  const clauseSnap = await adminDb.collection("iso_clauses").doc(clauseId).get();
  if (!clauseSnap.exists) throw new Error("Clause not found.");
  if (clauseSnap.data()!.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: clause belongs to a different organization.");
  }

  const snap = await adminDb
    .collection("documents")
    .where("orgId", "==", session.orgId)
    .where("clauseIds", "array-contains", clauseId)
    .get();

  return serializeFirestoreData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}
