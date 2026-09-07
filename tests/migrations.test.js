import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateProfile, isCurrent } from '../src/state/migrations.js';
import { SCHEMA_VERSION, DEFAULT_STATE, GRADE_KEYS } from '../src/state/schema.js';

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
