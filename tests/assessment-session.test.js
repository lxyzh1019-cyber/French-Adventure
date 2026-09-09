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

/** Answer an item the way the UI would: with its real choices or text. */
const answer = (run, itemId, correct, opts = {}) => {
  const item = content.getItem(itemId);
  const patch = {};
  if (Array.isArray(item?.choices)) {
    const right = item.answer_key.correct_choice_ids;
    const wrong = item.choices.map(c => c.id).filter(id => !right.includes(id));
    patch.selected_choice_ids = correct ? [...right] : [wrong[0]];
  } else if (item?.answer_key?.accepted_answers) {
    patch.raw_response = correct ? item.answer_key.accepted_answers[0] : 'zzz';
  }
  return S.submitResponse(run, itemId, { ...patch, ...opts }, { now: NOW });
};

/** Answer every planned item of a section. */
const answerAll = (run, domain, correct = true) => {
  for (const id of [...run.sections[domain].plan]) {
    const item = content.getItem(id);
    if (item && content.needsUnbuiltAsset(item)) continue;
    answer(run, id, correct);
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
  answer(run, first, true);
  assert.equal(S.applyRoutingIfEntryComplete(run, 'listening', { now: NOW }), null,
    'routing ran on a partial entry block');
});

test('a strong entry routes to stretch, a weak one to foundation', () => {
  for (const [correct, expected] of [[4, ['stretch']], [2, ['foundation', 'stretch']], [0, ['foundation']]]) {
    const run = start();
    S.beginSection(run, 'listening', { now: NOW });
    run.sections.listening.plan.forEach((id, i) => { answer(run, id, i < correct); });
    const tiers = S.applyRoutingIfEntryComplete(run, 'listening', { now: NOW });
    assert.deepEqual(tiers, expected, `${correct}/4 correct routed wrongly`);
  }
});

test('routing appends the routed tiers in bank order and freezes the decision', () => {
  const run = start();
  S.beginSection(run, 'listening', { now: NOW });
  run.sections.listening.plan.forEach(id => answer(run, id, true));
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
  plan.slice(1).forEach(id => answer(run, id, true));
  const tiers = S.applyRoutingIfEntryComplete(run, 'listening', { now: NOW });
  assert.deepEqual(tiers, ['stretch'], '3 of 3 valid should still route strong');
});

// ── responses and exposure ──────────────────────────────────────────────────

