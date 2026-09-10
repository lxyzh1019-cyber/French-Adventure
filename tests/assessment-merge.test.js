// Joining two devices' assessment stores.
//
// Same three properties state/merge.js is held to, for the same reason —
// snapshots arrive in an unpredictable order and are frequently redelivered:
//
//   commutative — join(a, b) equals join(b, a)
//   idempotent  — join(a, a) equals a
//   monotonic   — no evidence in either input is missing from the result
//
// The difference is that nothing here is a counter, so these hold by
// construction rather than by arithmetic. These tests are what says so.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAssessmentStores, allResponses } from '../src/assessment/run-merge.js';
import { migrateAssessmentStore } from '../src/assessment/run-migrations.js';
import { RUN_STATUS, SECTION_STATUS } from '../src/assessment/run-model.js';

/** A store holding one run, shaped as the app would leave it. */
const store = ({ runId = 'run_1', responses = {}, exposure = {}, review = {},
                 status = RUN_STATUS.IN_PROGRESS, sections = {}, statusAt = 0 } = {}) =>
  migrateAssessmentStore({
    learner_id: 'jenn',
    runs: {
      [runId]: {
        run_id: runId, learner_id: 'jenn', release_id: 'assessment-v1.0.1', form: 'A',
        started_at_utc: 1000, started_day_key: '2026-09-09',
        status, status_at_utc: statusAt,
        section_order: ['listening', 'reading'],
        sections, responses, exposure, review,
      },
    },
  });

const answered = (itemId, at, device) => ({
  [`${itemId}#0`]: {
    item_id: itemId, item_version: 1, form: 'A', domain: 'listening',
    raw_response: null, selected_choice_ids: ['a'],
    response_submitted_at_utc: at, device_id: device,
    support_flag: false, technical_invalid_reason: null,
  },
});

// ── the three properties ────────────────────────────────────────────────────

test('the join is commutative — arrival order cannot change the result', () => {
  const a = store({ responses: answered('LA-F01', 10, 'ipadA') });
  const b = store({ responses: answered('LA-F02', 20, 'ipadB'), status: RUN_STATUS.COMPLETE });
  assert.deepEqual(mergeAssessmentStores(a, b), mergeAssessmentStores(b, a));
});

test('the join is idempotent — redelivery changes nothing', () => {
  const a = store({ responses: answered('LA-F01', 10, 'ipadA') });
  const b = store({ responses: answered('LA-F02', 20, 'ipadB') });
  const once = mergeAssessmentStores(a, b);
  assert.deepEqual(mergeAssessmentStores(once, once), once);
  assert.deepEqual(mergeAssessmentStores(once, a), once, 'redelivering A changed the result');
  assert.deepEqual(mergeAssessmentStores(once, b), once, 'redelivering B changed the result');
});

test('the join is monotonic — no response present in either side is lost', () => {
  const a = store({ responses: { ...answered('LA-F01', 10, 'ipadA'), ...answered('LA-F03', 30, 'ipadA') } });
  const b = store({ responses: answered('LA-F02', 20, 'ipadB') });
  for (const m of [mergeAssessmentStores(a, b), mergeAssessmentStores(b, a)]) {
    assert.deepEqual(Object.keys(m.runs.run_1.responses).sort(),
      ['LA-F01#0', 'LA-F02#0', 'LA-F03#0']);
  }
});

// ── the cases the design turns on ───────────────────────────────────────────

test('two devices answering different items of one run keep both answers', () => {
  // The case the old profile sync got wrong: one side was chosen and the
  // other discarded. Here there is nothing to choose between.
  const a = store({ responses: answered('LA-F01', 10, 'ipadA') });
  const b = store({ responses: answered('LA-F02', 20, 'ipadB') });
  const m = mergeAssessmentStores(a, b);
  assert.equal(allResponses(m).length, 2);
});

test('the same item answered on both devices keeps the earlier submission', () => {
  // pause_resume.resume: a submitted item is never replayed as a new scored
  // item, so the first answer is the one the assessment actually elicited.
  const a = store({ responses: answered('LA-F01', 10, 'ipadA') });
  const b = store({ responses: answered('LA-F01', 99, 'ipadB') });
  for (const m of [mergeAssessmentStores(a, b), mergeAssessmentStores(b, a)]) {
    const r = m.runs.run_1.responses['LA-F01#0'];
    assert.equal(r.response_submitted_at_utc, 10);
    assert.equal(r.device_id, 'ipadA');
    assert.equal(r.duplicate_submission, true, 'the collision was not flagged');
    assert.equal(r.duplicate_from_device_id, 'ipadB');
  }
});

test('an identical response redelivered is not flagged as a duplicate', () => {
  const a = store({ responses: answered('LA-F01', 10, 'ipadA') });
  const m = mergeAssessmentStores(a, store({ responses: answered('LA-F01', 10, 'ipadA') }));
  assert.equal(m.runs.run_1.responses['LA-F01#0'].duplicate_submission, undefined);
});

test('a parent invalidation survives a merge with a device that has not seen it', () => {
  const invalidated = store({ status: RUN_STATUS.PARENT_INVALIDATED, statusAt: 500 });
  const stale = store({ status: RUN_STATUS.IN_PROGRESS, statusAt: 900 });
  for (const m of [mergeAssessmentStores(invalidated, stale), mergeAssessmentStores(stale, invalidated)]) {
    assert.equal(m.runs.run_1.status, RUN_STATUS.PARENT_INVALIDATED,
      'a later timestamp un-invalidated an attempt a parent had marked');
  }
});

