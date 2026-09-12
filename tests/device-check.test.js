// The Device & Feature Check, as logic.
//
// The browser suite proves it touches no record. This file proves it reports
// the truth about what it finds — including the one failure that has already
// happened here: a clip that was never stored coming back as an object rather
// than as nothing, which made a missing recording read as present.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as DC from '../src/modes/device-check.js';
import { clipKey } from '../src/assessment/audio-store.js';

/** A store with the semantics the real one has, over a Map. */
function fakeStore({ missingReturns = null, failPut = false } = {}) {
  const clips = new Map();
  return {
    clips,
    async put(runId, itemId, blob, opts = {}) {
      const key = clipKey(runId, itemId);
      if (failPut) return { ok: false, key, error: 'quota' };
      clips.set(key, { key, blob, mime_type: opts.mimeType ?? null });
      return { ok: true, key, device_id: 'dev-1' };
    },
    async get(runId, itemId) {
      const key = clipKey(runId, itemId);
      return clips.has(key) ? clips.get(key) : missingReturns;
    },
    async has(runId, itemId) { return !!(await this.get(runId, itemId)); },
    async listKeys() { return [...clips.keys()]; },
    async remove(runId, itemId) { clips.delete(clipKey(runId, itemId)); return { ok: true }; },
  };
}

function make(overrides = {}) {
  const spoken = [];
  const store = overrides.audioStore || fakeStore();
  const controller = DC.createDeviceCheck({
    speak: t => spoken.push(t),
    voiceInfo: () => ({ resolvedLocale: 'fr-FR', name: 'Amelie' }),
    makeCapture: () => ({
      async start() { return { ok: true }; },
      async stop() {
        return { ok: true, blob: { size: 12, type: 'audio/webm' }, durationMs: 2000, mimeType: 'audio/webm' };
      },
      abandon() { return { ok: false, reason: 'app_interrupted_before_submit' }; },
    }),
    audioStore: store,
    playBlob: async () => {},
    requestedLocale: 'fr-CA',
    ...overrides,
  });
  return { controller, store, spoken };
}

// ── the namespace ───────────────────────────────────────────────────────────

test('a diagnostic id is in its own namespace and is not a run id', () => {
  const id = DC.newDiagnosticRunId();
  assert.ok(id.startsWith(DC.DIAGNOSTIC_PREFIX));
  assert.equal(DC.isDiagnosticKey(`${id}/sample#0`), true);
  assert.equal(DC.isDiagnosticKey('run_m1abc_9x8y/SA-F01#0'), false,
    'a real run was mistaken for a diagnostic');
  assert.equal(id.startsWith('run_'), false, 'a diagnostic id looks like a run id');
});

