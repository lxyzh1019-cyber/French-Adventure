// Administering a run: form choice, section boundaries, routing, resume.
//
// These are the rules in assessment_rules.json, tested as rules. The module is
// pure, so each one is checked directly rather than inferred from a browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/assessment/session.js';
import * as content from '../src/assessment/content.js';
import { defaultAssessmentStore, RUN_STATUS, SECTION_STATUS, responseKey } from '../src/assessment/run-model.js';

const DAY = 86400000;
const NOW = 1757000000000;

const freshStore = () => defaultAssessmentStore('jenn');
const start = (store = freshStore(), learner = 'jenn') =>
  S.startRun(store, learner, { now: NOW, dayKey: '2026-09-09' }).run;

/** Answer every planned item of a section. */
const answerAll = (run, domain, correct = true) => {
  for (const id of [...run.sections[domain].plan]) {
    const item = content.getItem(id);
    if (item && content.needsUnbuiltAsset(item)) continue;
    S.submitResponse(run, id, { scored_correct: correct }, { now: NOW });
  }
};

// ── form assignment ─────────────────────────────────────────────────────────

test('the named learners get the forms the rules name', () => {
  assert.equal(S.chooseForm('jenn', []), 'A');
  assert.equal(S.chooseForm('jess', []), 'B');
});

test('an unnamed learner is assigned by the hash, deterministically', () => {
  const a = S.chooseForm('someone-else', []);
  assert.ok(a === 'A' || a === 'B');
  assert.equal(S.chooseForm('someone-else', []), a, 'assignment is not stable');
});

test('a reassessment uses the other form', () => {
  const prior = [{ form: 'A', started_at_utc: NOW - 10 * DAY, status: RUN_STATUS.COMPLETE,
                   responses: Object.fromEntries([...Array(8)].map((_, i) =>
                     [`x${i}`, { domain: 'listening', scored_correct: true }])) }];
  assert.equal(S.chooseForm('jenn', prior, { now: NOW }), 'B');
});

test('a barely-used attempt may repeat its own form', () => {
  // A child who stopped after two items has not seen the bank. Spending the
  // alternate form on that would leave nothing fresh for the real attempt.
  const prior = [{ form: 'A', started_at_utc: NOW - 10 * DAY, status: RUN_STATUS.COMPLETE,
                   responses: { a: { domain: 'listening', scored_correct: true },
                                b: { domain: 'listening', scored_correct: false } } }];
  assert.equal(S.chooseForm('jenn', prior, { now: NOW }), 'A');
  assert.equal(S.barelyUsed(prior[0]), true);
});

test('an invalidated attempt does not steer the next form choice', () => {
  const prior = [{ form: 'A', started_at_utc: NOW - 1 * DAY, status: RUN_STATUS.PARENT_INVALIDATED,
                   responses: {} }];
  assert.equal(S.chooseForm('jenn', prior, { now: NOW }), 'A', 'a voided attempt consumed a form');
});

// ── starting and resuming ───────────────────────────────────────────────────

test('a run opens against the current release, with its hashes frozen', () => {
  const run = start();
  assert.equal(run.release_id, content.RELEASE_ID);
  assert.equal(run.status, RUN_STATUS.IN_PROGRESS);
  assert.deepEqual(run.section_order, content.SECTION_ORDER);
  assert.equal(run.content_sha.assessment_items, content.declaredSha('assessment_items.json'));
});

test('starting again returns the run already in progress', () => {
  // Two live runs would split one measurement across two records and burn the
  // bank twice.
  const store = freshStore();
  const first = S.startRun(store, 'jenn', { now: NOW });
  store.runs[first.run.run_id] = first.run;
  const again = S.startRun(store, 'jenn', { now: NOW + 1000 });
  assert.equal(again.resumed, true);
  assert.equal(again.run.run_id, first.run.run_id);
});

test('a completed run does not block a new one', () => {
  const store = freshStore();
  const done = start(store);
  done.status = RUN_STATUS.COMPLETE;
  store.runs[done.run_id] = done;
  const next = S.startRun(store, 'jenn', { now: NOW + 90 * DAY });
  assert.equal(next.resumed, false);
  assert.notEqual(next.run.run_id, done.run_id);
});

// ── section boundaries ──────────────────────────────────────────────────────

