import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRADE_KEYS, levelNumber, gradeKeyForLevel, levelLabel, isLevelReachable,
  levelAccuracy, hasMoon, recommendLevel, recommendationText,
  MIN_ATTEMPTS_FOR_SIGNAL, COMFORTABLE_ACCURACY,
} from '../src/learning/levels.js';

// Build a state whose gradeStats give a level a known accuracy.
const withStats = (perGrade) => ({
  gradeStats: Object.fromEntries(Object.entries(perGrade).map(([g, [c, w]], i) =>
    [`2026-01-${String(i + 1).padStart(2, '0')}`, { [g]: { correct: c, wrong: w } }])),
});

test('every level is reachable — there is no gate', () => {
  // The defect this replaces made the next level mathematically unreachable at
  // one or two sessions a week. Nothing may reintroduce a lock.
  for (const g of GRADE_KEYS) assert.equal(isLevelReachable(g), true);
});

test('levels are labelled as levels, never as school grades', () => {
  assert.equal(levelNumber(4), 1);
  assert.equal(levelNumber(10), 7);
  assert.equal(levelLabel(4), 'Level 1');
  assert.equal(levelLabel(7), 'Level 4');
  for (const g of GRADE_KEYS) assert.doesNotMatch(levelLabel(g), /grade/i);
});

test('level numbers and storage keys round-trip', () => {
  for (const g of GRADE_KEYS) assert.equal(gradeKeyForLevel(levelNumber(g)), g);
});

test('levelAccuracy totals across every recorded day', () => {
  const s = { gradeStats: {
    '2026-01-01': { 4: { correct: 8, wrong: 2 } },
    '2026-01-02': { 4: { correct: 6, wrong: 4 }, 5: { correct: 1, wrong: 0 } },
  }};
  assert.deepEqual(levelAccuracy(s, 4), { attempts: 20, correct: 14, wrong: 6, accuracy: 0.7 });
  assert.equal(levelAccuracy(s, 5).attempts, 1);
  assert.equal(levelAccuracy(s, 9), null);
  assert.equal(levelAccuracy({}, 4), null);
});

test('an untouched profile is pointed at the first level', () => {
  const rec = recommendLevel({});
  assert.equal(rec.gradeKey, 4);
  assert.equal(rec.reason, 'not-started');
  assert.match(recommendationText(rec), /new/i);
});

test('thin evidence asks for more practice rather than guessing', () => {
  const rec = recommendLevel(withStats({ 4: [3, 0] }));   // perfect, but only 3
  assert.equal(rec.gradeKey, 4);
  assert.equal(rec.reason, 'needs-more-evidence');
  assert.equal(rec.confidence, 'low');
});

test('comfortable at one level moves the suggestion up', () => {
  const rec = recommendLevel(withStats({ 4: [MIN_ATTEMPTS_FOR_SIGNAL, 0] }));
  assert.equal(rec.gradeKey, 5, 'should suggest the next level');
});

test('a struggling level holds the suggestion there', () => {
  const rec = recommendLevel(withStats({ 4: [3, 12] }));   // 20%
  assert.equal(rec.gradeKey, 4);
  assert.equal(rec.reason, 'struggling');
});

test('almost-comfortable is distinguished from struggling', () => {
  const rec = recommendLevel(withStats({ 4: [10, 5] }));   // ~67%
  assert.equal(rec.gradeKey, 4);
  assert.equal(rec.reason, 'still-practising');
  assert.ok(COMFORTABLE_ACCURACY > 0.67);
});

test('the recommendation never runs off the end of the levels', () => {
  const perfect = Object.fromEntries(GRADE_KEYS.map(g => [g, [40, 0]]));
  const s = { gradeStats: { '2026-01-01': Object.fromEntries(
    Object.entries(perfect).map(([g, [c, w]]) => [g, { correct: c, wrong: w }])) } };
  const rec = recommendLevel(s);
  assert.equal(rec.gradeKey, 10);
  assert.equal(rec.reason, 'all-levels-comfortable');
});

test('recommendation never depends on consecutive days', () => {
  // The same totals spread over two days a week apart, versus back to back,
  // must give the same answer. A child away for a week loses nothing.
  const backToBack = { gradeStats: {
    '2026-01-05': { 4: { correct: 10, wrong: 0 } },
    '2026-01-06': { 4: { correct: 10, wrong: 0 } } } };
  const weekApart = { gradeStats: {
    '2026-01-05': { 4: { correct: 10, wrong: 0 } },
    '2026-01-19': { 4: { correct: 10, wrong: 0 } } } };
  assert.deepEqual(recommendLevel(backToBack), recommendLevel(weekApart));
});

test('moons are read from earned achievements and never gate anything', () => {
  const s = { moons: { grade4: true, grade5: false } };
  assert.equal(hasMoon(s, 4), true);
  assert.equal(hasMoon(s, 5), false);
  assert.equal(hasMoon({}, 4), false);
  // A learner with no moon at all is still pointed somewhere reachable.
  assert.ok(GRADE_KEYS.includes(recommendLevel({}).gradeKey));
});

test('every recommendation reason has child-facing text', () => {
  for (const reason of ['not-started','needs-more-evidence','struggling',
                        'still-practising','all-levels-comfortable']) {
    const text = recommendationText({ reason });
    assert.ok(text && text.length > 5, `no text for ${reason}`);
    assert.doesNotMatch(text, /locked|unlock/i, 'must not talk about locks');
  }
});