test('the panel says it is test mode', () => {
  assert.match(DC.TEST_MODE_NOTICE, /Test mode/);
  assert.match(DC.TEST_MODE_NOTICE, /nothing here affects the learner's record/i);
});

// ── storage, and the failure that has already happened ──────────────────────

test('a clip is written, read back, and a missing one comes back as nothing', async () => {
  const { controller } = make();
  const result = await controller.checkStorage();
  assert.equal(result.status, 'pass', result.detail);
  assert.match(result.detail, /never stored/);
});

test('a missing clip that comes back as an object is a failure, not a pass', async () => {
  // The exact bug: an IDBRequest has `result: undefined` for a missing key, so
  // returning the request itself made an absent clip truthy. This check exists
  // to catch that on the device rather than in a review months later.
  const broken = fakeStore({ missingReturns: { result: undefined, readyState: 'done' } });
  const { controller } = make({ audioStore: broken });
  const result = await controller.checkStorage();
  assert.equal(result.status, 'fail');
  assert.match(result.detail, /never stored came back as object/);
});

test('a device that will not keep a clip says so plainly', async () => {
  const { controller } = make({ audioStore: fakeStore({ failPut: true }) });
  const result = await controller.checkStorage();
  assert.equal(result.status, 'fail');
  assert.match(result.detail, /quota/);
  assert.match(result.detail, /private window/i);
});

test('deleting the test clip is checked, not assumed', async () => {
  const { controller, store } = make();
  assert.equal((await controller.checkDelete()).status, 'not_run', 'deleted before anything was stored');

  await controller.checkStorage();
  assert.equal(store.clips.size, 1);
  const result = await controller.checkDelete();
  assert.equal(result.status, 'pass');
  assert.equal(store.clips.size, 0);
});

test('a delete that leaves the clip behind is reported as a failure', async () => {
  const store = fakeStore();
  store.remove = async () => ({ ok: true });          // says yes, does nothing
  const { controller } = make({ audioStore: store });
  await controller.checkStorage();
  const result = await controller.checkDelete();
  assert.equal(result.status, 'fail');
  assert.match(result.detail, /still there/);
});

// ── leaving nothing behind ──────────────────────────────────────────────────

test('purging removes diagnostic clips and nothing else', async () => {
  const store = fakeStore();
  await store.put('run_real_1', 'SA-F01', { size: 1 });
  const { controller } = make({ audioStore: store });
  await controller.checkStorage();
  assert.equal(store.clips.size, 2);

  const out = await controller.purge();
  assert.equal(out.removed, 1);
  assert.deepEqual([...store.clips.keys()], ['run_real_1/SA-F01#0'],
    'a real recording was deleted by the device check');
});

test('leaving the check clears its clips and its results', async () => {
  const { controller, store } = make();
  await controller.checkStorage();
  await controller.checkSpeechLocale();
  assert.equal(store.clips.size, 1);

  await controller.exit();
  assert.equal(store.clips.size, 0, 'a diagnostic clip survived the exit');
  for (const r of Object.values(controller.results())) {
    assert.equal(r.status, 'not_run', `${r.id} kept its result after exit`);
  }
});

test('a diagnostic clip left by an earlier visit is cleared on the way in', async () => {
  const store = fakeStore();
  const stale = DC.newDiagnosticRunId();
  await store.put(stale, 'sample', { size: 1 });
  await store.put('run_real_1', 'SA-F01', { size: 1 });

  const { controller } = make({ audioStore: store });
  const out = await controller.purge();
  assert.equal(out.removed, 1);
  assert.deepEqual([...store.clips.keys()], ['run_real_1/SA-F01#0']);
});

// ── the microphone and the voice ────────────────────────────────────────────

test('a refused microphone is reported, not thrown', async () => {
  const { controller } = make({
    makeCapture: () => ({
      async start() { return { ok: false, reason: 'microphone_failed', error: 'NotAllowedError' }; },
      async stop() { return { ok: false }; },
      abandon() { return { ok: false }; },
    }),
  });
  const result = await controller.checkMicrophone();
  assert.equal(result.status, 'fail');
  assert.match(result.detail, /Settings/);
});

test('the microphone is let go again once it has answered', async () => {
  let released = 0;
  const { controller } = make({
    makeCapture: () => ({
      async start() { return { ok: true }; },
      async stop() { return { ok: true, blob: {}, durationMs: 1 }; },
      abandon() { released += 1; return { ok: false }; },
    }),
  });
  assert.equal((await controller.checkMicrophone()).status, 'pass');
  assert.equal(released, 1, 'the microphone was left open');
});

test('the voice check names what was asked for and what the device will use', async () => {
  const { controller } = make();
  const result = controller.checkSpeechLocale();
  assert.equal(result.status, 'pass');
  assert.match(result.detail, /fr-CA/);
  assert.match(result.detail, /fr-FR/);
  assert.match(result.detail, /different French/);
});

test('a device with no French voice fails the voice check', async () => {
  const { controller } = make({ voiceInfo: () => ({ resolvedLocale: null, name: null }) });
  const result = controller.checkSpeechLocale();
  assert.equal(result.status, 'fail');
  assert.match(result.detail, /no French voice/);
});

// ── the parts only a person can judge ───────────────────────────────────────

test('playback waits for the person in the room, and takes their answer', async () => {
  const { controller, spoken } = make();
  const played = controller.playSample();
  assert.equal(played.status, 'needs_you');
  assert.deepEqual(spoken, [DC.CHECK_PHRASE]);
  assert.equal(spoken[0].includes('test'), true, 'the check spoke an item from the bank');

  assert.equal(controller.confirm('audio_playback', false).status, 'fail');
});

test('nothing can be confirmed that was not asked', () => {
  const { controller } = make();
  assert.equal(controller.confirm('audio_playback', true).status, 'not_run',
    'a check passed without being run');
  assert.equal(controller.confirm('storage_roundtrip', true).status, 'not_run',
    'a machine check was passed by a person pressing a button');
});

test('a recording is captured, and its playback is judged by the person', async () => {
  const { controller } = make();
  assert.equal((await controller.startRecording()).status, 'recording');
  const stopped = await controller.stopRecording();
  assert.equal(stopped.status, 'needs_you');
  assert.equal(controller.hasRecording(), true);
  assert.equal((await controller.playRecording()).status, 'needs_you');
  assert.equal(controller.confirm('record_replay', true).status, 'pass');
});

test('a recording that produced no audio is a failure, not a silent pass', async () => {
  const { controller } = make({
    makeCapture: () => ({
      async start() { return { ok: true }; },
      async stop() { return { ok: false, reason: 'microphone_failed' }; },
      abandon() { return { ok: false }; },
    }),
  });
  await controller.startRecording();
  const stopped = await controller.stopRecording();
  assert.equal(stopped.status, 'fail');
  assert.equal(controller.hasRecording(), false);
});

// -- the pictures, judged by the person in the room --------------------------

test('the picture check waits for the person, and takes their answer', async () => {
  const { controller } = make();
  assert.equal(controller.results().pictures.status, 'not_run');

  const shown = controller.showPictures();
  assert.equal(shown.status, 'needs_you');
  assert.match(shown.detail, /size a child sees/i);
  assert.match(shown.detail, /place names/i);

  assert.equal(controller.confirm('pictures', false).status, 'fail');
});

test('the picture check cannot pass itself', () => {
  const { controller } = make();
  assert.equal(controller.confirm('pictures', true).status, 'not_run',
    'a picture was called readable before anyone looked');
});

test('leaving the check clears the picture verdict too', async () => {
  const { controller } = make();
  controller.showPictures();
  controller.confirm('pictures', true);
  assert.equal(controller.results().pictures.status, 'pass');

  await controller.exit();
  assert.equal(controller.results().pictures.status, 'not_run');
});

test('the six machine checks and the three judged ones are all declared', () => {
  // Six of these answer themselves; three need the adult. A check that claims
  // to need nobody but cannot actually decide would pass silently.
  const judged = DC.CHECKS.filter(c => c.needsPerson).map(c => c.id);
  assert.deepEqual(judged, ['audio_playback', 'record_replay', 'pictures']);
  assert.equal(DC.CHECKS.length, 7);
});
