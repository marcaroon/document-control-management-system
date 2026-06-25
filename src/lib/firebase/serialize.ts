import "server-only";
import { Timestamp } from "firebase-admin/firestore";

/**
 * Recursively converts all Firestore `Timestamp` instances in an object
 * tree into ISO-8601 strings (`Timestamp.toDate().toISOString()`).
 *
 * WHY THIS EXISTS: Next.js App Router refuses to serialize class
 * instances across the Server Component → Client Component boundary
 * (the "Only plain objects, and a few built-ins, can be passed to
 * Client Components from Server Components" error). Firestore's
 * `DocumentSnapshot.data()` returns Timestamp class instances for every
 * date field (createdAt, updatedAt, timestamp, effectiveDate, etc.),
 * which means ANY server action that spreads `...d.data()` and returns
 * the result to the client will blow up the moment a date field exists
 * on the document.
 *
 * Apply this to the RETURN VALUE of every server action / data-fetching
 * function that passes Firestore data to client components. Do NOT
 * apply it to data used purely server-side (e.g. inside
 * runAuditedWrite's oldValue/newValue — those never cross the
 * serialization boundary).
 *
 * The conversion is intentionally lossy (nanosecond precision is
 * discarded by toISOString()) — none of this app's UI needs sub-second
 * precision, and a human-readable ISO string is strictly more useful
 * for display/formatting than a `{_seconds, _nanoseconds}` tuple.
 */
export function serializeFirestoreData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (data instanceof Timestamp) {
    return data.toDate().toISOString() as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => serializeFirestoreData(item)) as unknown as T;
  }

  if (typeof data === "object" && data !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializeFirestoreData(value);
    }
    return result as T;
  }

  return data;
}