test('a new section needs the minutes the rules require', () => {
  const need = content.RULES.section_boundaries.begin_next_section_only_with_at_least_minutes_remaining;
  assert.equal(need, 6, 'the release changed its boundary rule');
  assert.equal(S.canBeginNextSection(need), true);
  assert.equal(S.canBeginNextSection(need - 1), false);
  assert.equal(S.canBeginNextSection(0), false);
  assert.equal(S.canBeginNextSection(20), true);
});

test('sections are offered in the order the release sets', () => {
  const run = start();
  assert.equal(S.nextSection(run), content.SECTION_ORDER[0]);
  S.completeSection(run, content.SECTION_ORDER[0], { now: NOW });
  assert.equal(S.nextSection(run), content.SECTION_ORDER[1]);
});

test('opening an objective section freezes only its entry block', () => {
  const run = start();
  const routing = content.routingFor('listening');
  S.beginSection(run, 'listening', { now: NOW });
  assert.equal(run.sections.listening.plan.length, routing.entry_count);
  assert.equal(run.sections.listening.status, SECTION_STATUS.IN_PROGRESS);
  for (const id of run.sections.listening.plan) {
    assert.equal(content.getItem(id).difficulty_tier, routing.entry_tier);
  }
});

test('opening an open section plans every prompt, in listed order', () => {
  // open_sections: "Administer all 6 prompts in listed order."
  const run = start();
  S.beginSection(run, 'writing', { now: NOW });
  const expected = content.itemsFor({ form: run.form, domain: 'writing' }).map(i => i.id);
  assert.deepEqual(run.sections.writing.plan, expected);
});

test('re-opening a section does not rebuild its plan', () => {
  const run = start();
  S.beginSection(run, 'listening', { now: NOW });
  const plan = [...run.sections.listening.plan];
  S.beginSection(run, 'listening', { now: NOW + 5000 });
  assert.deepEqual(run.sections.listening.plan, plan, 'a resume reshuffled the section');
});

// ── routing ─────────────────────────────────────────────────────────────────

test('routing waits for the whole entry block', () => {
  // objective_routing.invariant: "Apply routing only after the full entry block
  // is submitted."
  const run = start();
  S.beginSection(run, 'listening', { now: NOW });
  const [first] = run.sections.listening.plan;
  S.submitResponse(run, first, { scored_correct: true }, { now: NOW });
  assert.equal(S.applyRoutingIfEntryComplete(run, 'listening', { now: NOW }), null,
    'routing ran on a partial entry block');
});

test('a strong entry routes to stretch, a weak one to foundation', () => {
  for (const [correct, expected] of [[4, ['stretch']], [2, ['foundation', 'stretch']], [0, ['foundation']]]) {
    const run = start();
    S.beginSection(run, 'listening', { now: NOW });
    run.sections.listening.plan.forEach((id, i) => {
      S.submitResponse(run, id, { scored_correct: i < correct }, { now: NOW });
    });
    const tiers = S.applyRoutingIfEntryComplete(run, 'listening', { now: NOW });
    assert.deepEqual(tiers, expected, `${correct}/4 correct routed wrongly`);
  }
});

test('routing appends the routed tiers in bank order and freezes the decision', () => {
  const run = start();
  S.beginSection(run, 'listening', { now: NOW });
  run.sections.listening.plan.forEach(id => S.submitResponse(run, id, { scored_correct: true }, { now: NOW }));
  S.applyRoutingIfEntryComplete(run, 'listening', { now: NOW });

  const s = run.sections.listening;
  const stretch = content.itemsFor({ form: run.form, domain: 'listening', tier: 'stretch' }).map(i => i.id);
  assert.deepEqual(s.plan.slice(-stretch.length), stretch, 'bank order was not preserved');
  assert.equal(s.routed_at_utc, NOW);

  const frozen = [...s.plan];
  S.applyRoutingIfEntryComplete(run, 'listening', { now: NOW + 9999 });
  assert.deepEqual(s.plan, frozen, 'routing ran twice');
  assert.equal(s.routed_at_utc, NOW, 'the routing timestamp moved');
});

test('an invalid entry answer neither helps nor hurts the routing', () => {
  // invalidity.rule: excluded from numerator and denominator.
  const run = start();
  S.beginSection(run, 'listening', { now: NOW });
  const plan = run.sections.listening.plan;
  S.submitResponse(run, plan[0], { technical_invalid_reason: 'audio_failed' }, { now: NOW });
  plan.slice(1).forEach(id => S.submitResponse(run, id, { scored_correct: true }, { now: NOW }));
  const tiers = S.applyRoutingIfEntryComplete(run, 'listening', { now: NOW });
  assert.deepEqual(tiers, ['stretch'], '3 of 3 valid should still route strong');
});

