import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProfiles } from '../src/state/merge.js';
import { migrateProfile } from '../src/state/migrations.js';
import { DEFAULT_STATE } from '../src/state/schema.js';

const profile = (over = {}) => migrateProfile({ ...DEFAULT_STATE(), ...over });

// A learner who has done some work, as a starting point for both devices.
const baseline = () => profile({
  totalStars: 1000, weekStars: 40, streak: 5,
  topicStars: { '4_colours': 2 },
  moons: { grade4: false, grade5: false },
  playedDays: { '2026-09-01': true },
  todayStats: { '2026-09-01': { correct: 10, wrong: 2, rounds: 1, stars: 40 } },
  gradeStats: { '2026-09-01': { 4: { correct: 10, wrong: 2 } } },
  lastUpdatedAt: 1000,
});

test('merge is commutative — order of arrival does not matter', () => {
  // Snapshots arrive in an unpredictable order. If order changed the result,
  // the two iPads would converge on different profiles.
  const a = profile({ totalStars: 1200, topicStars: { '4_colours': 3, '4_numbers': 1 },
    todayStats: { '2026-09-05': { stars: 30, correct: 8, wrong: 1, rounds: 1 } },
    playedDays: { '2026-09-05': true }, lastUpdatedAt: 5000 });
  const b = profile({ totalStars: 1150, topicStars: { '4_colours': 1, '5_body': 2 },
    todayStats: { '2026-09-06': { stars: 20, correct: 5, wrong: 0, rounds: 1 } },
    playedDays: { '2026-09-06': true }, lastUpdatedAt: 6000 });

  assert.deepEqual(mergeProfiles(a, b), mergeProfiles(b, a));
});

test('merge is idempotent — redelivery changes nothing', () => {
  const a = baseline();
  const once = mergeProfiles(a, a);
  assert.deepEqual(once, mergeProfiles(once, once));
  assert.equal(once.totalStars, a.totalStars, 'merging a profile with itself inflated it');
});

test('merge is monotonic — nothing a learner earned goes backwards', () => {
  const a = profile({ totalStars: 1200, weekStars: 90, streak: 7,
    topicStars: { '4_colours': 3 }, moons: { grade4: true } });
  const b = profile({ totalStars: 300, weekStars: 10, streak: 1,
    topicStars: { '4_colours': 1 }, moons: { grade4: false } });

  for (const m of [mergeProfiles(a, b), mergeProfiles(b, a)]) {
    assert.ok(m.totalStars >= 1200, 'stars decreased');
    assert.ok(m.weekStars >= 90, 'week stars decreased');
    assert.ok(m.streak >= 7, 'streak decreased');
    assert.equal(m.topicStars['4_colours'], 3, 'topic star decreased');
    assert.equal(m.moons.grade4, true, 'an earned moon was revoked');
  }
});

test('two iPads used offline: BOTH rounds survive', () => {
  // The acceptance proof. Each device starts from the same 1000 stars and plays
  // one round offline. Taking the max would silently drop the smaller session.
  const start = baseline();

  const iPadA = profile({ ...start,
    totalStars: 1030, weekStars: 70,
    todayStats: { ...start.todayStats, '2026-09-05': { correct: 9, wrong: 1, rounds: 1, stars: 30 } },
    playedDays: { ...start.playedDays, '2026-09-05': true },
    dailyRounds: { '2026-09-05': { quiz: 1 } },
    lastUpdatedAt: 5000 });

  const iPadB = profile({ ...start,
    totalStars: 1020, weekStars: 60,
    todayStats: { ...start.todayStats, '2026-09-06': { correct: 6, wrong: 0, rounds: 1, stars: 20 } },
    playedDays: { ...start.playedDays, '2026-09-06': true },
    dailyRounds: { '2026-09-06': { match: 1 } },
    lastUpdatedAt: 6000 });

  const m = mergeProfiles(iPadA, iPadB);

  // Both days' evidence is present.
  assert.ok(m.todayStats['2026-09-05'], "iPad A's round was lost");
  assert.ok(m.todayStats['2026-09-06'], "iPad B's round was lost");
  assert.equal(m.playedDays['2026-09-05'], true);
  assert.equal(m.playedDays['2026-09-06'], true);
  assert.deepEqual(m.dailyRounds['2026-09-05'], { quiz: 1 });
  assert.deepEqual(m.dailyRounds['2026-09-06'], { match: 1 });

  // And both sessions' points are counted, not just the larger one.
  // 1000 before + 30 + 20 = 1050. A max would have given 1030.
  assert.equal(m.totalStars, 1050,
    `expected both sessions to count (1050), got ${m.totalStars}`);
});

test('the same day recorded on both devices takes the fuller record', () => {
  // A day's counters only grow, so the larger value is the more complete one.
  const a = profile({ todayStats: { '2026-09-05': { correct: 10, wrong: 2, rounds: 2, stars: 50 } } });
  const b = profile({ todayStats: { '2026-09-05': { correct: 6, wrong: 1, rounds: 1, stars: 30 } } });
  const m = mergeProfiles(a, b);
  assert.deepEqual(m.todayStats['2026-09-05'], { correct: 10, wrong: 2, rounds: 2, stars: 50 });
});

