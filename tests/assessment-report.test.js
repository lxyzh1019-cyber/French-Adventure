// The report a parent reads.
//
// Five banded sections and nothing else. The things this file mostly exists to
// prevent are the tempting ones: a total across domains, a pronunciation score
// derived from what the device thought it heard, and a band for writing or
// speaking before a person has read or listened to anything.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/assessment/content.js';
import * as R from '../src/assessment/report.js';
import { responseKey } from '../src/assessment/run-model.js';
import { administer, humanReview, idsIn, FULL_MARKS, SPEAKING_MARKS } from './helpers/administer.js';

const RULES = C.RULES;

const sectionOf = (report, domain) => report.sections.find(s => s.domain === domain);

// ── shape ───────────────────────────────────────────────────────────────────

test('the report has five banded sections, in the release order', () => {
  const report = R.runReport(administer());
  assert.deepEqual(report.sections.map(s => s.domain),
    ['listening', 'reading', 'vocabulary_grammar', 'writing', 'speaking']);
  assert.deepEqual(report.sections.map(s => s.label),
    ['Listening', 'Reading', 'Vocabulary and grammar', 'Writing', 'Speaking']);
  // The canonical key, not "vocab" or "words", whatever a screen chooses to say.
  assert.equal(sectionOf(report, 'vocabulary_grammar').label, 'Vocabulary and grammar');
});

test('every field the release requires is on every section', () => {
  const report = R.runReport(administer());
  for (const section of report.sections) {
    for (const field of RULES.reporting.required_fields) {
      assert.ok(field in section, `${section.domain} is missing ${field}`);
    }
  }
});

test('there is no total, no average and no overall band', () => {
  const report = R.runReport(administer());
  assert.equal(report.overall_score, null);

  // Nothing anywhere in the report may look like a score for the child as a
  // whole. Section-level points are fine; a cross-domain number is not.
  const walk = (node, path = '') => {
    if (node == null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const here = path ? `${path}.${key}` : key;
      if (/^(total|average|mean|overall_band|overall_percent|grade|level_overall)$/i.test(key)) {
        assert.fail(`the report carries ${here}`);
      }
      walk(value, here);
    }
  };
  walk(report);
});

// ── pronunciation is nested, unbanded and unscored ──────────────────────────

test('pronunciation is inside the speaking section, not a sixth section', () => {
  const run = administer();
  for (const id of idsIn(run, 'speaking')) humanReview(run, id, SPEAKING_MARKS);
  const report = R.runReport(run);

  assert.equal(report.sections.length, 5, 'a sixth section appeared');
  assert.equal(report.sections.some(s => /pronunciation/i.test(s.domain)), false);

  const speaking = sectionOf(report, 'speaking');
  const p = speaking.pronunciation_observations;
  assert.ok(p, 'the speaking section carries no pronunciation observations');
  assert.equal(p.label, 'Pronunciation observations');
  assert.equal(p.parent_domain, 'speaking');
  assert.equal(p.band, null, 'pronunciation was given a band');
  assert.equal(p.score, null, 'pronunciation was given a score');
  assert.equal('domain_band' in p, false, 'pronunciation was given a domain_band');
});

test('P_ skills are observations, and never a strength or a next need', () => {
  const run = administer({ answer: () => true });
  for (const id of idsIn(run, 'speaking')) humanReview(run, id, SPEAKING_MARKS);
  const report = R.runReport(run);

  const named = report.sections.flatMap(s => [...s.strength_skill_ids, ...s.next_need_skill_ids]);
  assert.deepEqual(named.filter(id => id.startsWith('P_')), [],
    'a pronunciation skill was reported as a strength or a need');

  // They are reported — under Speaking, one level in, with no level of their own.
  const p = sectionOf(report, 'speaking').pronunciation_observations;
  assert.ok(p.skills.length > 0, 'no pronunciation observation was reported at all');
  for (const s of p.skills) {
    assert.ok(s.skill_id.startsWith('P_'));
    assert.equal(s.level, null, `${s.skill_id} was given a level`);
  }
  // And S_ skills sit under Speaking itself.
  const speakingSkills = sectionOf(report, 'speaking').skill_evidence.map(e => e.skill_id);
  assert.ok(speakingSkills.some(id => id.startsWith('S_')), 'no speaking skill was reported');
  assert.deepEqual(speakingSkills.filter(id => id.startsWith('P_')), []);
});

test('a transcript on its own produces no pronunciation observation', () => {
  // Every speaking response in this run carries what the device thought it
  // heard, and nobody has listened to any of them.
  const run = administer();
  const spoken = Object.values(run.responses).filter(r => r.domain === 'speaking');
  assert.ok(spoken.every(r => r.transcript_observation), 'the fixture has no transcripts to ignore');

  const p = R.pronunciationObservations(run);
  assert.equal(p.available, false);
  assert.equal(p.reason, 'awaiting_human_review');
  assert.deepEqual(p.prompts, []);
  assert.equal(p.score, null);
});