test('a submitted item is never replayed as a new scored item', () => {
  const run = start();
  S.beginSection(run, 'listening', { now: NOW });
  const [id] = run.sections.listening.plan;
  const first = answer(run, id, true);
  const second = answer(run, id, false);
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

test('every speaking prompt is presentable now that its artwork exists', () => {
  // Before the four assets were drawn, two prompts per form could not be shown
  // and speaking could never reach its minimum. The skipping machinery is still
  // there and is tested against a hidden-artwork case in
  // tests/assessment-assets.test.js; here the point is that nothing is skipped.
  const run = start();
  S.beginSection(run, 'speaking', { now: NOW });
  assert.deepEqual(S.skippedForMissingAsset(run, 'speaking'), [],
    'a speaking prompt is still unrenderable');

  const shown = [];
  for (let i = 0; i < 20; i++) {
    const item = S.nextItem(run, 'speaking');
    if (!item) break;
    shown.push(item.id);
    S.submitResponse(run, item.id, {}, { now: NOW });
  }
  assert.equal(shown.length, content.itemsFor({ form: run.form, domain: 'speaking' }).length,
    'not every speaking prompt was offered');
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
  answer(run, plan[0], true);

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
  answer(run, run.sections.listening.plan[0], true);
  S.invalidateRun(run, { reason: 'interrupted by a sibling', now: NOW + 100 });
  assert.equal(run.status, RUN_STATUS.PARENT_INVALIDATED);
  assert.equal(run.invalidated_reason, 'interrupted by a sibling');
  assert.equal(Object.keys(run.responses).length, 1, 'voiding an attempt destroyed its evidence');
});

// ── Reassessment: which form, and whether it can measure anything ───────────
//
// administration.reassessment, in the content owner's order. The exception is
// permission to reuse a form, not an instruction to reuse it regardless of what
// the learner has already seen.

const terminalRun = ({ form = 'A', startedAt = NOW - 10 * DAY, responses = {}, exposure = {} } = {}) => ({
  run_id: 'run_' + startedAt, learner_id: 'jenn', form,
  status: RUN_STATUS.COMPLETE, started_at_utc: startedAt,
  responses, exposure, sections: {}, section_order: content.SECTION_ORDER,
});

/** n valid, independent, scored responses in one domain. */
const scored = (n, domain = 'listening') => Object.fromEntries(
  Array.from({ length: n }, (_, i) => [`${domain}-${i}#0`,
    { item_id: `${domain}-${i}`, domain, scored_correct: true, support_flag: false }]));

/** Mark every item of a form's domain as already shown. */
const exposeAll = (form, domains) => Object.fromEntries(
  domains.flatMap(d => content.itemsFor({ form, domain: d })
    .map(i => [i.id, { first_shown_at_utc: NOW - DAY, shown_count: 1 }])));

test('resuming a paused attempt is not a reassessment', () => {
  // The first branch of the rule. A run still in progress is picked up as it
  // stands — same run, same form — and no form choice happens at all.
  const store = freshStore();
  const live = start(store);
  live.form = 'A';
  store.runs[live.run_id] = live;

  const again = S.startRun(store, 'jenn', { now: NOW + 30 * DAY });
  assert.equal(again.resumed, true, 'a paused attempt was treated as a new one');
  assert.equal(again.run.run_id, live.run_id);
  assert.equal(again.run.form, 'A', 'resuming changed the form');
  assert.equal(again.plan, undefined, 'a form was chosen for a resume');
});

test('a new attempt within 60 days normally alternates', () => {
  const prior = [terminalRun({ form: 'A', responses: scored(8) })];
  const plan = S.planNextAttempt('jenn', prior, { now: NOW });
  assert.equal(plan.form, 'B');
  assert.equal(plan.reason, 'alternate_form');
});

test('a barely started attempt may repeat its form when enough is unexposed', () => {
  // Two answers, and only those two items shown. The form is almost untouched,
  // so spending the alternate on it would leave nothing fresh for the real one.
  const prior = [terminalRun({
    form: 'A',
    responses: scored(2),
    exposure: { 'LA-D01': { first_shown_at_utc: NOW - DAY, shown_count: 1 },
                'LA-D02': { first_shown_at_utc: NOW - DAY, shown_count: 1 } },
  })];
  const plan = S.planNextAttempt('jenn', prior, { now: NOW });
  assert.equal(plan.form, 'A', 'a nearly untouched form was thrown away');
  assert.equal(plan.reason, 'reuse_barely_used_form');
  assert.deepEqual(plan.insufficientDomains, []);
});

test('many exposed items that were technically invalid still count as exposed', () => {
  // The trap. Nothing was measured — every response was invalid, so the attempt
  // is "barely used" — but the items were still SHOWN, and exposure is about
  // showing, not scoring. Reusing the form would re-ask a bank she has seen.
  const shown = exposeAll('A', ['listening', 'reading', 'vocabulary_grammar']);
  const invalid = Object.fromEntries(Object.keys(shown).slice(0, 20).map(id =>
    [`${id}#0`, { item_id: id, domain: 'listening', technical_invalid_reason: 'audio_failed' }]));
  const prior = [terminalRun({ form: 'A', responses: invalid, exposure: shown })];

  assert.equal(S.barelyUsed(prior[0]), true, 'invalid responses should not read as evidence');
  const plan = S.planNextAttempt('jenn', prior, { now: NOW });
  assert.equal(plan.form, 'B', 'an exhausted form was reused because nothing scored on it');
  assert.equal(plan.reason, 'alternate_form');
});

test('same-form reuse is refused when it cannot meet the minimum', () => {
  // Barely used AND within 60 days — but the bank is gone, so the permission
  // does not apply and the alternate is used instead.
  const shown = exposeAll('A', ['listening', 'reading', 'vocabulary_grammar', 'writing', 'speaking']);
  const prior = [terminalRun({ form: 'A', responses: scored(1), exposure: shown })];

  assert.equal(S.barelyUsed(prior[0]), true);
  const plan = S.planNextAttempt('jenn', prior, { now: NOW });
  assert.equal(plan.form, 'B');
  assert.notEqual(plan.reason, 'reuse_barely_used_form');
});

test('when neither form can supply fresh evidence, it is reported rather than faked', () => {
  const both = {
    ...exposeAll('A', content.SECTION_ORDER),
    ...exposeAll('B', content.SECTION_ORDER),
  };
  const prior = [terminalRun({ form: 'A', responses: scored(8), exposure: both })];
  const plan = S.planNextAttempt('jenn', prior, { now: NOW });
  assert.equal(plan.reason, 'insufficient_fresh_evidence');
  assert.ok(plan.insufficientDomains.length > 0, 'the shortfall was not named');
  assert.equal(plan.sufficient, false);
});

test('the 60-day boundary decides whether reuse is even considered', () => {
  const bare = ex => [terminalRun({ form: 'A', startedAt: ex, responses: scored(2),
                                    exposure: { 'LA-D01': { shown_count: 1 } } })];
  const justInside = S.planNextAttempt('jenn', bare(NOW - 59 * DAY), { now: NOW });
  const justOutside = S.planNextAttempt('jenn', bare(NOW - 61 * DAY), { now: NOW });
  assert.equal(justInside.form, 'A', 'inside 60 days a barely-used form may repeat');
  assert.equal(justOutside.form, 'B', 'outside 60 days the alternate is used');
  assert.equal(justOutside.reason, 'alternate_form');
});

test('an item seen in an earlier attempt is marked, not counted as fresh', () => {
  // administration.exposure. The response is kept in full — it is still what
  // she did — but scoring must not treat it as fresh independent evidence.
  const store = freshStore();
  const old = terminalRun({ form: 'A', responses: scored(2),
                            exposure: { 'LA-D01': { shown_count: 1 } } });
  store.runs[old.run_id] = old;

  const { run } = S.startRun(store, 'jenn', { now: NOW });
  assert.ok(run.previously_exposed.includes('LA-D01'));

  S.beginSection(run, 'listening', { now: NOW });
  const [firstPlanned] = run.sections.listening.plan;
  answer(run, firstPlanned, true);
  const r = run.responses[responseKey(firstPlanned, 0)];
  if (firstPlanned === 'LA-D01') {
    assert.equal(r.previously_exposed, true, 'a re-shown item was not marked');
  }
  const other = run.previously_exposed.includes(firstPlanned);
  assert.equal(!!r.previously_exposed, other, 'the mark does not match the exposure record');
});

test('speaking reaches its minimum on both forms now the artwork exists', () => {
  // This test previously asserted the opposite, and was right to: five prompts
  // with two unrenderable left three against a minimum of four, so the domain
  // reported insufficient_evidence however well a learner did. The artwork is
  // what changed, not the minimum.
  for (const form of content.FORMS) {
    const fresh = S.freshEvidenceByDomain(form, new Set());
    for (const [domain, v] of Object.entries(fresh)) {
      assert.equal(v.sufficient, true,
        `${form}/${domain}: ${v.available} presentable against a minimum of ${v.minimum}`);
    }
    assert.equal(fresh.speaking.available, 5);
    assert.equal(fresh.speaking.minimum, 4);
  }
  const plan = S.planNextAttempt('jenn', [], { now: NOW });
  assert.deepEqual(plan.blockedByContent, [], 'a domain is still blocked by missing content');
  assert.deepEqual(plan.insufficientDomains, []);
  assert.equal(plan.sufficient, true);
});
