/**
 * Account seeder for local/manual testing.
 *
 * WHAT THIS CREATES (idempotent — safe to re-run):
 *   - One organization (only if none exists yet for the given org ID)
 *   - Two departments: "Quality Assurance" and "Production"
 *   - Six Firebase Auth users + matching Firestore users/{uid} docs,
 *     one per role plus a second department_user in a different
 *     department so cross-department RBAC scoping is actually testable
 *     (not just "does department_user role work at all"):
 *       - super_admin@mail.com           (Super Admin)
 *       - controller@mail.com            (Document Controller)
 *       - mr@mail.com                    (Management Representative)
 *       - qa-user@mail.com               (Department User — Quality Assurance)
 *       - production-user@mail.com       (Department User — Production)
 *       - readonly@mail.com              (Read Only)
 *
 * All accounts share ONE PASSWORD, read from SEED_PASSWORD in your
 * environment (.env.local) — never hardcoded in this file.
 *
 * WHY THIS IS A STANDALONE SCRIPT, NOT REUSED APP CODE: the Server
 * Actions in app/actions/*.ts all start from requireServerSession() —
 * there is no session yet when you're seeding the very first users, by
 * definition. This script talks to the Admin SDK and Firestore
 * directly, the same way app/actions/users.ts inviteUser() does
 * internally, but without the session/permission-check wrapper around
 * it (there's nothing to check permissions against yet). It also avoids
 * importing anything from src/lib/firebase/admin.ts, which has a
 * `server-only` import at the top — that guard is meant to stop exactly
 * this kind of file (a script run outside the Next.js server runtime)
 * from importing it, so this script intentionally duplicates the small
 * amount of Admin SDK init logic instead of importing it.
 *
 * USAGE:
 *   npm run seed:accounts
 *
 * This is NOT run automatically by `npm run dev` or `npm run build` —
 * it's a manual, deliberate action you run once (or re-run any time you
 * want a clean set of test accounts).
 */

import * as dotenv from "dotenv";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SEED_ORG_ID = process.env.SEED_ORG_ID || "seed-org";
const SEED_ORG_NAME = process.env.SEED_ORG_NAME || "PT Pakis Jaya Garmindo (Seed)";
const SEED_PASSWORD = process.env.SEED_PASSWORD;

if (!SEED_PASSWORD) {
  console.error(
    "Missing SEED_PASSWORD in your environment.\n" +
      "Add this to .env.local before running the seeder:\n\n" +
      "  SEED_PASSWORD=choose-a-password-at-least-8-characters\n"
  );
  process.exit(1);
}
if (SEED_PASSWORD.length < 8) {
  console.error("SEED_PASSWORD must be at least 8 characters (Firebase Auth's minimum).");
  process.exit(1);
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env.local — " +
        "same credentials the app itself uses. See .env.example."
    );
    process.exit(1);
  }

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket });
}

const app = getAdminApp();
const auth = getAuth(app);
const db = getFirestore(app);

interface SeedDepartment {
  key: "qa" | "production";
  name: string;
}

const DEPARTMENTS: SeedDepartment[] = [
  { key: "qa", name: "Quality Assurance" },
  { key: "production", name: "Production" },
];

interface SeedAccount {
  email: string;
  name: string;
  role:
    | "super_admin"
    | "document_controller"
    | "management_representative"
    | "department_user"
    | "read_only";
  departmentKey: "qa" | "production" | null;
}

const ACCOUNTS: SeedAccount[] = [
  { email: "super_admin@mail.com", name: "Super Admin", role: "super_admin", departmentKey: null },
  {
    email: "controller@mail.com",
    name: "Document Controller",
    role: "document_controller",
    departmentKey: null,
  },
  {
    email: "mr@mail.com",
    name: "Management Representative",
    role: "management_representative",
    departmentKey: null,
  },
  {
    email: "qa-user@mail.com",
    name: "QA Department User",
    role: "department_user",
    departmentKey: "qa",
  },
  {
    email: "production-user@mail.com",
    name: "Production Department User",
    role: "department_user",
    departmentKey: "production",
  },
  { email: "readonly@mail.com", name: "Read Only Viewer", role: "read_only", departmentKey: null },
];

