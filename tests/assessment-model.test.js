// The assessment run model, and its contract with the release.
//
// The response record's field names are not a design decision — they are
// assessment_rules.json → administration.response_storage. So the test reads
// that list from the release rather than restating it, and a release that adds
// a field fails here instead of being quietly unrecorded.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASSESSMENT_SCHEMA_VERSION, RUN_STATUS, RUN_STATUS_RANK, SECTION_STATUS,
  INVALID_REASONS, RESPONSE_STORAGE_FIELDS,
  defaultAssessmentStore, newRun, newResponse, newReview, newRunId, responseKey,
} from '../src/assessment/run-model.js';
import { migrateAssessmentStore, isCurrentAssessmentStore } from '../src/assessment/run-migrations.js';

const DIR = 'content/releases/assessment-v1/';
const rules = JSON.parse(readFileSync(DIR + 'assessment_rules.json', 'utf8'));

test('a response carries every field the release says to store', () => {
  const r = newResponse({ itemId: 'LA-F01', form: 'A' });
  for (const field of rules.administration.response_storage) {
    assert.ok(field in r, `response_storage names "${field}" and the record has no such field`);
  }
});

test('the module’s copy of that list matches the release exactly', () => {
  // Two lists that must agree; this is what stops them drifting apart.
  assert.deepEqual(RESPONSE_STORAGE_FIELDS, rules.administration.response_storage);
});

test('the invalidity reasons match the release exactly', () => {
  assert.deepEqual(INVALID_REASONS, rules.invalidity.reasons);
});

test('a new run opens a section for every section the release orders', () => {
  const run = newRun({
    learnerId: 'jenn', releaseId: rules.release_id, form: 'A',
    sectionOrder: rules.section_order,
  });
  assert.deepEqual(Object.keys(run.sections), rules.section_order);
  assert.deepEqual(run.section_order, rules.section_order);
  for (const s of Object.values(run.sections)) {
    assert.equal(s.status, SECTION_STATUS.NOT_STARTED);
    assert.deepEqual(s.plan, [], 'a section starts with nothing administered');
  }
});

test('a run starts in progress, with no evidence and no report', () => {
  const run = newRun({ learnerId: 'jenn', releaseId: rules.release_id, form: 'A' });
  assert.equal(run.status, RUN_STATUS.IN_PROGRESS);
  assert.deepEqual(run.responses, {});
  assert.deepEqual(run.exposure, {});
  assert.deepEqual(run.review, {});
  // A derived value must never become a merge input.
  assert.equal('report' in run, false, 'a report was stored on the run');
});

test('run status ranks so that a parent invalidation always wins', () => {
  const r = RUN_STATUS_RANK;
  assert.ok(r[RUN_STATUS.PARENT_INVALIDATED] > r[RUN_STATUS.COMPLETE]);
  assert.ok(r[RUN_STATUS.COMPLETE] > r[RUN_STATUS.ABANDONED]);
  assert.ok(r[RUN_STATUS.ABANDONED] > r[RUN_STATUS.IN_PROGRESS]);
});

test('a response is not scored, supported or invalid until something says so', () => {
  const r = newResponse({ itemId: 'LA-F01', form: 'A' });
  assert.equal(r.support_flag, false);
  assert.equal(r.technical_invalid_reason, null);
  assert.equal(r.audio_play_count, 0);
  assert.equal(r.scorer_id, null, 'a rubric score requires a named human');
  assert.equal(r.transcript_observation, null);
});

test('the response key separates a permitted technical replay from the first try', () => {
  assert.equal(responseKey('LA-F01', 0), 'LA-F01#0');
  assert.notEqual(responseKey('LA-F01', 0), responseKey('LA-F01', 1));
});

test('run ids do not collide', () => {
  const ids = new Set();
  for (let i = 0; i < 2000; i++) ids.add(newRunId());
  assert.equal(ids.size, 2000);
});

test('a review records who scored it', () => {
  const rev = newReview({ itemId: 'WA-F01', scorerId: 'parent:hz', rubricId: 'WRITING-ANALYTIC-V1' });
  assert.equal(rev.scorer_id, 'parent:hz');
  assert.equal(rev.invalidated, false);
});

// ── migrations ──────────────────────────────────────────────────────────────

test('an empty or corrupt store yields a usable default rather than throwing', () => {
  for (const junk of [null, undefined, 42, 'x', []]) {
    const s = migrateAssessmentStore(junk);
    assert.equal(s.assessmentSchemaVersion, ASSESSMENT_SCHEMA_VERSION);
    assert.deepEqual(s.runs, {});
  }
});

test('migration is idempotent', () => {
  const raw = {
    runs: { r1: { run_id: 'r1', learner_id: 'jenn', form: 'A', section_order: ['listening'],
                  responses: { 'LA-F01#0': { item_id: 'LA-F01' } } } },
  };
  const once = migrateAssessmentStore(raw);
  const twice = migrateAssessmentStore(once);
  const thrice = migrateAssessmentStore(twice);
  assert.deepEqual(twice, once);
  assert.deepEqual(thrice, once);
  assert.ok(isCurrentAssessmentStore(once));
});

test('migration repairs structure without inventing evidence', () => {
  const s = migrateAssessmentStore({
    runs: { r1: { run_id: 'r1', learner_id: 'jenn', form: 'A', section_order: ['listening', 'reading'] } },
  });
  const run = s.runs.r1;
  assert.deepEqual(Object.keys(run.sections), ['listening', 'reading'], 'sections were rebuilt');
  assert.deepEqual(run.responses, {}, 'a response was invented');
  assert.deepEqual(run.exposure, {}, 'exposure was invented');
});

test('migration never drops a response, an exposure or a review', () => {
  const raw = {
    runs: { r1: {
      run_id: 'r1', learner_id: 'jenn', form: 'A', section_order: ['listening'],
      responses: { 'LA-F01#0': { item_id: 'LA-F01', raw_response: 'chat' } },
      exposure: { 'LA-F01': { first_shown_at_utc: 5, shown_count: 1 } },
      review: { 'WA-F01#0': { item_id: 'WA-F01', scorer_id: 'parent:hz' } },
    } },
  };
  const s = migrateAssessmentStore(raw);
  assert.equal(s.runs.r1.responses['LA-F01#0'].raw_response, 'chat');
  assert.equal(s.runs.r1.exposure['LA-F01'].shown_count, 1);
  assert.equal(s.runs.r1.review['WA-F01#0'].scorer_id, 'parent:hz');
});

test('a section outside section_order is kept, not discarded', () => {
  // Never delete: an unrecognised section is still somebody's data.
  const s = migrateAssessmentStore({
    runs: { r1: { run_id: 'r1', section_order: ['listening'],
                  sections: { listening: {}, mystery: { status: 'complete', plan: ['X-1'] } } } },
  });
  assert.ok(s.runs.r1.sections.mystery, 'an unknown section was dropped');
  assert.deepEqual(s.runs.r1.sections.mystery.plan, ['X-1']);
});

test('a stored report is dropped rather than allowed to become a merge input', () => {
  const s = migrateAssessmentStore({
    runs: { r1: { run_id: 'r1', section_order: [], report: { band: 'stretch_secure' } } },
  });
  assert.equal('report' in s.runs.r1, false);
});

test('a store written by a newer build keeps its own version', () => {
  const s = migrateAssessmentStore({ assessmentSchemaVersion: 99, runs: {} });
  assert.equal(s.assessmentSchemaVersion, 99);
});

test('the default store is not mistaken for one holding evidence', () => {
  assert.deepEqual(defaultAssessmentStore('jenn').runs, {});
});
