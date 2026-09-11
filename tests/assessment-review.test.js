// The review queue, rubric application, invalidation, and the scorer's export.
//
// The rules this file exists to hold: a review without a named scorer is
// refused, an invalid response is preserved rather than turned into a wrong
// answer, and the export never carries a model answer to the person deciding
// what the child's answer is worth.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/assessment/review.js';
import * as C from '../src/assessment/content.js';
import * as report from '../src/assessment/report.js';
import { responseKey } from '../src/assessment/run-model.js';
import { administer, FULL_MARKS, SPEAKING_MARKS } from './helpers/administer.js';
import * as G from './helpers/content-guards.js';

const run = () => administer({ learner: 'jenn' });
const writingIds = r => R.queue(r).filter(e => e.domain === 'writing').map(e => e.item_id);

// -- the queue ---------------------------------------------------------------

test('the queue holds every open prompt and nothing that is machine-scored', () => {
  const r = run();
  const q = R.queue(r);
  assert.equal(q.length, 11, 'a form is 6 written and 5 spoken prompts');
  assert.deepEqual([...new Set(q.map(e => e.domain))], ['writing', 'speaking']);
  for (const e of q) {
    assert.ok(e.rubric, `${e.item_id} reached the queue without a rubric`);
    assert.equal(e.status, 'awaiting_review');
  }
  assert.equal(R.outstanding(r), 11);
});

test('writing comes before speaking, in the order they were answered', () => {
  const q = R.queue(run());
  const firstSpeaking = q.findIndex(e => e.domain === 'speaking');
  assert.ok(q.slice(0, firstSpeaking).every(e => e.domain === 'writing'));
  const times = q.slice(0, firstSpeaking).map(e => e.item_id);
  assert.deepEqual(times, [...times], 'order is stable');
});

// -- who may score -----------------------------------------------------------

test('a review without a named scorer is refused', () => {
  const r = run();
  const id = writingIds(r)[0];
  for (const nobody of [undefined, null, '', '   ']) {
    assert.throws(
      () => R.recordReview(r, { itemId: id, scorerId: nobody, scores: FULL_MARKS }),
      R.ReviewRefused,
      `${JSON.stringify(nobody)} was accepted as a scorer`);
  }
  assert.equal(r.review?.[responseKey(id, 0)], undefined, 'a refused review was written anyway');
  assert.equal(R.outstanding(r), 11);
});

test('a named scorer is recorded, and the run can then report a band', () => {
  const r = run();
  const id = writingIds(r)[0];
  const review = R.recordReview(r, { itemId: id, scorerId: '  Mme Tremblay  ', scores: FULL_MARKS });
  assert.equal(review.scorer_id, 'Mme Tremblay', 'the name was not trimmed');
  assert.equal(review.rubric_id, 'WRITING-ANALYTIC-V1');
  assert.equal(R.outstanding(r), 10);
  assert.equal(R.queue(r).find(e => e.item_id === id).status, 'reviewed');
});

test('a re-score replaces the first one — a correction is meant to win', () => {
  const r = run();
  const id = writingIds(r)[0];
  R.recordReview(r, { itemId: id, scorerId: 'A', scores: FULL_MARKS, now: 1000 });
  const second = { ...FULL_MARKS, message: 1 };
  R.recordReview(r, { itemId: id, scorerId: 'B', scores: second, now: 2000 });
  const stored = r.review[responseKey(id, 0)];
  assert.equal(stored.scorer_id, 'B');
  assert.equal(stored.scores.message, 1);
  assert.equal(stored.reviewed_at_utc, 2000);
});

// -- the scale ---------------------------------------------------------------

test('a score outside the anchors is refused rather than scaled', () => {
  const r = run();
  const id = writingIds(r)[0];
  for (const bad of [4, -1, 2.5, '3.5', 'three', 30]) {
    assert.throws(
      () => R.recordReview(r, { itemId: id, scorerId: 'A', scores: { ...FULL_MARKS, message: bad } }),
      R.ReviewRefused, `${bad} was accepted as a 0-3 anchor`);
  }
});

