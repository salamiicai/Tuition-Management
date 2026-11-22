// ─────────────────────────────────────────────────────────────
//  CONFIG — edit ADMIN_EMAIL (and the same email in firestore.rules)
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: "AIzaSyBcU3jFzp2o0jeXU_9mRUFbhzY0BUIsJV4",
  authDomain: "tuition-management-441d5.firebaseapp.com",
  projectId: "tuition-management-441d5",
  storageBucket: "tuition-management-441d5.firebasestorage.app",
  messagingSenderId: "983403477220",
  appId: "1:983403477220:web:22c3f2a9dc3a37a2e414f1"
};

// The ONLY Google account allowed to use the teacher dashboard.
// Must match the email inside firestore.rules (lowercase).
export const ADMIN_EMAIL = "hossainfardin369@gmail.com";
