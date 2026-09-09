// Restoring a backup: what restoreFromBackup does to a profile.
//
// The button used to run
//     state[player] = Object.assign({}, DEFAULT_STATE(), restoredData)
// which had two faults. It never migrated, so a backup of any age was handed
// to code that assumes the current shape; and it *replaced* rather than
// merged, so restoring an older backup discarded whatever the device had done
// since. Whole-profile replacement is exactly the failure mode M1 removed from
// sync, and a recovery tool is the worst place to leave it.
//
// These tests pin the composition the app now performs:
//     mergeProfiles(migrateProfile(current), migrateProfile(restored))

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeProfiles } from '../src/state/merge.js';
import { migrateProfile } from '../src/state/migrations.js';
import { SCHEMA_VERSION, DEFAULT_STATE, makeRoundLogEntry } from '../src/state/schema.js';

/** Exactly what restoreFromBackup now does, minus the DOM and the network. */
const restore = (current, backup) =>
  mergeProfiles(migrateProfile(current), migrateProfile(backup));

const v0Backup = () => JSON.parse(readFileSync('tests/fixtures/profile-v0.json', 'utf8'));

/** A v1 profile: versioned, but from before the round ledger existed. */
const v1Backup = () => {
  const { roundLog, ...rest } = DEFAULT_STATE();
  return {
    ...rest,
    schemaVersion: 1,
    totalStars: 800,
    weekStars: 30,
    topicStars: { '4_colours': 3, '5_body': 2 },
    moons: { grade4: true, grade5: false },
    playedDays: { '2026-09-01': true },
    todayStats: { '2026-09-01': { correct: 8, wrong: 1, rounds: 1, stars: 30 } },
    lastUpdatedAt: 500,
  };
};

test('a v1 backup restores as a current-version profile', () => {
  const out = restore(DEFAULT_STATE(), v1Backup());
  assert.equal(out.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(out.roundLog, {}, 'v1 predates the ledger, so it starts empty');
  assert.equal(out.totalStars, 800);
  assert.equal(out.topicStars['4_colours'], 3);
  assert.equal(out.moons.grade4, true, 'an earned moon survives the restore');
});

test('a v0 backup restores as a current-version profile with its history intact', () => {
  const out = restore(DEFAULT_STATE(), v0Backup());
  assert.equal(out.schemaVersion, SCHEMA_VERSION);
  assert.equal(out.totalStars, 1240, 'the number the girls actually earned');
  assert.ok(out.roundLog && typeof out.roundLog === 'object');
});

test('restoring does not discard what the device has done since the backup', () => {
  // The regression that matters. Backup taken last week, played today,
  // then restored. Under the old replace-the-profile code today vanished.
  const today = '2026-09-08';
  const current = migrateProfile({
    ...DEFAULT_STATE(),
    totalStars: 1000,
    topicStars: { '4_colours': 2, '4_animals': 1 },
    moons: { grade4: false, grade5: true },
    todayStats: { [today]: { correct: 5, wrong: 1, rounds: 1, stars: 25 } },
    roundLog: {
      'att-today': makeRoundLogEntry({
        attemptId: 'att-today', day: today, grade: 4, type: 'quiz',
        stars: 25, correct: 5, wrong: 1, completed: 1,
      }),
    },
    lastUpdatedAt: 9000,
  });

  const out = restore(current, v1Backup());

  assert.ok(out.totalStars >= 1000, `today's stars survived (got ${out.totalStars})`);
  assert.equal(out.topicStars['4_animals'], 1, "a topic star only the device had");
  assert.equal(out.topicStars['5_body'], 2, 'a topic star only the backup had');
  assert.equal(out.topicStars['4_colours'], 3, 'the larger of the two is kept');
  assert.equal(out.moons.grade4, true, 'moon from the backup');
  assert.equal(out.moons.grade5, true, 'moon from the device');
  assert.ok(out.roundLog['att-today'], "today's round is still in the ledger");
});

test('restoring the same backup twice changes nothing the second time', () => {
  // The parent can press Restore again; the second press must be a no-op.
  const once = restore(DEFAULT_STATE(), v1Backup());
  const twice = restore(once, v1Backup());
  assert.deepEqual({ ...twice, lastUpdatedAt: 0 }, { ...once, lastUpdatedAt: 0 });
});
