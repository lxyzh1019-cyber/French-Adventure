import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateProfile, isCurrent } from '../src/state/migrations.js';
import { SCHEMA_VERSION, DEFAULT_STATE, GRADE_KEYS, makeRoundLogEntry } from '../src/state/schema.js';

const v0 = () => JSON.parse(readFileSync('tests/fixtures/profile-v0.json', 'utf8'));

test('a real pre-v1 profile keeps every earned thing', () => {
  // The whole point of this file. These records are two children's history and
  // the app has lost them before.
  const before = v0();
  const after = migrateProfile(before);

  assert.equal(after.totalStars, 1240);
  assert.equal(after.weekStars, 85);
  assert.equal(after.streak, 6);
  assert.equal(after.lastPlayed, 'Sat Sep 05 2026', 'lastPlayed must not be reformatted');
  assert.deepEqual(after.topicStars, before.topicStars);
  assert.equal(after.moons.grade4, true, 'an earned moon was revoked');
  assert.deepEqual(after.failedWords, before.failedWords);
  assert.deepEqual(after.playedDays, before.playedDays);
  assert.deepEqual(after.todayStats, before.todayStats);
  assert.deepEqual(after.dailyRounds, before.dailyRounds);
  assert.deepEqual(after.dailyTimeMs, before.dailyTimeMs);
  assert.deepEqual(after.gradeStats, before.gradeStats);
  assert.deepEqual(after.weeklyHistory, before.weeklyHistory);
  assert.equal(after.lastUpdatedAt, before.lastUpdatedAt);
  assert.equal(after.tier1Conquered, true);
});

test('migration is idempotent — twice equals once', () => {
  // Snapshots arrive repeatedly from the live listener. A migration that is not
  // idempotent corrupts the profile a little more on every delivery.
  const once = migrateProfile(v0());
  const twice = migrateProfile(once);
  const thrice = migrateProfile(twice);
  assert.deepEqual(twice, once);
  assert.deepEqual(thrice, once);
});

test('migration does not mutate its input', () => {
  const input = v0();
  const snapshot = JSON.parse(JSON.stringify(input));
  migrateProfile(input);
  assert.deepEqual(input, snapshot, 'the stored profile was modified in place');
});

test('a migrated profile is stamped current', () => {
  const after = migrateProfile(v0());
  assert.equal(after.schemaVersion, SCHEMA_VERSION);
  assert.equal(isCurrent(after), true);
  assert.equal(isCurrent(v0()), false);
});

test('missing shapes are filled without inventing progress', () => {
  const after = migrateProfile({ totalStars: 10 });
  for (const key of ['failedWords', 'playedDays', 'todayStats', 'dailyRounds',
                     'dailyTimeMs', 'gradeStats', 'gradeGameRounds', 'dailyTopicStats',
                     'topicStars', 'seedProfilePatches']) {
    assert.deepEqual(after[key], {}, `${key} should be an empty object`);
  }
  assert.deepEqual(after.weeklyHistory, []);
  assert.equal(after.totalStars, 10, 'existing progress was altered');
});

test('older profiles gain the newer levels without losing the old ones', () => {
  const after = migrateProfile(v0());
  for (const g of GRADE_KEYS) {
    assert.notEqual(after.moons['grade' + g], undefined, `moons.grade${g} missing`);
    assert.notEqual(after.gradeParentOpen[g], undefined, `gradeParentOpen.${g} missing`);
  }
  assert.equal(after.moons.grade4, true, 'the earned moon was overwritten by the default');
  assert.equal(after.gradeUnlocked[4], true);
  assert.equal(after.gradeUnlocked[5], true);
});

test('a corrupt record yields a usable default rather than throwing', () => {
  // The app must still open. The write barrier stops this default reaching the cloud.
  for (const bad of [null, undefined, 'nonsense', 42, []]) {
    const after = migrateProfile(bad);
    assert.equal(after.totalStars, 0);
    assert.equal(after.schemaVersion, SCHEMA_VERSION);
  }
});