test('a missing dimension names itself, and an invented one is refused', () => {
  const r = run();
  const id = writingIds(r)[0];
  const short = { ...FULL_MARKS };
  delete short.conventions;
  assert.throws(() => R.recordReview(r, { itemId: id, scorerId: 'A', scores: short }),
    /conventions has not been scored/);
  assert.throws(
    () => R.recordReview(r, { itemId: id, scorerId: 'A', scores: { ...FULL_MARKS, flair: 3 } }),
    /no dimension "flair"/);
});

test('the speaking rubric is the one applied to a spoken prompt', () => {
  const r = run();
  const spoken = R.queue(r).find(e => e.domain === 'speaking');
  assert.equal(spoken.rubric.id, 'SPEAKING-ANALYTIC-V1');
  // The writing dimensions are not the speaking ones, so they must not be taken.
  assert.throws(() => R.recordReview(r, { itemId: spoken.item_id, scorerId: 'A', scores: FULL_MARKS }),
    R.ReviewRefused);
  const ok = R.recordReview(r, { itemId: spoken.item_id, scorerId: 'A', scores: SPEAKING_MARKS });
  assert.equal(ok.rubric_id, 'SPEAKING-ANALYTIC-V1');
});

// -- invalidation, and support ----------------------------------------------

test('a parent setting a response aside keeps it, and it is not scored', () => {
  const r = run();
  const id = writingIds(r)[0];
  R.invalidate(r, id);
  const entry = R.queue(r).find(e => e.item_id === id);
  assert.equal(entry.status, 'invalid');
  assert.equal(entry.raw_response.length > 0, true, 'the response was destroyed');
  assert.equal(entry.result.valid, false);
  assert.equal(entry.result.rubric_score, null, 'an invalid response was given a score');
  assert.throws(() => R.recordReview(r, { itemId: id, scorerId: 'A', scores: FULL_MARKS }),
    /marked invalid/);
});

test('a parent can undo their own setting-aside, but not the app\'s', () => {
  const r = run();
  const [mine, appsOwn] = writingIds(r);
  R.invalidate(r, mine);
  R.clearInvalidation(r, mine);
  assert.equal(R.queue(r).find(e => e.item_id === mine).status, 'awaiting_review');

  r.responses[responseKey(appsOwn, 0)].technical_invalid_reason = 'app_interrupted_before_submit';
  assert.throws(() => R.clearInvalidation(r, appsOwn), /only a response a parent set aside/);
  assert.equal(r.responses[responseKey(appsOwn, 0)].technical_invalid_reason,
    'app_interrupted_before_submit', 'the app\'s own finding was erased');
});

test('the adult marks a response as helped, and it is kept as supported', () => {
  const r = run();
  const id = writingIds(r)[0];
  R.setSupport(r, id, 0, true);
  R.recordReview(r, { itemId: id, scorerId: 'A', scores: FULL_MARKS });
  const entry = R.queue(r).find(e => e.item_id === id);
  assert.equal(entry.support_flag, true);
  assert.equal(entry.raw_response.length > 0, true);
  assert.equal(entry.status, 'reviewed');

  // Supported evidence is excluded from the band but not deleted.
  const domain = report.domainReport(r, 'writing');
  assert.equal(domain.support_count >= 1, true, 'the help was not reported');
});

test('a review for a prompt that was never answered is refused', () => {
  const r = run();
  assert.throws(() => R.recordReview(r, { itemId: 'WB-F01', scorerId: 'A', scores: FULL_MARKS }),
    /never answered/);
});

// -- the export --------------------------------------------------------------

test('the export carries the prompt, the child\'s words, and every anchor', () => {
  const r = run();
  const text = R.exportText(r, { learnerName: 'Jenn' });
  const first = R.queue(r)[0];

  assert.ok(text.includes('Jenn'));
  assert.ok(text.includes(C.RELEASE_ID), 'the export does not say which content it came from');
  assert.ok(text.includes(first.item_id));
  assert.ok(text.includes(first.prompt_en.slice(0, 30)), 'the prompt is missing');
  assert.ok(text.includes('Je parle français.'), 'the child\'s own answer is missing');

  const rubric = R.rubricFor(C.getItem(first.item_id));
  for (const d of rubric.dimensions) {
    assert.ok(text.includes(d.id), `${d.id} is not in the export`);
    for (const n of ['0', '1', '2', '3']) {
      assert.ok(text.includes(d.anchors[n].slice(0, 25)),
        `${d.id} anchor ${n} is missing, so the scale has no wording`);
    }
  }
});

