// ─────────────────────────────────────────────────────────────
//  CONFIG — edit ADMIN_EMAIL (and the same email in firestore.rules)
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: "PASTE_FROM_FIREBASE_CONSOLE",
  authDomain: "PROJECT_ID.firebaseapp.com",
  projectId: "PROJECT_ID",
  storageBucket: "PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE",
  appId: "PASTE"
};

// The ONLY Google account allowed to use the teacher dashboard.
// Must match the email inside firestore.rules (lowercase).
export const ADMIN_EMAIL = "YOUR_EMAIL@gmail.com";
