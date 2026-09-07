// The shape of a learner profile, and the defaults every field falls back to.
//
// Storage keys for levels stay 4..10 even though the UI shows Level 1..7. An app
// level is not a school grade; the keys are just where the records already live.

import { getWeekStart } from '../util/dates.js';

/** Bumped whenever a migration is needed. See migrations.js. */
export const SCHEMA_VERSION = 1;

export const GRADE_KEYS = [4, 5, 6, 7, 8, 9, 10];
export const MAX_PLAYABLE_GRADE = 10;

export function defaultParentSettings() {
  // Sun–Sat, false = locked (test day)
  return { weekdayOpen: [true, true, true, true, true, true, true] };
}

export function defaultGradeUnlocked() {
  const o = {};
  for (const g of GRADE_KEYS) o[g] = (g === 4);
  return o;
}

export function defaultGradeParentOpen() {
  const o = {};
  for (const g of GRADE_KEYS) o[g] = false;
  o[4] = true;
  return o;
}

export function defaultMoons() {
  const o = { super: false };
  for (const g of GRADE_KEYS) o['grade' + g] = false;
  return o;
}

export function clampGradeUnlocks(o) {
  if (!o) return;
  for (let g = MAX_PLAYABLE_GRADE + 1; g <= 10; g++) o[g] = false;
}

export const DEFAULT_STATE = () => ({
  schemaVersion: SCHEMA_VERSION,
  totalStars: 0, weekStars: 0, streak: 0, lastPlayed: null,
  weekStart: getWeekStart(), topicStars: {}, dailyRounds: {},
  moons: defaultMoons(),
  failedWords: {}, playedDays: {}, todayStats: {},
  dailyTimeMs: {}, lastDrillComplete: null,
  parentSettings: defaultParentSettings(),
  gradeUnlocked: defaultGradeUnlocked(), gradeStats: {}, gradeGameRounds: {}, dailyTopicStats: {},
  gradeParentOpen: defaultGradeParentOpen(),
  tier1Conquered: false, tier2Conquered: false, tier3Conquered: false,
  tier1ParentOpen: false, tier2ParentOpen: false, tier3ParentOpen: false,
  seedProfilePatches: {},
  lastUpdatedAt: 0,
});

// Field groups the merge and migration logic both need to know about.
// Keyed by date (YYYY-MM-DD) with values that only ever grow within a day.
export const DAY_KEYED_FIELDS = [
  'todayStats', 'playedDays', 'dailyRounds', 'dailyTimeMs',
  'gradeStats', 'gradeGameRounds', 'dailyTopicStats',
];

/** Plain objects that must exist rather than be undefined. */
export const REQUIRED_MAPS = [
  ...DAY_KEYED_FIELDS, 'topicStars', 'failedWords', 'seedProfilePatches',
];

/**
 * Has this learner actually done anything?
 *
 * Used to decide whether a profile is worth writing to the cloud at all. A
 * learner who has never played has nothing to save, and creating an empty
 * document for her only produces something a later bug could mistake for real
 * data. The first write happens when she earns something.
 */
export function hasAnyProgress(profile) {
  if (!profile) return false;
  if (Number(profile.totalStars) > 0 || Number(profile.weekStars) > 0
      || Number(profile.streak) > 0) return true;
  for (const field of [...DAY_KEYED_FIELDS, 'topicStars', 'failedWords']) {
    if (Object.keys(profile[field] || {}).length) return true;
  }
  if ((profile.weeklyHistory || []).length) return true;
  return Object.values(profile.moons || {}).some(Boolean);
}
