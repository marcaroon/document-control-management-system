import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Client SDK init. These NEXT_PUBLIC_* env vars are safe to expose to the
 * browser — Firebase's actual access control comes from Security Rules
 * (firestore.rules), not from hiding this config.
 *
 * Do NOT import this file from anything in app/actions/** — server actions
 * must use lib/firebase/admin.ts instead. Mixing the two defeats the
 * "server-actions-only for sensitive writes" guarantee in spec §4 Rule 1.
 *
 * NOTE: Firebase Storage was REMOVED here per explicit decision — file
 * storage now goes through Cloudinary directly from the client (see
 * lib/storage/upload.ts), not through this SDK at all.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export const firebaseApp = getFirebaseApp();
export const auth: Auth = getAuth(firebaseApp);
export const db: Firestore = getFirestore(firebaseApp);

/**
 * Connects to the local Emulator Suite when NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true.
 * Per §11 handoff note #1: write and test against the emulator before
 * touching production. Call this once, early, e.g. from a client
 * provider component.
 */
let emulatorsConnected = false;
export function connectEmulatorsIfConfigured() {
  if (emulatorsConnected) return;
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== "true") return;
  if (typeof window === "undefined") return;

  import("firebase/auth").then(({ connectAuthEmulator }) => {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  });
  import("firebase/firestore").then(({ connectFirestoreEmulator }) => {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  });
  emulatorsConnected = true;
}