test('a completed run is not reopened by a device that only saw it start', () => {
  const done = store({ status: RUN_STATUS.COMPLETE, statusAt: 100 });
  const mid = store({ status: RUN_STATUS.IN_PROGRESS, statusAt: 800 });
  for (const m of [mergeAssessmentStores(done, mid), mergeAssessmentStores(mid, done)]) {
    assert.equal(m.runs.run_1.status, RUN_STATUS.COMPLETE);
  }
});

test('a re-score wins over the earlier review, and invalidation is never undone', () => {
  // Unlike a response, a review is a correction: a scorer who re-reads a piece
  // of writing meant to change the score.
  const first = store({ review: { 'WA-F01#0': { item_id: 'WA-F01', scorer_id: 'p', reviewed_at_utc: 10, scores: { message: 1 }, invalidated: false } } });
  const redo  = store({ review: { 'WA-F01#0': { item_id: 'WA-F01', scorer_id: 'p', reviewed_at_utc: 20, scores: { message: 3 }, invalidated: false } } });
  for (const m of [mergeAssessmentStores(first, redo), mergeAssessmentStores(redo, first)]) {
    assert.equal(m.runs.run_1.review['WA-F01#0'].scores.message, 3);
  }
  const voided = store({ review: { 'WA-F01#0': { item_id: 'WA-F01', reviewed_at_utc: 5, invalidated: true, invalidated_reason: 'wrong learner' } } });
  for (const m of [mergeAssessmentStores(redo, voided), mergeAssessmentStores(voided, redo)]) {
    assert.equal(m.runs.run_1.review['WA-F01#0'].invalidated, true,
      'a merge un-invalidated a review');
  }
});

test('exposure unions, and shown_count takes the max rather than summing', () => {
  // Sum is not idempotent under redelivery, and the rule this field serves —
  // never treat a previously exposed item as secure evidence — needs only
  // "was it shown".
  const a = store({ exposure: { 'LA-F01': { first_shown_at_utc: 50, shown_count: 2 } } });
  const b = store({ exposure: { 'LA-F01': { first_shown_at_utc: 10, shown_count: 1 },
                                'LA-F02': { first_shown_at_utc: 60, shown_count: 1 } } });
  for (const m of [mergeAssessmentStores(a, b), mergeAssessmentStores(b, a)]) {
    const e = m.runs.run_1.exposure;
    assert.equal(e['LA-F01'].first_shown_at_utc, 10, 'the earliest showing is the first one');
    assert.equal(e['LA-F01'].shown_count, 2);
    assert.ok(e['LA-F02'], 'an item only one device had shown was dropped');
  }
  const once = mergeAssessmentStores(a, b);
  assert.equal(mergeAssessmentStores(once, b).runs.run_1.exposure['LA-F01'].shown_count, 2,
    'redelivery inflated the count');
});

test('a longer plan wins when it extends the shorter one', () => {
  const behind = store({ sections: { listening: { domain: 'listening', plan: ['LA-D01', 'LA-D02'], status: SECTION_STATUS.IN_PROGRESS } } });
  const ahead  = store({ sections: { listening: { domain: 'listening', plan: ['LA-D01', 'LA-D02', 'LA-S01'], status: SECTION_STATUS.IN_PROGRESS } } });
  for (const m of [mergeAssessmentStores(behind, ahead), mergeAssessmentStores(ahead, behind)]) {
    assert.deepEqual(m.runs.run_1.sections.listening.plan, ['LA-D01', 'LA-D02', 'LA-S01']);
    assert.equal(m.runs.run_1.sections.listening.routing_conflict, undefined,
      'the same route, further along, is not a conflict');
  }
});

test('two devices that routed differently resolve deterministically and say so', () => {
  const x = store({ sections: { listening: { domain: 'listening', plan: ['LA-D01', 'LA-S01'], routed_at_utc: 100 } } });
  const y = store({ sections: { listening: { domain: 'listening', plan: ['LA-D01', 'LA-F01'], routed_at_utc: 200 } } });
  for (const m of [mergeAssessmentStores(x, y), mergeAssessmentStores(y, x)]) {
    const s = m.runs.run_1.sections.listening;
    assert.deepEqual(s.plan, ['LA-D01', 'LA-S01'], 'the earlier routing decision must stand');
    assert.equal(s.routing_conflict, true, 'a divergent route was not flagged');
  }
});

test('two separate runs both survive', () => {
  const first = store({ runId: 'run_1' });
  const second = store({ runId: 'run_2' });
  const m = mergeAssessmentStores(first, second);
  assert.deepEqual(Object.keys(m.runs).sort(), ['run_1', 'run_2']);
});

test('a null or missing side is handled rather than throwing', () => {
  const a = store({ responses: answered('LA-F01', 10, 'ipadA') });
  assert.deepEqual(mergeAssessmentStores(a, null), a);
  assert.deepEqual(mergeAssessmentStores(null, a), a);
  assert.equal(mergeAssessmentStores(null, null), null);
});
