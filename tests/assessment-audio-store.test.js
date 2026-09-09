// Where a spoken answer's audio lives: this device, and nowhere else.
//
// Every operation resolves rather than throwing. Storage can be unavailable —
// a private window, a browser blocking site data, a full quota — and losing a
// clip is bad, but losing the whole assessment because a clip could not be
// filed would be worse. The response record survives either way, with audio_ref
// telling the truth about whether the audio is there.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioStore, clipKey } from '../src/assessment/audio-store.js';

/** An IndexedDB small enough to reason about, backed by a Map. */
function fakeIdb({ failOn = null } = {}) {
  const data = new Map();
  return {
    data,
    open() {
      const req = {};
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          close() {},
          transaction(_name, mode) {
            const tx = {};
            const store = {
              put(v, k) { if (failOn === 'put') throw new Error('quota'); data.set(k, v); return {}; },
              get(k) { return { result: data.get(k) }; },
              delete(k) { data.delete(k); return {}; },
              getAllKeys() { return { result: [...data.keys()] }; },
            };
            tx.objectStore = () => store;
            queueMicrotask(() => tx.oncomplete?.());
            void mode;
            return tx;
          },
        };
        req.result = db;
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

const store = (opts = {}) => createAudioStore({ idb: fakeIdb(opts), deviceId: () => 'ipad-A' });

test('a clip is keyed by the run and item it belongs to', () => {
  assert.equal(clipKey('run_1', 'SA-F01', 0), 'run_1/SA-F01#0');
  assert.notEqual(clipKey('run_1', 'SA-F01', 0), clipKey('run_1', 'SA-F01', 1));
  assert.notEqual(clipKey('run_1', 'SA-F01'), clipKey('run_2', 'SA-F01'),
    'two runs would share a clip');
});

test('a clip is stored, found again, and records which device holds it', async () => {
  // The device matters: a parent opening the review panel on the other iPad has
  // nothing to play, and the record has to say so rather than offer a dead button.
  const s = store();
  const put = await s.put('run_1', 'SA-F01', 'audio-bytes', { durationMs: 4200, mimeType: 'audio/webm' });
  assert.equal(put.ok, true);
  assert.equal(put.device_id, 'ipad-A');

  const got = await s.get('run_1', 'SA-F01');
  assert.equal(got.blob, 'audio-bytes');
  assert.equal(got.duration_ms, 4200);
  assert.equal(got.item_id, 'SA-F01');
  assert.equal(await s.has('run_1', 'SA-F01'), true);
});

test('a missing clip is absent, not an error', async () => {
  const s = store();
  assert.equal(await s.get('run_1', 'NOPE'), null);
  assert.equal(await s.has('run_1', 'NOPE'), false);
});

test('a storage failure is reported rather than thrown', async () => {
  // A thrown quota error mid-assessment would end the section.
  const s = store({ failOn: 'put' });
  const put = await s.put('run_1', 'SA-F01', 'bytes');
  assert.equal(put.ok, false);
  assert.ok(put.error, 'the failure was not explained');
});

test('no IndexedDB at all is survivable', async () => {
  const s = createAudioStore({ idb: undefined, deviceId: () => null });
  assert.equal((await s.put('run_1', 'SA-F01', 'bytes')).ok, false);
  assert.equal(await s.get('run_1', 'SA-F01'), null);
  assert.deepEqual(await s.listKeys(), []);
});

test('a parent can delete one recording', async () => {
  // §3.6 requires a control to remove saved recordings.
  const s = store();
  await s.put('run_1', 'SA-F01', 'bytes');
  assert.equal(await s.has('run_1', 'SA-F01'), true);
  assert.equal((await s.remove('run_1', 'SA-F01')).ok, true);
  assert.equal(await s.has('run_1', 'SA-F01'), false);
});

test('deleting a run takes its clips and leaves every other run alone', async () => {
  const s = store();
  await s.put('run_1', 'SA-F01', 'a');
  await s.put('run_1', 'SA-D01', 'b');
  await s.put('run_2', 'SB-F01', 'c');

  const out = await s.removeAllForRun('run_1');
  assert.equal(out.removed, 2);
  assert.equal(await s.has('run_1', 'SA-F01'), false);
  assert.equal(await s.has('run_2', 'SB-F01'), true, "another run's clip was deleted");
});

test('re-recording replaces the clip rather than accumulating', async () => {
  const s = store();
  await s.put('run_1', 'SA-F01', 'first');
  await s.put('run_1', 'SA-F01', 'second');
  assert.equal((await s.get('run_1', 'SA-F01')).blob, 'second');
  assert.equal((await s.listKeys()).length, 1);
});