test('the export never hands the scorer a model answer', () => {
  // The rubric asks whether the child communicated, not whether she matched a
  // sample. A scorer holding the sample marks the difference instead.
  const r = run();
  const text = R.exportText(r);
  const scorerFacing = C.ITEMS
    .flatMap(i => [i.scoring?.model_response, i.author_notes])
    .filter(Boolean);
  assert.deepEqual(G.leakedStrings([text], scorerFacing), [],
    'a model answer or an author note reached the person doing the scoring');

  // The guard can fail: the same check over a text that does carry one.
  const model = C.ITEMS.find(i => i.scoring?.model_response).scoring.model_response;
  assert.deepEqual(G.leakedStrings([`${text}\n${model}`], scorerFacing), [model]);
});

test('the export tells a scorer what to do when they cannot score something', () => {
  const text = R.exportText(run());
  // The content owner's own sentence, not a paraphrase of it.
  const rule = R.UNRESOLVED_RULE.split(/\s+/).slice(0, 6).join(' ');
  assert.ok(text.includes(rule.slice(0, 20)), 'the unresolved-review rule is not in the export');
  assert.match(text, /awaiting_review/);
});

test('the export says the spoken answers are not in it, and why', () => {
  const text = R.exportText(run());
  assert.match(text, /SPEAKING/);
  assert.match(text, /stay on the iPad/i);
  assert.match(text, /transcript is not permitted/i);
});

test('a response set aside is marked not-for-scoring rather than omitted', () => {
  const r = run();
  const id = writingIds(r)[0];
  R.invalidate(r, id);
  const text = R.exportText(r);
  assert.ok(text.includes(id), 'a set-aside prompt vanished from the export');
  assert.match(text, /NOT FOR SCORING/);
});

test('the export asks for the anchors that the rubric actually weights', () => {
  const text = R.exportText(run());
  for (const rubric of C.RUBRICS.rubrics) {
    for (const d of rubric.dimensions) {
      assert.ok(text.includes(`${d.id}  (counts ${d.weight}×)`),
        `${rubric.id}/${d.id} does not show its weight`);
    }
  }
});

test('a worked example that is a prompt\'s model answer is held back, and said so', () => {
  // WRITING-ANALYTIC-V1's 3/3 example is, word for word, WA-D02's model answer,
  // and WA-D02 is a form-A written prompt. Both are the content owner's, and
  // both are right where they are; what cannot happen is a scorer reading the
  // second while marking the first.
  const model = C.getItem('WA-D02').scoring.model_response;
  const example = C.RUBRICS.rubrics
    .find(r => r.id === 'WRITING-ANALYTIC-V1').examples
    .find(e => e.response === model);
  assert.ok(example, 'the collision this test guards has gone — check why before deleting it');

  const a = administer({ learner: 'jenn' });                 // form A: has WA-D02
  assert.ok(writingIds(a).includes('WA-D02'));
  const textA = R.exportText(a);
  assert.ok(!textA.includes(model), 'the model answer was printed as a worked example');
  assert.match(textA, /held back/);

  // The weak example for the same prompt is not a model answer, and stays:
  // "here is what a 1 looks like" gives nothing away.
  const weak = C.RUBRICS.rubrics
    .find(r => r.id === 'WRITING-ANALYTIC-V1').examples
    .find(e => e.prompt_id === 'WA-D02' && e.response !== model);
  assert.ok(textA.includes(weak.response), 'a low-scoring example was withheld along with the model');

  // And on the other form, where WA-D02 is not administered, nothing is held.
  const b = administer({ learner: 'jess' });
  assert.ok(!writingIds(b).includes('WA-D02'));
  const textB = R.exportText(b);
  assert.ok(textB.includes(model), 'an example was withheld from a form that does not use that prompt');
  assert.ok(!/held back/.test(textB));
});
