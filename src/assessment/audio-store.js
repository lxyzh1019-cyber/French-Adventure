// Where a spoken answer's audio lives.
//
// On the device that recorded it, in IndexedDB, and nowhere else.
//
// Three reasons, and none of them is a preference:
//   • §3.6 of the master plan forbids storing raw child audio by default.
//   • A Firestore document caps at 1 MiB and no storage bucket is configured,
//     so a minute of audio has nowhere to sync to even if it should.
//   • scoring.speaking requires a person to LISTEN to the original recording;
//     a transcript cannot score comprehensibility, fluency or pronunciation.
//
// The consequence has to be stated rather than discovered: a parent who opens
// the review panel on the other iPad sees the prompts waiting for review with no
// audio to play. The response records which device holds each clip, and the
// clips should be reviewed on the day they are recorded — WebKit evicts
// script-writable storage after about a week unused, which is the same eviction
// that cost this family a child's progress once already.

const DB_NAME = 'french_assessment_audio';
const STORE = 'clips';
const DB_VERSION = 1;

/** Key a clip by the run and item it belongs to, so it can never be misfiled. */
export function clipKey(runId, itemId, attemptIndex = 0) {
  return `${runId}/${itemId}#${Number(attemptIndex) || 0}`;
}

function openDb(idb = globalThis.indexedDB) {
  if (!idb) return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore(mode, fn, idb) {
  return openDb(idb).then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let out;
    try { out = fn(store); } catch (e) { reject(e); return; }
    // An IDBRequest carries its value on `result`, and a missing key gives
    // `result: undefined`. `out?.result ?? out` would fall back to the request
    // object itself there — which is truthy, so a missing clip read as present.
    tx.oncomplete = () => {
      db.close();
      resolve(out && typeof out === 'object' && 'result' in out ? out.result : out);
    };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  }));
}

/**
 * Every operation here is best-effort and resolves rather than throwing.
 *
 * Storage can be unavailable — a private window, a browser that blocks site
 * data, a full quota. Losing a clip is bad; losing the whole assessment because
 * a clip could not be filed would be worse, and the response record survives
 * either way with audio_ref telling the truth about what is there.
 */
export function createAudioStore({ idb = globalThis.indexedDB, deviceId = () => null } = {}) {
  return {
    async put(runId, itemId, blob, { attemptIndex = 0, durationMs = null, mimeType = null } = {}) {
      const key = clipKey(runId, itemId, attemptIndex);
      const record = {
        key, run_id: runId, item_id: itemId, attempt_index: attemptIndex,
        blob, duration_ms: durationMs, mime_type: mimeType,
        device_id: deviceId(), stored_at_utc: Date.now(),
      };
      try {
        await withStore('readwrite', s => s.put(record, key), idb);
        return { ok: true, key, device_id: record.device_id };
      } catch (e) {
        console.warn('assessment audio store failed', e);
        return { ok: false, key, error: String(e?.message || e) };
      }
    },

    async get(runId, itemId, attemptIndex = 0) {
      try {
        return await withStore('readonly', s => s.get(clipKey(runId, itemId, attemptIndex)), idb) ?? null;
      } catch { return null; }
    },

    async has(runId, itemId, attemptIndex = 0) {
      return !!(await this.get(runId, itemId, attemptIndex));
    },

    /** Every clip this device holds, for the review panel to list. */
    async listKeys() {
      try { return await withStore('readonly', s => s.getAllKeys(), idb) ?? []; }
      catch { return []; }
    },

    /**
     * Delete a clip. §3.6 requires a parent control to remove saved recordings,
     * and this is what it calls.
     */
    async remove(runId, itemId, attemptIndex = 0) {
      try {
        await withStore('readwrite', s => s.delete(clipKey(runId, itemId, attemptIndex)), idb);
        return { ok: true };
      } catch (e) { return { ok: false, error: String(e?.message || e) }; }
    },

    async removeAllForRun(runId) {
      const keys = await this.listKeys();
      const mine = keys.filter(k => String(k).startsWith(`${runId}/`));
      for (const k of mine) {
        try { await withStore('readwrite', s => s.delete(k), idb); } catch { /* keep going */ }
      }
      return { ok: true, removed: mine.length };
    },
  };
}
