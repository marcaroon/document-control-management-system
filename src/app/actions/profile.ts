"use server";

import "server-only";
import { z } from "zod";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { serializeFirestoreData } from "@/lib/firebase/serialize";
import { requireServerSession } from "@/lib/auth/session";
import { ROLE_LABELS, type Role } from "@/lib/types/core";

/**
 * Fetches the currently logged-in user's profile data (name, email,
 * role, department name). This is NOT gated by any module permission
 * — every authenticated user can view their own profile by definition.
 */
export async function getMyProfile() {
  const session = await requireServerSession();

  const userSnap = await adminDb.collection("users").doc(session.uid).get();
  if (!userSnap.exists) {
    throw new Error("User profile not found.");
  }

  const userData = serializeFirestoreData(userSnap.data()!);

  // Resolve department name
  let departmentName: string | null = null;
  if (userData.departmentId) {
    const deptSnap = await adminDb
      .collection("departments")
      .doc(userData.departmentId as string)
      .get();
    departmentName = deptSnap.exists ? (deptSnap.data()!.name as string) : null;
  }

  return {
    uid: session.uid,
    name: (userData.name as string) ?? "",
    email: (userData.email as string) ?? session.email ?? "",
    role: (userData.role as Role) ?? session.role,
    roleLabel: ROLE_LABELS[(userData.role as Role) ?? session.role],
    departmentName,
  };
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters."),
});

/**
 * Changes the current user's own password. Verifies the current password
 * via Firebase Auth REST API (signInWithPassword) before applying the
 * change via Admin SDK.
 *
 * Why REST API for verification: Firebase Admin SDK can UPDATE a user's
 * password but has no "verify password" method. The only server-side
 * way to check the old password is to attempt a sign-in with it via
 * the Identity Platform REST endpoint. This is the same approach used
 * by Firebase's own client SDK under the hood.
 */
export async function changeMyPassword(
  input: z.infer<typeof changePasswordSchema>
) {
  const session = await requireServerSession({ checkRevoked: true });
  const parsed = changePasswordSchema.parse(input);

  // Step 1: Verify current password via Firebase Auth REST API.
  // Uses the same FIREBASE_API_KEY the client uses — this is a public
  // key by design (same as NEXT_PUBLIC_FIREBASE_API_KEY), safe to use
  // server-side for this verification call.
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Server configuration error: Firebase API key not available."
    );
  }

  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: session.email,
        password: parsed.currentPassword,
        returnSecureToken: false,
      }),
    }
  );

  if (!verifyRes.ok) {
    const errorData = await verifyRes.json().catch(() => ({}));
    const errorMessage =
      errorData?.error?.message ?? "INVALID_PASSWORD";

    if (
      errorMessage === "INVALID_PASSWORD" ||
      errorMessage === "INVALID_LOGIN_CREDENTIALS"
    ) {
      throw new Error("Current password is incorrect.");
    }
    throw new Error(`Password verification failed: ${errorMessage}`);
  }

  // Step 2: Update password via Admin SDK.
  await adminAuth.updateUser(session.uid, {
    password: parsed.newPassword,
  });

  return { success: true };
}
