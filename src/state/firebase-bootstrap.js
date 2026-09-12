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

// ── Why the cloud is not working ────────────────────────────────────────────
//
// Every failure below used to land in console.warn and become a generic
// 'error', so "we are offline", "the security rules refuse this" and "that
// project does not exist" all looked identical from the screen: sync simply
// never completed and nothing said why. The one a person actually needs to act
// on is a configuration failure, and it is the one that was hardest to see.
//
// This names the failure in a sentence a parent can act on, and remembers the
// most recent one so the sync line can show it.

const FAILURE_TEXT = {
  'permission-denied':
    `The cloud refused this ("permission-denied"). The security rules on Firebase `
    + `project ${firebaseConfig.projectId} do not allow this read or write. The app `
    + `itself is working; the rules are the thing to change.`,
  unauthenticated:
    `The cloud wants a signed-in user ("unauthenticated"), and this app has no `
    + `sign-in. Either the rules on project ${firebaseConfig.projectId} were changed `
    + `to require one, or this app needs authentication adding.`,
  'not-found':
    `The cloud says that location does not exist ("not-found"). Check that project `
    + `${firebaseConfig.projectId} is the right one and has a Firestore database.`,
  unavailable:
    'The cloud could not be reached. This is normally the network, not a setting. '
    + 'Work carries on being saved on this iPad.',
  'failed-precondition':
    'Firestore refused the request as not ready ("failed-precondition"). This is '
    + 'usually a database that has not finished being created, or a missing index.',
  'resource-exhausted':
    `Project ${firebaseConfig.projectId} is over its Firebase quota `
    + `("resource-exhausted"). Nothing will sync until the quota resets or the plan `
    + `changes.`,
  'invalid-argument':
    'Firestore rejected the data as invalid ("invalid-argument"). This is a defect '
    + 'in the app, not a setting — worth reporting.',
};

let lastFailure = null;

/** A plain sentence for one Firestore error, and the code it came from. */
export function describeCloudFailure(e) {
  const code = String(e?.code || '').replace(/^firestore\//, '') || null;
  return {
    code,
    configuration: code === 'permission-denied' || code === 'unauthenticated'
      || code === 'not-found' || code === 'failed-precondition',
    text: FAILURE_TEXT[code]
      || `The cloud failed for a reason the app does not recognise`
         + `${code ? ` ("${code}")` : ''}: ${e?.message || e}`,
  };
}

/** The most recent cloud failure, or null if the last thing tried worked. */
export function lastCloudFailure() { return lastFailure; }

/** Record a failure and say so once, with the reason rather than the object. */
function noteFailure(where, e) {
  lastFailure = { ...describeCloudFailure(e), where, at: Date.now() };
  console.warn(`Firebase — ${where}: ${lastFailure.text}`, e);
  return lastFailure;
}

/** Something worked, so an earlier failure is no longer the current truth. */
function noteSuccess() { lastFailure = null; }

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
    noteFailure('reading saved progress', e);
    onStatus('error');
    // Fall through: the live listener may still succeed and resolve the status.
  }

  try {
    if (window.fbListeners[player]) window.fbListeners[player]();
    window.fbListeners[player] = onSnapshot(ref, s => {
      if (s.exists()) { onData(s.data()); onStatus('loaded'); }
      else onStatus('absent');
    }, e => { noteFailure('watching for changes', e); onStatus('error'); });
  } catch (e) {
    noteFailure('watching for changes', e);
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
    noteSuccess();
    return true;
  } catch(e) { noteFailure('saving progress', e); return false; }
};

// ── Assessment store ────────────────────────────────────────────────────────
//
// A separate collection, not a field on the profile. fbSave writes the profile
// with setDoc, which is a full document replace, so folding runs into it would
// rewrite a child's entire history once per autosaved response.
//
// These live here rather than in a module of their own because the Firestore
// functions above are closure-local to this IIFE and are not exported; a second
// collection written from elsewhere would have to re-import the CDN itself.

// Its own listener map. fbListeners is keyed by player alone, so reusing it
// would unsubscribe the profile listener the first time an assessment listener
// attached for the same learner.
window.fbAssessListeners = {};

/** Same three outcomes, same contract, as fbInit. See the note above it. */
window.fbAssessInit = async (player, onData, onStatus = () => {}) => {
  const ref = doc(db, "french_game_assessment", player);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) { onData(snap.data()); onStatus('loaded'); }
    else onStatus('absent');
  } catch (e) {
    noteFailure('reading the check-in', e);
    onStatus('error');
  }

  try {
    if (window.fbAssessListeners[player]) window.fbAssessListeners[player]();
    window.fbAssessListeners[player] = onSnapshot(ref, s => {
      if (s.exists()) { onData(s.data()); onStatus('loaded'); }
      else onStatus('absent');
    }, e => { console.warn("FB assessment listen err", e); onStatus('error'); });
  } catch (e) {
    noteFailure('watching the check-in', e);
    onStatus('error');
  }
};

// The same last-resort guard as fbSave, with the predicate the assessment store
// actually has. A profile is "real" if it has stars; a store is real if it holds
// runs, so refuse a write that would drop runs the server already has. Responses
// are only ever added to a run, never removed, so this cannot block a legitimate
// write — and an assessment run is evidence collected once under test
// conditions, which a second sitting does not reproduce.
window.fbAssessSave = async (player, data) => {
  try {
    const ref = doc(db, "french_game_assessment", player);
    const incoming = Object.keys(data?.runs || {}).length;

    const existing = await getDoc(ref);
    if (existing.exists()) {
      const held = Object.keys(existing.data()?.runs || {}).length;
      if (incoming < held) {
        console.error(
          `REFUSED: tried to overwrite ${player}'s assessment store ` +
          `(${held} run(s)) with one holding ${incoming}. ` +
          `This is the data-loss guard; the write was discarded.`);
        return false;
      }
    } else if (!incoming) {
      return true;   // nothing to create a document for yet
    }

    await setDoc(ref, data);
    noteSuccess();
    return true;
  } catch(e) { noteFailure('saving the check-in', e); return false; }
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
  } catch(e) { noteFailure('writing the daily backup', e); }
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
