/* ============================================================
   SynapseX — shared public configuration
   ------------------------------------------------------------
   Everything in this file is PUBLIC BY DESIGN:
   - Firebase web config identifies the project only; access is
     gated by Firestore Security Rules (see firestore.rules),
     not by secrecy of these keys.
   - The Cloudinary unsigned preset name is public too; abuse is
     bounded by the preset's own restrictions (folder, allowed
     formats, max file size) configured in the Cloudinary console.
   - The Cloudinary API Secret must NEVER appear here or anywhere
     client-side.
   ============================================================ */

/* Firebase web app config — Console → Project settings → Your apps */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC0j1RAadPRzXrq-HmwEPr0cndQCzUzoUs",
  authDomain: "portfolio-6efc7.firebaseapp.com",
  projectId: "portfolio-6efc7",
  storageBucket: "portfolio-6efc7.firebasestorage.app",
  messagingSenderId: "1050427048596",
  appId: "1:1050427048596:web:2bf4cca3da97b486b26a81",
  measurementId: "G-Z4YSSLKD27"
};

/* Cloudinary unsigned upload — Console → Settings → Upload → Upload presets */
export const CLOUDINARY = {
  cloudName: "ldwwwubk",
  uploadPreset: "portfolio_unsigned",
  folder: "portfolio"
};

/* The single admin account allowed to write (must match firestore.rules) */
export const ADMIN_EMAIL = "Hossein.moayedfard@gmail.com";

/* Firebase JS SDK version pinned on the gstatic CDN (kept in one place) */
export const FIREBASE_SDK_VERSION = "10.12.2";
