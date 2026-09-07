// Firebase is loaded from the gstatic CDN at runtime, exactly as before the module
// split. The URLs go through dynamic import with @vite-ignore so the bundler leaves
// them as literal runtime URLs instead of trying to inline the SDK — same network
// behaviour, same failure modes, same offline story as the original inline script.
//
// NOTE: the apiKey below is a public Firebase client identifier, not a secret. It is
// designed to ship in the browser; access is governed by Firestore security rules.
// See docs/known-risks.md — this project currently has no authentication.
const FIREBASE_APP_URL = "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
const FIREBASE_FS_URL  = "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBvasH4OqU76196ZmZSXX_e8-L2PYnvyaY",
  authDomain: "chore-tracker-a461b.firebaseapp.com",
  projectId: "chore-tracker-a461b",
  storageBucket: "chore-tracker-a461b.firebasestorage.app",
  messagingSenderId: "282740057913",
  appId: "1:282740057913:web:72defcf2e53ae13237eae8"
};

// Resolves once the SDK is loaded and window.fbInit/fbSave/... are installed.
// Resolves to null (never rejects) when the CDN is unreachable, so an offline
// launch degrades to the local-storage mirror exactly as it did before.
export const firebaseReady = (async () => {
  let initializeApp, getFirestore, doc, getDoc, getDocs, onSnapshot, setDoc,
      collection, query, where, orderBy, limit;
  try {
    ({ initializeApp } = await import(/* @vite-ignore */ FIREBASE_APP_URL));
    ({ getFirestore, doc, getDoc, getDocs, onSnapshot, setDoc,
       collection, query, where, orderBy, limit } = await import(/* @vite-ignore */ FIREBASE_FS_URL));
  } catch (e) {
    console.warn("FB SDK load failed — continuing offline", e);
    return null;
  }

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
window.fbListeners = {};

// #14 — Load baseline immediately on open (getDoc), then attach live listener
window.fbInit = async (player, onData) => {
  try {
    const ref = doc(db, "french_game", player);
    // Guaranteed baseline read — ensures data is present before any snapshot fires
    const snap = await getDoc(ref);
    if (snap.exists()) onData(snap.data());
    // Then attach real-time listener for cross-device sync
    if (window.fbListeners[player]) window.fbListeners[player]();
    window.fbListeners[player] = onSnapshot(ref, s => {
      if (s.exists()) onData(s.data());
    }, e => console.warn("FB listen err", e));
  } catch(e) { console.warn("FB init err", e); }
};

window.fbSave = async (player, data) => {
  try {
    const ref = doc(db, "french_game", player);
    await setDoc(ref, data);
    return true;
  } catch(e) { console.warn("FB save err", e); return false; }
};

// Daily backup — writes to french_game_backup/{player}_{date} once per day.
// Only writes if totalStars > 0 (never snapshots a blank/corrupted state).
// Never overwrites an existing day's backup (getDoc check first).
window.fbBackupSave = async (player, data) => {
  try {
    const dateKey = new Date().toISOString().slice(0, 10);
    const ref = doc(db, "french_game_backup", player + "_" + dateKey);
    const existing = await getDoc(ref);
    if (existing.exists()) return; // already backed up today
    if (!data || !Number(data.totalStars)) return; // never write a blank
    await setDoc(ref, { ...data, backedUpAt: dateKey, player });
  } catch(e) { console.warn("FB backup err", e); }
};

// Returns up to 7 most recent backup docs for a player.
window.fbBackupList = async (player) => {
  try {
    const q = query(
      collection(db, "french_game_backup"),
      where("player", "==", player),
      orderBy("backedUpAt", "desc"),
      limit(7)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.warn("FB backup list err", e); return []; }
};

  // Kept for backward compatibility with any listener still bound to it.
  window.dispatchEvent(new Event('fbReady'));
  return { db };
})();