test('one reviewed prompt is not enough to observe pronunciation', () => {
  const run = administer();
  humanReview(run, idsIn(run, 'speaking')[0], SPEAKING_MARKS);

  const p = R.pronunciationObservations(run);
  assert.equal(p.reviewed_prompt_count, 1);
  assert.equal(p.available, false);
  assert.equal(p.reason, 'not_enough_prompts');
  assert.deepEqual(p.skills, [], 'a skill was named from a single prompt');
});

test('two reviewed prompts report the human observation and the transcript apart', () => {
  const run = administer();
  const [a, b] = idsIn(run, 'speaking');
  humanReview(run, a, SPEAKING_MARKS);
  humanReview(run, b, { ...SPEAKING_MARKS, pronunciation_observation: 1 });

  const p = R.pronunciationObservations(run);
  assert.equal(p.available, true);
  assert.equal(p.reviewed_prompt_count, 2);
  assert.equal(p.score, null, 'two observations were turned into a score');

  const first = p.prompts.find(x => x.item_id === a);
  assert.equal(first.observation, 2);
  assert.ok(first.anchor, 'the observation was reported as a bare number');
  assert.equal(first.scorer_id, 'parent-1');
  // The transcript is beside the observation, not inside it.
  assert.equal(first.transcript_observation, 'bonjour je parle');
  assert.equal(first.voice_requested_locale, 'fr-CA');
  assert.equal(first.voice_resolved_locale, 'fr-FR');
});

// ── strengths and next needs ────────────────────────────────────────────────

test('a skill needs two attempts before it is named at all', () => {
  const run = administer();
  const evidence = R.skillEvidence(run);
  for (const e of evidence) {
    if (e.attempts < R.SKILL_EVIDENCE_RULE.minimum_attempts_per_skill) {
      assert.equal(e.level, 'insufficient_evidence', `${e.skill_id} was judged on ${e.attempts}`);
    }
  }
  const named = new Set(R.runReport(run).sections
    .flatMap(s => [...s.strength_skill_ids, ...s.next_need_skill_ids]));
  for (const e of evidence) {
    if (e.attempts < 2) assert.equal(named.has(e.skill_id), false,
      `${e.skill_id} was reported to a parent on ${e.attempts} attempt`);
  }
});

test('answering everything correctly produces strengths and no next needs', () => {
  const report = R.runReport(administer({ answer: () => true }));
  const listening = sectionOf(report, 'listening');
  assert.ok(listening.strength_skill_ids.length > 0, 'nothing was reported as a strength');
  assert.deepEqual(listening.next_need_skill_ids, []);
  assert.ok(listening.strength_skill_ids.every(id => id.startsWith('L_')),
    'a skill from another domain was reported under listening');
});

test('answering everything wrongly produces next needs and no strengths', () => {
  const report = R.runReport(administer({ answer: () => false }));
  const reading = sectionOf(report, 'reading');
  assert.ok(reading.next_need_skill_ids.length > 0, 'nothing was reported as a next need');
  assert.deepEqual(reading.strength_skill_ids, []);
  assert.equal(reading.domain_band, 'below_assessment_floor');
});

test('the cut scores come from the release, not from this file', () => {
  const run = administer({ answer: () => true });
  assert.ok(R.skillEvidence(run).some(e => e.level === 'strength'));

  // Same evidence, a release that asks for more.
  const strict = { ...RULES, scoring: { ...RULES.scoring, secure_threshold: 1.01 } };
  const strictly = R.skillEvidence(run, { rules: strict });
  assert.deepEqual(strictly.filter(e => e.level === 'strength'), [],
    'the thresholds are not being read from the rules');
});

test('supported and invalid answers are not evidence', () => {
  const run = administer({ answer: () => true });
  const before = R.skillEvidence(run).filter(e => e.domain === 'listening');
  assert.ok(before.length > 0, 'the run produced no listening evidence to take away');

  for (const r of Object.values(run.responses)) {
    if (r.domain !== 'listening') continue;
    r.support_flag = true;                 // the adult in the room helped
  }
  assert.deepEqual(R.skillEvidence(run).filter(e => e.domain === 'listening'), [],
    'a supported answer was counted as independent evidence');

  const section = R.domainReport(run, 'listening');
  assert.equal(section.domain_band, 'insufficient_evidence');
  assert.ok(section.support_count > 0, 'the support was not reported');
});

// ── writing and speaking wait for a person ──────────────────────────────────