async function ensureOrganization(): Promise<void> {
  const ref = db.collection("organizations").doc(SEED_ORG_ID);
  const snap = await ref.get();
  if (snap.exists) {
    console.log(`Organization "${SEED_ORG_ID}" already exists — leaving it as-is.`);
    return;
  }

  await ref.set({
    name: SEED_ORG_NAME,
    industry: "Garment Manufacturing",
    description: "Seeded organization for local testing.",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log(`Created organization "${SEED_ORG_NAME}" (${SEED_ORG_ID}).`);
}

async function ensureDepartments(): Promise<Record<string, string>> {
  const idByKey: Record<string, string> = {};

  for (const dept of DEPARTMENTS) {
    const existing = await db
      .collection("departments")
      .where("orgId", "==", SEED_ORG_ID)
      .where("name", "==", dept.name)
      .limit(1)
      .get();

    if (!existing.empty) {
      idByKey[dept.key] = existing.docs[0].id;
      console.log(`Department "${dept.name}" already exists — reusing it.`);
      continue;
    }

    const ref = db.collection("departments").doc();
    await ref.set({
      orgId: SEED_ORG_ID,
      name: dept.name,
      headUserId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    idByKey[dept.key] = ref.id;
    console.log(`Created department "${dept.name}".`);
  }

  return idByKey;
}

/**
 * Creates or updates one account end-to-end: Auth user (create if
 * missing, otherwise just reset the password so re-running the seeder
 * always leaves you with known-working credentials), custom claims, and
 * the Firestore users/{uid} doc. Idempotent — safe to re-run.
 */
async function ensureAccount(
  account: SeedAccount,
  departmentIdByKey: Record<string, string>
): Promise<void> {
  const departmentId = account.departmentKey ? departmentIdByKey[account.departmentKey] : null;

  let uid: string;
  let isNewUser = false;
  try {
    const existing = await auth.getUserByEmail(account.email);
    uid = existing.uid;
    await auth.updateUser(uid, { password: SEED_PASSWORD, displayName: account.name });
    console.log(`User ${account.email} already exists — password reset to SEED_PASSWORD.`);
  } catch {
    const created = await auth.createUser({
      email: account.email,
      password: SEED_PASSWORD,
      displayName: account.name,
    });
    uid = created.uid;
    isNewUser = true;
    console.log(`Created user ${account.email}.`);
  }

  await auth.setCustomUserClaims(uid, {
    role: account.role,
    orgId: SEED_ORG_ID,
    departmentId,
  });

  // createdAt is only set on first creation, not overwritten on re-runs
  // — a merge:true write with FieldValue.serverTimestamp() on every
  // run WOULD overwrite it, since merge only protects fields you don't
  // include in the payload, not fields you include with a "new value
  // every time" sentinel like serverTimestamp(). Conditioning on
  // isNewUser is what actually prevents that.
  const userDoc: Record<string, unknown> = {
    orgId: SEED_ORG_ID,
    name: account.name,
    email: account.email,
    role: account.role,
    departmentId,
    isActive: true,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (isNewUser) {
    userDoc.createdAt = FieldValue.serverTimestamp();
  }

  await db.collection("users").doc(uid).set(userDoc, { merge: true });

  console.log(`  -> role=${account.role} departmentId=${departmentId ?? "(none)"}`);
}

async function main() {
  console.log(`\nSeeding org "${SEED_ORG_ID}" and ${ACCOUNTS.length} accounts...\n`);

  await ensureOrganization();
  const departmentIdByKey = await ensureDepartments();

  for (const account of ACCOUNTS) {
    await ensureAccount(account, departmentIdByKey);
  }

  console.log("\nDone. Sign in with any of the emails below and SEED_PASSWORD from .env.local:\n");
  for (const account of ACCOUNTS) {
    console.log(`  ${account.email.padEnd(28)} ${account.role}`);
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
