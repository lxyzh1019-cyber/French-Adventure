import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRADE_KEYS, levelNumber, gradeKeyForLevel, levelLabel, isLevelReachable,
  LEVEL_TIERS, openTierCount, highestReachableGrade, tierProgressDays, tierLabel,
  levelAccuracy, hasMoon, recommendLevel, recommendationText,
  MIN_ATTEMPTS_FOR_SIGNAL, COMFORTABLE_ACCURACY,
} from '../src/learning/levels.js';

// Build a state whose gradeStats give a level a known accuracy.
const withStats = (perGrade) => ({
  gradeStats: Object.fromEntries(Object.entries(perGrade).map(([g, [c, w]], i) =>
    [`2026-01-${String(i + 1).padStart(2, '0')}`, { [g]: { correct: c, wrong: w } }])),
});

test('levels open in tiers: L1+L2, then L3+L4, then L5+L6, then L7', () => {
  // Parent decision 2026-10-10: the level lock is back, in pairs.
  assert.deepEqual(LEVEL_TIERS, [[4, 5], [6, 7], [8, 9], [10]]);
  for (const g of [4, 5]) assert.equal(isLevelReachable(g, 1), true);
  for (const g of [6, 7, 8, 9, 10]) assert.equal(isLevelReachable(g, 1), false);
  for (const g of GRADE_KEYS) assert.equal(isLevelReachable(g, 4), true);
  assert.equal(highestReachableGrade(1), 5);
  assert.equal(highestReachableGrade(4), 10);
  assert.equal(tierLabel(0), 'L1+L2');
  assert.equal(tierLabel(3), 'L7');
});

// A day rule for the tests: a level qualifies on the days listed for it.
const daysRule = map => (state, day, g) => (map[g] || []).includes(day);
const withDays = days => ({ gradeStats: Object.fromEntries(days.map(d => [d, {}])) });

test('a tier opens when every level of the tier before it has qualified on 2 days — any 2 days', () => {
  // Any two days, never back-to-back days: the girls play once or twice a week.
  const s = withDays(['2026-10-01', '2026-10-08', '2026-10-15']);
  assert.equal(openTierCount(s, daysRule({ 4: ['2026-10-01', '2026-10-15'] })), 1, 'L2 has not qualified');
  assert.equal(openTierCount(s, daysRule({ 4: ['2026-10-01', '2026-10-15'], 5: ['2026-10-08'] })), 1, 'L2 has 1 of 2 days');
  assert.equal(openTierCount(s, daysRule({ 4: ['2026-10-01', '2026-10-15'], 5: ['2026-10-01', '2026-10-15'] })), 2);
});

test('tiers open one after another, never skipping', () => {
  const s = withDays(['a', 'b']);
  const all = daysRule({ 4: ['a', 'b'], 5: ['a', 'b'], 8: ['a', 'b'], 9: ['a', 'b'] });
  assert.equal(openTierCount(s, all), 2, 'L5+L6 records alone cannot open L7 while L3+L4 is unearned');
});

test('an opened tier stays open even when the records that earned it are cleared', () => {
  const none = () => false;
  assert.equal(openTierCount({ levelTiersOpen: 3 }, none), 3);
  assert.equal(openTierCount({}, none), 1, 'a new profile starts at L1+L2');
  assert.equal(openTierCount({ levelTiersOpen: 99 }, none), 4, 'never more tiers than exist');
});

test('the X/2 count on a locked tab is the fewest days among the levels before it', () => {
  const s = withDays(['a', 'b']);
  const rule = daysRule({ 4: ['a', 'b'], 5: ['a'] });
  assert.equal(tierProgressDays(s, 1, rule, 1), 1);
  assert.equal(tierProgressDays(s, 2, rule, 1), 0, 'tiers beyond the next show 0');
  assert.equal(tierProgressDays(s, 0, rule, 1), 2, 'an open tier is complete');
});

test('the suggestion never points at a locked level', () => {
  const comfortable = withStats({ 4: [20, 0], 5: [20, 0] });
  const rec = recommendLevel(comfortable, { maxGradeKey: 5 });
  assert.equal(rec.gradeKey, 5);
  assert.equal(rec.reason, 'earn-next-tier');
  assert.match(recommendationText(rec), /open new levels/);
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
