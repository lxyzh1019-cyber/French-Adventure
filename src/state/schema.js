// The shape of a learner profile, and the defaults every field falls back to.
//
// Storage keys for levels stay 4..10 even though the UI shows Level 1..7. An app
// level is not a school grade; the keys are just where the records already live.

import { getWeekStart } from '../util/dates.js';

/** Bumped whenever a migration is needed. See migrations.js. */
export const SCHEMA_VERSION = 3;

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
  roundLog: {},
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
  ...DAY_KEYED_FIELDS, 'topicStars', 'failedWords', 'seedProfilePatches', 'roundLog',
];

/**
 * One immutable record per finished round, keyed by the round's attempt id.
 *
 * This is the ledger the two-device merge reasons from. The per-day counters
 * above can only say how big a day was, not which rounds made it up, so when
 * both iPads add a round on the same day the counters cannot be reconciled —
 * the merge has to choose one. A round record carries its own identity, so the
 * union of two ledgers is exact however many times it is redelivered.
 *
 *   { id, day, type, grade, stars, correct, wrong, completed,
 *     grades: { [grade]: { c, w } }, topics: { [topicKey]: { c, w } }, at }
 *
 * `completed` is 1 only when every question was answered; a knockout still
 * keeps its stars but does not count as a round. `grades` and `topics` hold the
 * per-level and per-topic tallies exactly as the round added them to
 * gradeStats and dailyTopicStats, so those can be reconciled the same way.
 */
/**
 * How a round ended. Only COMPLETED counts towards format completion, the daily
 * round cap and the day's round tally; the rest are recorded so that starting a
 * round and walking away is distinguishable from never starting one, and from
 * finishing it.
 */
export const ROUND_OUTCOME = {
  COMPLETED:        'completed',        // every question answered
  CHALLENGE_FAILED: 'challengeFailed',  // ran out of lives
  ABANDONED:        'abandoned',        // learner left deliberately
  INTERRUPTED:      'interrupted',      // app closed, tab evicted, screen lock
  TIMED_OUT:        'timedOut',         // session limit reached
};

const OUTCOMES = new Set(Object.values(ROUND_OUTCOME));

/** Only a genuinely completed round counts towards completion and caps. */
export function countsAsCompletion(outcome) {
  return outcome === ROUND_OUTCOME.COMPLETED;
}

export function makeRoundLogEntry({ id, day, type, grade, stars, correct, wrong,
                                    outcome, completed, grades, topics, at }) {
  const tally = (m = {}) => {
    const out = {};
    for (const [k, v] of Object.entries(m || {})) {
      out[k] = { c: Number(v?.c) || 0, w: Number(v?.w) || 0 };
    }
    return out;
  };
  return {
    id: String(id), day: String(day), type: String(type || ''), grade: Number(grade) || 0,
    stars: Number(stars) || 0, correct: Number(correct) || 0, wrong: Number(wrong) || 0,
    // `outcome` is the record; `completed` is derived from it and kept because
    // every reader and the merge already speak in terms of it. Entries written
    // before outcomes existed carry only `completed`, so fall back to it.
    outcome: OUTCOMES.has(outcome)
      ? outcome
      : (completed ? ROUND_OUTCOME.COMPLETED : ROUND_OUTCOME.CHALLENGE_FAILED),
    completed: (OUTCOMES.has(outcome) ? countsAsCompletion(outcome) : !!completed) ? 1 : 0,
    grades: tally(grades), topics: tally(topics),
    at: Number(at) || 0,
  };
}

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