// ── responses and exposure ──────────────────────────────────────────────────

test('a submitted item is never replayed as a new scored item', () => {
  const run = start();
  S.beginSection(run, 'listening', { now: NOW });
  const [id] = run.sections.listening.plan;
  const first = S.submitResponse(run, id, { scored_correct: true }, { now: NOW });
  const second = S.submitResponse(run, id, { scored_correct: false }, { now: NOW + 1000 });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false, 'a second submission overwrote the first');
  assert.equal(run.responses[responseKey(id, 0)].scored_correct, true);
});

test('a response records the item version and its section', () => {
  const run = start();
  S.beginSection(run, 'listening', { now: NOW });
  const [id] = run.sections.listening.plan;
  const { response } = S.submitResponse(run, id, {}, { now: NOW });
  assert.equal(response.item_version, content.getItem(id).version);
  assert.equal(response.domain, 'listening');
  assert.equal(response.form, run.form);
});

test('exposure records every showing, and the first one', () => {
  const run = start();
  S.recordExposure(run, 'LA-F01', { now: NOW });
  S.recordExposure(run, 'LA-F01', { now: NOW + 5000 });
  assert.equal(run.exposure['LA-F01'].first_shown_at_utc, NOW);
  assert.equal(run.exposure['LA-F01'].shown_count, 2);
});

// ── items whose asset does not exist ────────────────────────────────────────

test('an item needing an unbuilt asset is skipped, never presented', () => {
  // Rendering the brief would print "school, park, library, bank" — the very
  // vocabulary the item is testing.
  const run = start();
  S.beginSection(run, 'speaking', { now: NOW });
  const skipped = S.skippedForMissingAsset(run, 'speaking');
  assert.ok(skipped.length > 0, 'the speaking section has no brief-only prompts');
  let seen = 0;
  for (;;) {
    const item = S.nextItem(run, 'speaking');
    if (!item) break;
    assert.equal(content.needsUnbuiltAsset(item), false, `${item.id} was presented from a brief`);
    S.submitResponse(run, item.id, {}, { now: NOW });
    if (++seen > 20) break;
  }
});

test('a section whose only unanswered items are skipped counts as answered', () => {
  const run = start();
  S.beginSection(run, 'speaking', { now: NOW });
  answerAll(run, 'speaking');
  assert.equal(S.sectionIsAnswered(run, 'speaking'), true,
    'a section stalled on a prompt that can never be shown');
});

// ── resume ──────────────────────────────────────────────────────────────────

test('resume points at the first unanswered item, needing no cursor', () => {
  const run = start();
  S.beginSection(run, 'listening', { now: NOW });
  const plan = run.sections.listening.plan;
  S.submitResponse(run, plan[0], { scored_correct: true }, { now: NOW });

  const at = S.resumePoint(run);
  assert.equal(at.domain, 'listening');
  assert.equal(at.item.id, plan[1], 'resume did not land on the next unanswered item');
  assert.equal(at.answered, 1);
});

test('resume is stable — reading it twice does not move it', () => {
  const run = start();
  S.beginSection(run, 'listening', { now: NOW });
  assert.deepEqual(S.resumePoint(run).item.id, S.resumePoint(run).item.id);
});

test('a finished run resumes to done rather than to an item', () => {
  const run = start();
  for (const d of content.SECTION_ORDER) S.completeSection(run, d, { now: NOW });
  assert.deepEqual(S.resumePoint(run), { done: true, domain: null, item: null });
});

test('a parent can void an attempt without deleting it', () => {
  const run = start();
  S.beginSection(run, 'listening', { now: NOW });
  S.submitResponse(run, run.sections.listening.plan[0], { scored_correct: true }, { now: NOW });
  S.invalidateRun(run, { reason: 'interrupted by a sibling', now: NOW + 100 });
  assert.equal(run.status, RUN_STATUS.PARENT_INVALIDATED);
  assert.equal(run.invalidated_reason, 'interrupted by a sibling');
  assert.equal(Object.keys(run.responses).length, 1, 'voiding an attempt destroyed its evidence');
});