test('nested per-level and per-topic records merge rather than replace', () => {
  const a = profile({
    gradeStats: { '2026-09-05': { 4: { correct: 10, wrong: 1 } } },
    dailyTopicStats: { '2026-09-05': { '4_colours': { quiz: { c: 5, w: 0 } } } } });
  const b = profile({
    gradeStats: { '2026-09-05': { 5: { correct: 8, wrong: 2 } } },
    dailyTopicStats: { '2026-09-05': { '4_numbers': { match: { c: 3, w: 1 } } } } });
  const m = mergeProfiles(a, b);

  assert.deepEqual(m.gradeStats['2026-09-05'][4], { correct: 10, wrong: 1 });
  assert.deepEqual(m.gradeStats['2026-09-05'][5], { correct: 8, wrong: 2 });
  assert.ok(m.dailyTopicStats['2026-09-05']['4_colours']);
  assert.ok(m.dailyTopicStats['2026-09-05']['4_numbers']);
});

test('weekly history is deduped by week and keeps the fuller entry', () => {
  const a = profile({ weeklyHistory: [
    { weekStart: '2026-08-24', stars: 300, rounds: 8 },
    { weekStart: '2026-08-31', stars: 100, rounds: 2 } ] });
  const b = profile({ weeklyHistory: [
    { weekStart: '2026-08-31', stars: 180, rounds: 5 },   // fuller record of the same week
    { weekStart: '2026-09-07', stars: 50, rounds: 1 } ] });
  const m = mergeProfiles(a, b);

  assert.equal(m.weeklyHistory.length, 3, 'weeks were duplicated or dropped');
  const week = m.weeklyHistory.find(w => w.weekStart === '2026-08-31');
  assert.equal(week.stars, 180, 'the thinner record of a week won');
  assert.deepEqual(m.weeklyHistory.map(w => w.weekStart),
    ['2026-08-24', '2026-08-31', '2026-09-07'], 'history is not in order');
});

test('weekly history stays capped at 8 weeks', () => {
  const weeks = n => Array.from({ length: n }, (_, i) => ({
    weekStart: `2026-01-${String(i + 1).padStart(2, '0')}`, stars: 10 }));
  const m = mergeProfiles(profile({ weeklyHistory: weeks(6) }),
                          profile({ weeklyHistory: weeks(12) }));
  assert.equal(m.weeklyHistory.length, 8);
});

test('the practice queue keeps words either device is still working on', () => {
  const a = profile({ failedWords: {
    chien: { fr: 'chien', en: 'dog', misses: 2, lastFailed: '2026-09-01' } } });
  const b = profile({ failedWords: {
    chien: { fr: 'chien', en: 'dog', misses: 5, lastFailed: '2026-09-05' },
    chat: { fr: 'chat', en: 'cat', misses: 1, lastFailed: '2026-09-05' } } });
  const m = mergeProfiles(a, b);

  assert.equal(m.failedWords.chien.misses, 5);
  assert.equal(m.failedWords.chien.lastFailed, '2026-09-05');
  assert.ok(m.failedWords.chat, 'a word only one device knew about was dropped');
});

test('levels visited on either device count as visited', () => {
  const m = mergeProfiles(
    profile({ gradeUnlocked: { 4: true, 5: true, 6: false } }),
    profile({ gradeUnlocked: { 4: true, 5: false, 6: true } }));
  assert.equal(m.gradeUnlocked[5], true);
  assert.equal(m.gradeUnlocked[6], true);
});

test('settings take the more recently written side, explicitly', () => {
  // Settings are the one group where combining is meaningless — a weekday is
  // open or closed. This is a real last-writer-wins choice, not an accident.
  const older = profile({ lastUpdatedAt: 1000,
    parentSettings: { weekdayOpen: [true, true, true, true, true, true, true] } });
  const newer = profile({ lastUpdatedAt: 9000,
    parentSettings: { weekdayOpen: [false, false, false, false, false, false, false] } });

  assert.deepEqual(mergeProfiles(older, newer).parentSettings.weekdayOpen,
                   newer.parentSettings.weekdayOpen);
  assert.deepEqual(mergeProfiles(newer, older).parentSettings.weekdayOpen,
                   newer.parentSettings.weekdayOpen);
});

test('merging with nothing returns the side that exists', () => {
  const a = baseline();
  assert.deepEqual(mergeProfiles(a, null), { ...a });
  assert.deepEqual(mergeProfiles(null, a), { ...a });
  assert.equal(mergeProfiles(null, null), null);
});

test('a blank profile can never reduce a populated one', () => {
  // The shape of the original data-loss bug, at the merge layer.
  const populated = baseline();
  const blank = profile({});
  for (const m of [mergeProfiles(populated, blank), mergeProfiles(blank, populated)]) {
    assert.equal(m.totalStars, 1000);
    assert.equal(m.streak, 5);
    assert.deepEqual(m.playedDays, populated.playedDays);
  }
});

test('a profile with nothing in it is recognised as having no progress', async () => {
  const { hasAnyProgress } = await import('../src/state/schema.js');
  assert.equal(hasAnyProgress(null), false);
  assert.equal(hasAnyProgress(DEFAULT_STATE()), false);
  assert.equal(hasAnyProgress(profile({})), false);

  // Any real evidence counts.
  assert.equal(hasAnyProgress(profile({ totalStars: 1 })), true);
  assert.equal(hasAnyProgress(profile({ streak: 1 })), true);
  assert.equal(hasAnyProgress(profile({ playedDays: { '2026-09-05': true } })), true);
  assert.equal(hasAnyProgress(profile({ topicStars: { '4_colours': 1 } })), true);
  assert.equal(hasAnyProgress(profile({ moons: { grade4: true } })), true);
  assert.equal(hasAnyProgress(profile({ weeklyHistory: [{ weekStart: '2026-01-05' }] })), true);
  assert.equal(hasAnyProgress(profile({ failedWords: { chien: { fr: 'chien' } } })), true);
});
