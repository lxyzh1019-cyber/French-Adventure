// The Release A scoring contract, executed. Every case in
// content/releases/assessment-v1/scoring_fixtures.json runs against
// src/assessment/scoring.js, plus the routing and form-assignment rules.
//
// If a fixture fails here, either the rules were implemented wrongly or the
// content package is internally inconsistent — both must be resolved before
// M2 can proceed. Nothing here is learner-facing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  scoreObjective, scoreRubric, objectiveBand, routeAfterEntry,
  assignFirstForm, alternateForm, fnv1a32, openDomainLabel,
} from '../src/assessment/scoring.js';

const DIR = 'content/releases/assessment-v1/';
const J = f => JSON.parse(readFileSync(DIR + f, 'utf8'));
const items = Object.fromEntries(J('assessment_items.json').items.map(i => [i.id, i]));
const rules = J('assessment_rules.json');
const rubrics = Object.fromEntries(J('rubrics.json').rubrics.map(r => [r.id, r]));
const fixtures = J('scoring_fixtures.json').fixtures;

// Only compare the keys the fixture states; the scorer may report more.
const expectSubset = (actual, expected, label) => {
  for (const [k, v] of Object.entries(expected)) {
    assert.deepEqual(actual[k], v, `${label}: ${k} expected ${JSON.stringify(v)}, got ${JSON.stringify(actual[k])}`);
  }
};

for (const f of fixtures) {
  test(`fixture ${f.id} (${f.case})`, () => {
    if (f.case === 'objective_band') {
      const r = objectiveBand(f.domain, f.tier_results, rules, { invalidCount: f.invalid_count || 0 });
      expectSubset(r, f.expected, f.id);
      return;
    }
    const item = items[f.item_id];
    assert.ok(item, `${f.id}: item ${f.item_id} missing`);
    if (item.scoring.method === 'objective') {
      const r = scoreObjective(item, f.response);
      expectSubset(r, f.expected, f.id);
    } else {
      const rubric = rubrics[item.scoring.rubric_id];
      const r = scoreRubric(rubric, f.human_scores ?? null, f.response);
      expectSubset(r, f.expected, f.id);
    }
  });
}

test('every fixture case type the plan requires is present', () => {
  const cases = new Set(fixtures.map(f => f.case));
  for (const c of ['correct', 'incorrect', 'partial', 'supported', 'technically_invalid'])
    assert.ok(cases.has(c), `no ${c} fixture`);
});

test('rubric examples in rubrics.json reproduce their own scores', () => {
  for (const rubric of Object.values(rubrics)) {
    for (const ex of rubric.examples) {
      if (!ex.scores) {
        const r = scoreRubric(rubric, null, { technical_invalid_reason: ex.technical_invalid_reason });
        assert.equal(r.rubric_score, null);
        assert.equal(r.valid, false);
        continue;
      }
      const r = scoreRubric(rubric, ex.scores);
      assert.equal(r.weighted_max, 30, `${rubric.id}: max weighted score is stated as 30`);
      assert.ok(r.percent >= 0 && r.percent <= 100);
    }
  }
  // Worked example from the rules: 15/30 = 50 → "developing".
  assert.equal(openDomainLabel(50, rules), 'developing');
  assert.equal(openDomainLabel(85, rules), 'stretch_secure');
  assert.equal(openDomainLabel(0, rules), 'starting');
});

test('a spelling-tested typed item gives meaning credit but no point for a missed accent', () => {
  const r = scoreObjective(items['VGA-F04'], { text: 'ou' });
  assert.equal(r.points, 0); assert.equal(r.meaning, true); assert.equal(r.spelling, false);
  assert.equal(r.report_flag, 'spelling_needs_correction');
  // The same rule in reverse: the accented word is exact.
  assert.equal(scoreObjective(items['VGA-F04'], { text: 'Où ' }).points, 1);
});

test('a technically invalid response is neither correct nor incorrect, and keeps its reason', () => {
  const r = scoreObjective(items['LB-D03'], { choice_ids: [], technical_invalid_reason: 'audio_failed' });
  assert.equal(r.points, null); assert.equal(r.valid, false); assert.equal(r.incorrect, false);
  assert.equal(r.technical_invalid_reason, 'audio_failed');
  assert.equal(r.replacement_tier, items['LB-D03'].difficulty_tier);
});

test('a supported response keeps its points but leaves the independent band', () => {
  const r = scoreObjective(items['RA-D02'], { choice_ids: items['RA-D02'].answer_key.correct_choice_ids, support_flag: true });
  assert.equal(r.points, 1);
  assert.equal(r.independent_band_included, false);
  assert.equal(r.support_count_increment, 1);
});

