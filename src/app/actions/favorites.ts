"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { requireServerSession } from "@/lib/auth/session";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * §9 Phase 4: "favorites/recent documents." Combined into one
 * collection — user_document_interactions/{uid}_{documentId} — rather
 * than two separate collections, since every place that reads this data
 * wants both fields together (the document page needs "is this
 * favorited," the dashboard's recent list needs "when was this last
 * viewed"). Splitting them would mean two reads per document for no
 * benefit.
 *
 * Deterministic ID (`${uid}_${documentId}`), same pattern as
 * document_versions in lib/firebase/admin.ts — there is naturally at
 * most one interaction record per (user, document) pair, so a
 * deterministic ID lets toggleFavorite/recordView use a single
 * .doc(id).set({...}, {merge: true}) instead of a query-then-write.
 *
 * THROTTLING, per explicit decision to auto-track recent views: a write
 * on every single page view would mean a frequently-opened document
 * (e.g. the org's Quality Manual) generates a Firestore write on every
 * reload, every render-after-navigation, etc. recordView() only writes
 * if the existing lastViewedAt is more than RECENT_VIEW_THROTTLE_MS old
 * (or doesn't exist yet) — this is a deliberate cost-control measure,
 * not a correctness requirement; "recent documents" doesn't need
 * second-level precision.
 */

const RECENT_VIEW_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

function interactionId(uid: string, documentId: string): string {
  return `${uid}_${documentId}`;
}

export async function toggleFavorite(documentId: string): Promise<{ isFavorite: boolean }> {
  const session = await requireServerSession();

  const docSnap = await adminDb.collection("documents").doc(documentId).get();
  if (!docSnap.exists) throw new Error("Document not found.");
  if (docSnap.data()!.orgId !== session.orgId) {
    throw new Error("FORBIDDEN: document belongs to a different organization.");
  }

  const ref = adminDb
    .collection("user_document_interactions")
    .doc(interactionId(session.uid, documentId));
  const snap = await ref.get();
  const currentlyFavorite = snap.data()?.isFavorite === true;

  await ref.set(
    {
      uid: session.uid,
      documentId,
      orgId: session.orgId,
      isFavorite: !currentlyFavorite,
    },
    { merge: true }
  );

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/dashboard");
  return { isFavorite: !currentlyFavorite };
}

/**
 * Records that the current user viewed this document, subject to the
 * throttle described above. Deliberately does NOT go through
 * runAuditedWrite() / write an audit_logs row — viewing a document is
 * not a mutating action in the sense §4's audit trail rules care about
 * (it changes nothing about the document itself, only the viewer's own
 * "recently viewed" list), so adding it to the audit trail would be
 * noise, not signal, in an audit log meant for compliance-relevant
 * actions.
 */
export async function recordView(documentId: string): Promise<void> {
  const session = await requireServerSession();

  const ref = adminDb
    .collection("user_document_interactions")
    .doc(interactionId(session.uid, documentId));
  const snap = await ref.get();

  const lastViewedAt = snap.data()?.lastViewedAt as Timestamp | undefined;
  if (lastViewedAt) {
    const ageMs = Date.now() - lastViewedAt.toMillis();
    if (ageMs < RECENT_VIEW_THROTTLE_MS) {
      return;
    }
  }

  await ref.set(
    {
      uid: session.uid,
      documentId,
      orgId: session.orgId,
      lastViewedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

const documentIdSchema = z.string().min(1);

export async function getFavoriteStatus(documentId: string): Promise<boolean> {
  const session = await requireServerSession();
  const parsed = documentIdSchema.parse(documentId);

  const snap = await adminDb
    .collection("user_document_interactions")
    .doc(interactionId(session.uid, parsed))
    .get();

  return snap.data()?.isFavorite === true;
}

export interface RecentDocumentEntry {
  documentId: string;
  documentNumber: string;
  title: string;
  lastViewedAt: string | null;
}

export async function listRecentDocuments(limit = 5): Promise<RecentDocumentEntry[]> {
  const session = await requireServerSession();

  const snap = await adminDb
    .collection("user_document_interactions")
    .where("uid", "==", session.uid)
    .where("orgId", "==", session.orgId)
    .orderBy("lastViewedAt", "desc")
    .limit(limit)
    .get();

  const entries = snap.docs.map((d) => d.data()).filter((d) => d.lastViewedAt);

  const docsSnaps = await Promise.all(
    entries.map((e) => adminDb.collection("documents").doc(e.documentId).get())
  );

  return serializeFirestoreData(
    entries
      .map((entry, i) => {
        const docData = docsSnaps[i].data();
        if (!docData) return null;
        return {
          documentId: entry.documentId,
          documentNumber: docData.documentNumber,
          title: docData.title,
          lastViewedAt: entry.lastViewedAt,
        };
      })
      .filter((e): e is RecentDocumentEntry => e !== null)
  );
}

export interface FavoriteDocumentEntry {
  documentId: string;
  documentNumber: string;
  title: string;
}

export async function listFavoriteDocuments(): Promise<FavoriteDocumentEntry[]> {
  const session = await requireServerSession();

  const snap = await adminDb
    .collection("user_document_interactions")
    .where("uid", "==", session.uid)
    .where("orgId", "==", session.orgId)
    .where("isFavorite", "==", true)
    .get();

  const docsSnaps = await Promise.all(
    snap.docs.map((d) => adminDb.collection("documents").doc(d.data().documentId).get())
  );

  return serializeFirestoreData(
    snap.docs
      .map((d, i) => {
        const docData = docsSnaps[i].data();
        if (!docData) return null;
        return {
          documentId: d.data().documentId,
          documentNumber: docData.documentNumber,
          title: docData.title,
        };
      })
      .filter((e): e is FavoriteDocumentEntry => e !== null)
  );
}
