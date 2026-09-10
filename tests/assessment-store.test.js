// The assessment store's write barrier.
//
// This is the mechanism whose failure cost this family a child's progress once
// already, in the profile. The chain was: storage evicted after a week unused,
// the app starts from an empty default, a failed read is indistinguishable from
// an empty one, and the first write full-replaces the server's copy.
//
// The store copies saveState's barrier, so it is tested for the same things.
// Cloud and storage are injected, so every case here is deterministic.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentStore, hasAnyRuns, ASSESSMENT_LOCAL_PREFIX } from '../src/assessment/store.js';
import { newRun } from '../src/assessment/run-model.js';

/** A localStorage that behaves, and can be inspected. */
const fakeStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _dump: () => Object.fromEntries(m),
  };
};

/** A cloud that records what it was asked to write. */
const fakeCloud = ({ save = async () => true, init } = {}) => {
  const writes = [];
  return {
    writes,
    fbAssessSave: async (p, data) => { writes.push({ player: p, runs: Object.keys(data.runs || {}) }); return save(p, data); },
    ...(init ? { fbAssessInit: init } : {}),
  };
};

const withRun = store => ({
  ...store,
  runs: { run_1: newRun({ runId: 'run_1', learnerId: 'jenn', releaseId: 'assessment-v1.0.1', form: 'A' }) },
});

test('nothing is written to the cloud while the read is unresolved', () => {
  // The barrier. Until a read says what this learner already has, an in-memory
  // store could be their real evidence or an empty placeholder.
  const cloud = fakeCloud();
  const s = createAssessmentStore({ storage: fakeStorage(), cloud });

  return s.update('jenn', withRun).then(ok => {
    assert.equal(ok, false, 'a write went out before the read resolved');
    assert.deepEqual(cloud.writes, []);
    assert.equal(s.meta('jenn').pendingCloud, true, 'the write was dropped instead of queued');
  });
});

test('the local mirror is written even while the barrier is closed', async () => {
  // The device's own copy is always safe, and is what survives an offline session.
  const storage = fakeStorage();
  const s = createAssessmentStore({ storage, cloud: fakeCloud() });
  await s.update('jenn', withRun);
  const mirrored = JSON.parse(storage.getItem(ASSESSMENT_LOCAL_PREFIX + 'jenn'));
  assert.deepEqual(Object.keys(mirrored.runs), ['run_1']);
});

test('a failed read never opens the barrier', async () => {
  const cloud = fakeCloud();
  const s = createAssessmentStore({ storage: fakeStorage(), cloud });
  await s.onLoadStatus('jenn', 'error');
  assert.equal(s.meta('jenn').loadState, 'pending', "'error' was promoted to a resolved state");
  await s.update('jenn', withRun);
  assert.deepEqual(cloud.writes, [], 'a write went out after a failed read');
});

test('once loaded, a later absent cannot demote the barrier', async () => {
  const s = createAssessmentStore({ storage: fakeStorage(), cloud: fakeCloud() });
  await s.onLoadStatus('jenn', 'loaded');
  await s.onLoadStatus('jenn', 'absent');
  assert.equal(s.meta('jenn').loadState, 'loaded');
});

test('resolving the read flushes what was queued behind the barrier', async () => {
  const cloud = fakeCloud();
  const s = createAssessmentStore({ storage: fakeStorage(), cloud });
  await s.update('jenn', withRun);              // queued
  assert.deepEqual(cloud.writes, []);
  await s.onLoadStatus('jenn', 'loaded');       // barrier opens
  assert.deepEqual(cloud.writes, [{ player: 'jenn', runs: ['run_1'] }]);
  assert.equal(s.meta('jenn').pendingCloud, false);
});

test('an empty document is never created for a learner who has not been assessed', async () => {
  const cloud = fakeCloud();
  const s = createAssessmentStore({ storage: fakeStorage(), cloud });
  await s.onLoadStatus('jenn', 'absent');
  const ok = await s.save('jenn');
  assert.equal(ok, false);
  assert.deepEqual(cloud.writes, [], 'an empty store was written to the server');
});

test('a failed cloud write leaves the work queued, not lost', async () => {
  const cloud = fakeCloud({ save: async () => false });
  const s = createAssessmentStore({ storage: fakeStorage(), cloud });
  await s.onLoadStatus('jenn', 'loaded');
  await s.update('jenn', withRun);
  assert.equal(s.meta('jenn').pendingCloud, true);

  const good = fakeCloud();
  const s2 = createAssessmentStore({ storage: fakeStorage(), cloud: good });
  await s2.onLoadStatus('jenn', 'loaded');
  await s2.update('jenn', withRun);
  await s2.flushPending();
  assert.ok(good.writes.length >= 1);
});