test('writing has no band until a named human has reviewed enough of it', () => {
  const run = administer();
  const writing = R.domainReport(run, 'writing');
  assert.equal(writing.domain_band, R.AWAITING_REVIEW);
  assert.equal(writing.confidence, 'insufficient');
  assert.equal('percent' in writing, false, 'an unreviewed domain was given a percent');
  assert.ok(writing.awaiting_review_count > 0, 'nothing was reported as waiting');

  // Four of the six reviewed is still short of the release's minimum of five.
  const ids = idsIn(run, 'writing');
  for (const id of ids.slice(0, 4)) humanReview(run, id, FULL_MARKS);
  assert.equal(R.domainReport(run, 'writing').domain_band, R.AWAITING_REVIEW);

  for (const id of ids.slice(4)) humanReview(run, id, FULL_MARKS);
  const banded = R.domainReport(run, 'writing');
  assert.notEqual(banded.domain_band, R.AWAITING_REVIEW);
  assert.ok(Object.values(RULES.scoring.open_domain_labels).includes(banded.domain_band),
    `${banded.domain_band} is not one of the release's open-domain labels`);
  assert.equal(banded.percent, 100);
});

test('a review without a named scorer is not a review', () => {
  const run = administer();
  for (const id of idsIn(run, 'writing')) {
    humanReview(run, id, FULL_MARKS, { scorerId: null });
  }
  assert.equal(R.domainReport(run, 'writing').domain_band, R.AWAITING_REVIEW,
    'an unattributed rubric score was treated as a human review');
});

test('an invalidated review stops counting, and the response is kept', () => {
  const run = administer();
  const ids = idsIn(run, 'writing');
  for (const id of ids) humanReview(run, id, FULL_MARKS);
  assert.notEqual(R.domainReport(run, 'writing').domain_band, R.AWAITING_REVIEW);

  // The release needs five reviewed prompts, and this form has six, so one
  // invalidation still leaves a band. Two does not.
  const minimum = RULES.scoring.minimum_independent_valid_items.writing;
  for (const id of ids.slice(0, ids.length - minimum + 1)) {
    run.review[responseKey(id, 0)].invalidated = true;
  }
  assert.equal(R.domainReport(run, 'writing').domain_band, R.AWAITING_REVIEW);
  for (const id of ids) {
    assert.ok(run.responses[responseKey(id, 0)], `${id}'s response went with its review`);
  }
});

// ── comparison ──────────────────────────────────────────────────────────────

test('a domain nobody has measured is not compared', () => {
  const before = administer({ answer: () => true });
  const after = administer({ answer: () => true, learner: 'jess' });
  const cmp = R.compareRuns(before, after);

  const writing = cmp.domains.find(d => d.domain === 'writing');
  assert.equal(writing.comparable, false, 'an unreviewed domain was compared');
  assert.equal(writing.changed, null, 'a change was reported where nothing was measured');

  const listening = cmp.domains.find(d => d.domain === 'listening');
  assert.equal(listening.comparable, true);
  assert.equal(listening.changed, false, 'two identical runs were reported as a change');
  assert.equal('overall' in cmp, false, 'the comparison carries an overall figure');
});

test('a drop is reported as plainly as a gain', () => {
  const strong = administer({ answer: () => true });
  const weak = administer({ answer: () => false });
  const cmp = R.compareRuns(strong, weak);
  const listening = cmp.domains.find(d => d.domain === 'listening');
  assert.equal(listening.comparable, true);
  assert.equal(listening.changed, true);
  assert.equal(listening.current_band, 'below_assessment_floor');
});

// ── the release's own vocabulary ────────────────────────────────────────────

test('no report text repeats a prohibited claim', () => {
  const run = administer({ answer: () => true });
  for (const id of idsIn(run, 'writing')) humanReview(run, id, FULL_MARKS);
  for (const id of idsIn(run, 'speaking')) humanReview(run, id, SPEAKING_MARKS);
  const text = JSON.stringify(R.runReport(run)).toLowerCase();
  for (const claim of R.prohibitedClaims()) {
    const words = claim.toLowerCase().replace(/ x$/, '');
    assert.equal(text.includes(words), false, `the report claims "${claim}"`);
  }
});

test('a skill the report cannot place is an error, not a silent omission', () => {
  assert.throws(() => R.skillIndex({ skills: [{ id: 'X_NEW', domain: 'Handwriting' }] }),
    /unknown skill domain/);
  // And a pronunciation skill that stops looking like one is caught too, since
  // that is what would quietly turn an observation into a band.
  assert.throws(() => R.skillIndex({ skills: [{ id: 'S_ODD', domain: 'Pronunciation observation' }] }),
    /does not match its domain/);
});