test('routing after the entry block follows the weak / borderline / strong rule', () => {
  for (const d of ['listening', 'reading']) {
    assert.deepEqual(routeAfterEntry(d, 0, 4, rules), ['foundation']);
    assert.deepEqual(routeAfterEntry(d, 1, 4, rules), ['foundation']);
    assert.deepEqual(routeAfterEntry(d, 2, 4, rules), ['foundation', 'stretch']);
    assert.deepEqual(routeAfterEntry(d, 3, 4, rules), ['stretch']);
    assert.deepEqual(routeAfterEntry(d, 4, 4, rules), ['stretch']);
  }
  assert.deepEqual(routeAfterEntry('vocabulary_grammar', 1, 3, rules), ['foundation']);
  assert.deepEqual(routeAfterEntry('vocabulary_grammar', 2, 3, rules), ['foundation', 'stretch']);
  assert.deepEqual(routeAfterEntry('vocabulary_grammar', 3, 3, rules), ['stretch']);
});

test('an unadministered tier is never inferred, and no total or average exists', () => {
  const r = objectiveBand('listening', { developing: { correct: 3, valid: 4 } }, rules);
  // 4 valid < minimum 6: the band must say so rather than guess.
  assert.equal(r.band, 'insufficient_evidence');
  assert.equal(r.confidence, 'insufficient');
  assert.ok(!('total' in r) && !('average' in r));
});

test('confidence drops with support, invalid items, or a contradictory tier pattern', () => {
  const base = { developing: { correct: 3, valid: 4 }, stretch: { correct: 1, valid: 4 } };
  assert.equal(objectiveBand('listening', base, rules).confidence, 'high');
  assert.equal(objectiveBand('listening', base, rules, { supportCount: 1 }).confidence, 'moderate');
  assert.equal(objectiveBand('listening', base, rules, { invalidCount: 2 }).confidence, 'moderate');
  assert.equal(objectiveBand('listening', base, rules, { invalidCount: 2, supportCount: 1 }).confidence, 'low');
  // Stretch secure while developing is below emerging: inconsistent.
  const odd = { developing: { correct: 1, valid: 4 }, stretch: { correct: 4, valid: 4 } };
  assert.equal(objectiveBand('reading', odd, rules).confidence, 'moderate');
});

test('first form: jenn=A, jess=B, others by FNV-1a low bit; reassessment alternates', () => {
  assert.equal(assignFirstForm('jenn', 'assessment-v1.0.0'), 'A');
  assert.equal(assignFirstForm('jess', 'assessment-v1.0.0'), 'B');
  // FNV-1a reference vectors.
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('a'), 0xe40c292c);
  const other = assignFirstForm('someone', 'assessment-v1.0.0');
  assert.ok(other === 'A' || other === 'B');
  assert.equal(other, (fnv1a32('someone|assessment-v1.0.0') & 1) === 0 ? 'A' : 'B');
  assert.equal(alternateForm('A'), 'B'); assert.equal(alternateForm('B'), 'A');
});

test('the named learners keep their form when the release id changes', () => {
  // assignFirstForm hashes learner_id + "|" + release_id, so bumping the
  // release reshuffles form assignment for anyone not named in the rules. Jenn
  // and Jess are named, so the bump to 1.0.1 must not move them; the hardcoded
  // vectors above are reference values for the hash, not for the live release.
  assert.equal(assignFirstForm('jenn', rules.release_id), 'A');
  assert.equal(assignFirstForm('jess', rules.release_id), 'B');
  assert.equal(rules.release_id, 'assessment-v1.0.1', 'the release under test');
});

test('the thresholds are stated as numbers, and agree with the prose', () => {
  assert.equal(rules.scoring.secure_threshold, 0.75);
  assert.equal(rules.scoring.emerging_threshold, 0.50);
  assert.match(rules.scoring.tier_profile, />=75%/);
  assert.match(rules.scoring.tier_profile, />=50%/);
  assert.match(rules.scoring.tier_profile, /at least 3 independent valid items/);
});

test('the band actually moves when the release changes its thresholds', () => {
  // Reading a value and using it are different claims. The module used to hold
  // its own copy of 0.75/0.50, and every fixture passed either way — so
  // "reads from the rules" needs a case where the two answers differ.
  // 75% exactly, and enough items to clear minimum_independent_valid_items.
  const threeOfFour = { developing: { correct: 6, valid: 8 } };
  const withThresholds = (secure, emerging) => ({
    ...rules,
    scoring: { ...rules.scoring, secure_threshold: secure, emerging_threshold: emerging },
  });

  assert.equal(
    objectiveBand('listening', threeOfFour, withThresholds(0.75, 0.50)).band,
    'developing_secure', '75% is secure at the release thresholds');

  assert.equal(
    objectiveBand('listening', threeOfFour, withThresholds(0.90, 0.50)).band,
    'developing_emerging', 'a stricter release must lower the band');

  assert.equal(
    objectiveBand('listening', threeOfFour, withThresholds(0.95, 0.80)).band,
    'insufficient_evidence', 'below both cut scores the tier is not reached');
});

test('a release that does not state its thresholds is refused, not guessed at', () => {
  const stripped = { ...rules, scoring: { ...rules.scoring } };
  delete stripped.scoring.secure_threshold;
  assert.throws(
    () => objectiveBand('listening', { developing: { correct: 6, valid: 8 } }, stripped),
    /secure_threshold/,
    'a missing cut score must not fall back to a value coded into the module');
});