test('a profile from a newer build is left alone, not coerced backwards', () => {
  // Downgrading would discard fields this build does not know about.
  const future = { ...DEFAULT_STATE(), schemaVersion: 99, totalStars: 5, futureField: 'keep me' };
  const after = migrateProfile(future);
  assert.equal(after.schemaVersion, 99);
  assert.equal(after.futureField, 'keep me');
  assert.equal(after.totalStars, 5);
});

test('parent settings are repaired but a real setting is respected', () => {
  const locked = migrateProfile({ parentSettings: { weekdayOpen: [true, false, true, true, true, true, false] } });
  assert.deepEqual(locked.parentSettings.weekdayOpen, [true, false, true, true, true, true, false]);

  const broken = migrateProfile({ parentSettings: { weekdayOpen: [true, false] } });
  assert.equal(broken.parentSettings.weekdayOpen.length, 7, 'a malformed week was not repaired');
});

test('unknown fields on a v0 profile survive', () => {
  // Never delete. Anything we do not recognise is somebody's data.
  const after = migrateProfile({ ...v0(), somethingOld: { a: 1 } });
  assert.deepEqual(after.somethingOld, { a: 1 });
});

test('v1 -> v2 adds an empty round ledger and nothing else', () => {
  const v1 = { ...v0(), schemaVersion: 1 };
  const after = migrateProfile(v1);
  assert.equal(after.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(after.roundLog, {});
  assert.equal(after.totalStars, 1240);
  assert.deepEqual(after.todayStats, v1.todayStats, 'day counters were rewritten');
  assert.deepEqual(migrateProfile(after), after, 'twice equals once');
});

test('v2 -> v3 labels existing ledger entries with how the round ended', () => {
  // Before v3 a round could end exactly two ways, and `completed` said which.
  // The backfill is therefore exact, not a guess.
  const v2 = {
    ...v0(),
    schemaVersion: 2,
    roundLog: {
      done:  { id: 'done',  day: '2026-09-05', type: 'quiz',  stars: 30, completed: 1 },
      ko:    { id: 'ko',    day: '2026-09-05', type: 'match', stars: 10, completed: 0 },
    },
  };
  const after = migrateProfile(v2);

  assert.equal(after.schemaVersion, 3);
  assert.equal(after.roundLog.done.outcome, 'completed');
  assert.equal(after.roundLog.ko.outcome, 'challengeFailed');
  assert.equal(after.roundLog.done.stars, 30, 'nothing else about the entry moved');
  assert.equal(after.roundLog.ko.completed, 0);
  assert.equal(Object.keys(after.roundLog).length, 2, 'no entry was dropped');

  assert.deepEqual(migrateProfile(after), after, 'twice equals once');
});

test('an entry that already carries an outcome is left alone', () => {
  const v3 = {
    ...v0(),
    schemaVersion: 3,
    roundLog: {
      left: { id: 'left', day: '2026-09-05', type: 'quiz', stars: 0,
              completed: 0, outcome: 'abandoned' },
    },
  };
  assert.equal(migrateProfile(v3).roundLog.left.outcome, 'abandoned',
    'a migration must not relabel an abandoned round as a knockout');
});

test('makeRoundLogEntry derives completed from the outcome, not the caller', () => {
  const mk = o => makeRoundLogEntry({
    id: 'x', day: '2026-09-08', type: 'quiz', grade: 4, stars: 5, outcome: o,
  });
  assert.equal(mk('completed').completed, 1);
  for (const o of ['challengeFailed', 'abandoned', 'interrupted', 'timedOut']) {
    assert.equal(mk(o).completed, 0, `${o} must not read as completed`);
    assert.equal(mk(o).outcome, o);
  }
});

test('an unknown outcome falls back to the completed flag rather than being stored', () => {
  // Defensive: a newer build could write an outcome this one does not know.
  const e = makeRoundLogEntry({
    id: 'x', day: '2026-09-08', type: 'quiz', grade: 4, outcome: 'somethingNew', completed: 1,
  });
  assert.equal(e.outcome, 'completed');
  assert.equal(e.completed, 1);
});