test('hydrate adopts what the device already holds, migrated', async () => {
  const storage = fakeStorage({
    [ASSESSMENT_LOCAL_PREFIX + 'jenn']: JSON.stringify({
      runs: { run_1: { run_id: 'run_1', learner_id: 'jenn', form: 'A', section_order: ['listening'],
                       responses: { 'LA-F01#0': { item_id: 'LA-F01', raw_response: 'chat' } } } },
    }),
  });
  const s = createAssessmentStore({ storage, cloud: fakeCloud() });
  s.hydrate();
  const run = s.get('jenn').runs.run_1;
  assert.equal(run.responses['LA-F01#0'].raw_response, 'chat');
  assert.equal(s.get('jenn').assessmentSchemaVersion, 1, 'the mirror was not migrated');
  assert.equal(s.meta('jenn').pendingCloud, true, 'local work was not queued for sending');
});

test('a remote snapshot is joined, not substituted', async () => {
  const s = createAssessmentStore({ storage: fakeStorage(), cloud: fakeCloud() });
  await s.update('jenn', withRun);                       // this device has run_1
  s.applyRemote('jenn', {                                // the other has run_2
    assessmentSchemaVersion: 1, learner_id: 'jenn',
    runs: { run_2: newRun({ runId: 'run_2', learnerId: 'jenn', form: 'B' }) },
  });
  assert.deepEqual(Object.keys(s.get('jenn').runs).sort(), ['run_1', 'run_2'],
    'a snapshot replaced this device\'s run instead of joining it');
});

test('a snapshot arriving mid-run is queued, then applied at the boundary', async () => {
  // Applying it mid-section could change the plan the learner is part-way
  // through. It is queued rather than dropped, as the profile queues one.
  const s = createAssessmentStore({ storage: fakeStorage(), cloud: fakeCloud() });
  await s.update('jenn', withRun);
  s.setLive('jenn');

  const applied = s.applyRemote('jenn', {
    assessmentSchemaVersion: 1, learner_id: 'jenn',
    runs: { run_2: newRun({ runId: 'run_2', learnerId: 'jenn', form: 'B' }) },
  });
  assert.equal(applied, false, 'a snapshot was applied during a live run');
  assert.deepEqual(Object.keys(s.get('jenn').runs), ['run_1']);
  assert.equal(s.hasPendingRemote('jenn'), true);

  s.clearLive();
  assert.equal(s.applyPendingRemote('jenn'), true);
  assert.deepEqual(Object.keys(s.get('jenn').runs).sort(), ['run_1', 'run_2'],
    'the queued snapshot was stranded');
});

test('the two learners never share a store or a storage key', async () => {
  const storage = fakeStorage();
  const s = createAssessmentStore({ storage, cloud: fakeCloud() });
  await s.update('jenn', withRun);
  assert.deepEqual(Object.keys(s.get('jess').runs), [], 'jess picked up jenn\'s run');
  assert.ok(storage.getItem(ASSESSMENT_LOCAL_PREFIX + 'jenn'));
  assert.equal(storage.getItem(ASSESSMENT_LOCAL_PREFIX + 'jess'), null);
});

test('the store keeps out of the profile\'s storage entirely', async () => {
  const storage = fakeStorage();
  const s = createAssessmentStore({ storage, cloud: fakeCloud() });
  await s.update('jenn', withRun);
  for (const k of Object.keys(storage._dump())) {
    assert.ok(k.startsWith(ASSESSMENT_LOCAL_PREFIX),
      `the assessment store wrote to ${k}, which is not its own key`);
  }
});

test('a missing cloud is survivable — the app runs offline', async () => {
  const s = createAssessmentStore({ storage: fakeStorage(), cloud: {} });
  assert.equal(s.listen(), false, 'listen() claimed success with no SDK');
  await s.onLoadStatus('jenn', 'loaded');
  const ok = await s.save('jenn');
  assert.equal(ok, false);
  assert.equal(s.meta('jenn').pendingCloud, true, 'work was lost rather than queued');
});

test('hasAnyRuns distinguishes an assessed learner from a fresh one', () => {
  assert.equal(hasAnyRuns({ runs: {} }), false);
  assert.equal(hasAnyRuns(withRun({ runs: {} })), true);
  assert.equal(hasAnyRuns(null), false);
});
