// Persistence for the assessment store.
//
// The only assessment module that touches storage. Everything else is pure, so
// the model, the migration and the merge can be tested without a browser and
// this file is the single place a storage mistake can be made.
//
// It copies saveState's barrier deliberately and in the same order, because the
// failure it prevents is the one that has already happened to this family once:
// storage is evicted after a week unused, the app starts from an empty default,
// and the first write full-replaces the server's copy. The barrier is
//
//   'pending' — no answer yet. NEVER write to the cloud.
//   'loaded'  — a document was read; safe to write.
//   'absent'  — the server confirmed no document exists; safe to create one.
//
// A failed read stays 'pending' for ever. It is never promoted to 'absent'.
//
// Cloud and storage are injected so the barrier itself is unit-testable; the
// app passes the real window.

import { defaultAssessmentStore } from './run-model.js';
import { migrateAssessmentStore } from './run-migrations.js';
import { mergeAssessmentStores } from './run-merge.js';

export const ASSESSMENT_LOCAL_PREFIX = 'french_assessment_local_';

const now = () => Date.now();

/** True when a store holds anything worth writing a document for. */
export function hasAnyRuns(store) {
  return Object.keys(store?.runs || {}).length > 0;
}

export function createAssessmentStore({
  players = ['jenn', 'jess'],
  storage = globalThis.localStorage,
  cloud = globalThis,          // supplies fbAssessInit / fbAssessSave
  onChange = () => {},
} = {}) {
  const stores = {};
  const meta = {};
  const pendingRemote = {};
  for (const p of players) {
    stores[p] = defaultAssessmentStore(p);
    meta[p] = { loadState: 'pending', pendingCloud: false, lastLocalSave: 0, lastCloudOk: 0 };
    pendingRemote[p] = null;
  }

  // A run is in progress on this device. A remote snapshot arriving mid-run is
  // queued rather than applied, exactly as the profile queues one mid-round:
  // swapping the store out from under a live section could change the plan the
  // learner is part-way through.
  let liveFor = null;

  const key = p => ASSESSMENT_LOCAL_PREFIX + p;

  function readLocal(p) {
    try {
      const raw = storage?.getItem(key(p));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function writeLocal(p) {
    try {
      storage?.setItem(key(p), JSON.stringify(stores[p]));
      meta[p].lastLocalSave = now();
    } catch (e) { console.warn('assessment local mirror err', e); }
  }

  function set(p, next) {
    stores[p] = next;
    onChange(p, next);
  }

  return {
    get: p => stores[p],
    meta: p => meta[p],
    hasPendingRemote: p => !!pendingRemote[p],

    /** Mark a run live on this device, so snapshots queue instead of applying. */
    setLive(p) { liveFor = p; },
    clearLive() { liveFor = null; },

    /** Adopt whatever this device already holds, before any network answer. */
    hydrate() {
      for (const p of players) {
        const local = readLocal(p);
        if (!local) continue;
        // Migrate on the way in. A mirror is as old as any cloud document and
        // must not reach the rest of the app in a stale shape.
        set(p, migrateAssessmentStore(local));
        if (hasAnyRuns(stores[p])) meta[p].pendingCloud = true;
      }
    },

    /** A snapshot arrived. Both sides migrate, then join. */
    applyRemote(p, data) {
      if (!data) return false;
      const incoming = migrateAssessmentStore(data);
      if (liveFor === p) {
        pendingRemote[p] = pendingRemote[p]
          ? mergeAssessmentStores(pendingRemote[p], incoming)
          : incoming;
        return false;
      }
      set(p, mergeAssessmentStores(migrateAssessmentStore(stores[p]), incoming));
      meta[p].lastCloudOk = now();
      writeLocal(p);
      return true;
    },

    /** Drain a snapshot queued during a run. Called at section boundaries. */
    applyPendingRemote(p) {
      if (!pendingRemote[p]) return false;
      const incoming = pendingRemote[p];
      pendingRemote[p] = null;
      set(p, mergeAssessmentStores(migrateAssessmentStore(stores[p]), incoming));
      writeLocal(p);
      return true;
    },

    /** Latch the read outcome. 'error' never resolves the barrier. */
    async onLoadStatus(p, status) {
      const m = meta[p];
      if (!m) return;
      if (status === 'error') return;
      if (status !== 'loaded' && status !== 'absent') return;
      if (m.loadState === 'loaded') return;      // already resolved; never demote
      m.loadState = status;
      if (m.pendingCloud) await this.save(p);
    },

    /**
     * Replace this learner's store and persist it.
     *
     * `mutate` receives the current store and returns the next one. It must not
     * mutate in place: the merge compares whole objects, and an in-place edit
     * would make a queued snapshot join against a value that has already moved.
     */
    async update(p, mutate) {
      const next = mutate(stores[p]);
      next.lastUpdatedAt = now();
      set(p, next);
      return this.save(p);
    },

    async save(p) {
      // The local mirror is this device's own copy and is always safe.
      writeLocal(p);

      if (meta[p].loadState === 'pending') {
        meta[p].pendingCloud = true;             // queued; flushed once resolved
        return false;
      }
      // Do not create an empty document for a learner who has not been assessed.
      if (meta[p].loadState === 'absent' && !hasAnyRuns(stores[p])) return false;

      const fn = cloud?.fbAssessSave;
      if (typeof fn !== 'function') { meta[p].pendingCloud = true; return false; }

      const ok = await fn(p, stores[p]);
      meta[p].pendingCloud = !ok;
      if (ok) meta[p].lastCloudOk = now();
      return ok;
    },

    /** Attach the live listeners. Safe to call when the SDK never loaded. */
    listen() {
      const fn = cloud?.fbAssessInit;
      if (typeof fn !== 'function') return false;
      for (const p of players) {
        fn(p,
          data => { this.applyRemote(p, data); },
          status => { void this.onLoadStatus(p, status); });
      }
      return true;
    },

    /** Send anything queued while the barrier was closed or the network down. */
    async flushPending() {
      for (const p of players) if (meta[p].pendingCloud) await this.save(p);
    },
  };
}
