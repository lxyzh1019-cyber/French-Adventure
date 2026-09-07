// Firebase is loaded from the gstatic CDN at runtime, exactly as before the module
// split. The URLs go through dynamic import with @vite-ignore so the bundler leaves
// them as literal runtime URLs instead of trying to inline the SDK — same network
// behaviour, same failure modes, same offline story as the original inline script.
//
// NOTE: the apiKey below is a public Firebase client identifier, not a secret. It is
// designed to ship in the browser; access is governed by Firestore security rules.
// See docs/known-risks.md — this project currently has no authentication.
import { todayKey } from '../util/dates.js';

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
// Reports the OUTCOME of the read, not just data. Previously a missing document
// and a failed read were indistinguishable — `if (snap.exists()) onData(...)`
// simply called nothing in both cases — so the app could not tell "this learner
// has no saved progress" from "we could not reach the server". It assumed the
// former and wrote a blank profile over the latter.
//
// onStatus is called with exactly one of:
//   'loaded' — a document was read; its data has been passed to onData
//   'absent' — the server positively confirmed no document exists
//   'error'  — the read failed; the caller must keep waiting, never assume absent
window.fbInit = async (player, onData, onStatus = () => {}) => {
  const ref = doc(db, "french_game", player);

  try {
    // Guaranteed baseline read, so data is present before any snapshot fires.
    const snap = await getDoc(ref);
    if (snap.exists()) { onData(snap.data()); onStatus('loaded'); }
    else onStatus('absent');
  } catch (e) {
    console.warn("FB baseline read failed", e);
    onStatus('error');
    // Fall through: the live listener may still succeed and resolve the status.
  }

  try {
    if (window.fbListeners[player]) window.fbListeners[player]();
    window.fbListeners[player] = onSnapshot(ref, s => {
      if (s.exists()) { onData(s.data()); onStatus('loaded'); }
      else onStatus('absent');
    }, e => { console.warn("FB listen err", e); onStatus('error'); });
  } catch (e) {
    console.warn("FB listen attach failed", e);
    onStatus('error');
  }
};

// Last-resort guard. The write barrier in the app should mean a blank profile is
// never offered here at all; this refuses one anyway, because the cost of a
// wasted write is nothing and the cost of a wrong one is a child's whole history.
//
// The check only costs a read in the suspicious case — a profile with no stars —
// so the normal path is unchanged.
window.fbSave = async (player, data) => {
  try {
    const ref = doc(db, "french_game", player);

    if (!Number(data?.totalStars)) {
      const existing = await getDoc(ref);
      if (existing.exists() && Number(existing.data()?.totalStars) > 0) {
        console.error(
          `REFUSED: tried to overwrite ${player}'s profile ` +
          `(${existing.data().totalStars} stars) with an empty one. ` +
          `This is the data-loss guard; the write was discarded.`);
        return false;
      }
    }

    await setDoc(ref, data);
    return true;
  } catch(e) { console.warn("FB save err", e); return false; }
};

// Daily backup — writes to french_game_backup/{player}_{date} once per day.
// Only writes if totalStars > 0 (never snapshots a blank/corrupted state).
// Never overwrites an existing day's backup (getDoc check first).
window.fbBackupSave = async (player, data) => {
  try {
    // Must match the app's day key exactly: toISOString is UTC, which after
    // ~17:00 Edmonton names tomorrow and files the backup under the wrong day.
    const dateKey = todayKey();
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
