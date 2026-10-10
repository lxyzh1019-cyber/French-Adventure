// Learner levels.
//
// Levels open in tiers: L1+L2, then L3+L4, then L5+L6, then L7 (parent
// decision, 2026-10-10, restoring the April design). The next tier opens when
// every level in the tier before it has qualified on two practice days — any
// two days, never back-to-back days, because the girls play once or twice a
// week. A day qualifies for a level when every topic of that level reached
// three stars that day and the level's accuracy that day was at least 95%.
//
// A tier that has opened stays open. The count is stored (levelTiersOpen) so
// clearing old days cannot close it again, and it is also re-derived from the
// records, so a tier earned on the other iPad opens here too.
//
// Inside the open tiers the app still *recommends* where to work next, from
// demonstrated accuracy.
//
// Levels are deliberately not called grades. An app level is not a school
// grade, and the app must never imply that it is. Storage keys stay 4..10 so
// existing records keep working.

export const FIRST_GRADE_KEY = 4;
export const LAST_GRADE_KEY  = 10;
export const GRADE_KEYS = [4, 5, 6, 7, 8, 9, 10];

/** Display number for a storage key: 4 -> 1, 10 -> 7. */
export function levelNumber(gradeKey) {
  return Number(gradeKey) - FIRST_GRADE_KEY + 1;
}

/** Storage key for a display number: 1 -> 4. */
export function gradeKeyForLevel(levelNo) {
  return Number(levelNo) + FIRST_GRADE_KEY - 1;
}

/** Child-facing label. Never "Grade N" — an app level is not a school grade. */
export function levelLabel(gradeKey) {
  return 'Level ' + levelNumber(gradeKey);
}

export const LEVEL_TIERS = [[4, 5], [6, 7], [8, 9], [10]];
export const TIER_QUALIFY_DAYS = 2;
export const TIER_QUALIFY_ACCURACY = 0.95;

/** Index of the tier a level belongs to, or -1. */
export function tierIndexOf(gradeKey) {
  return LEVEL_TIERS.findIndex(t => t.includes(Number(gradeKey)));
}

/** Child-facing tier name: "L1+L2", "L7". */
export function tierLabel(tierIdx) {
  return (LEVEL_TIERS[tierIdx] || []).map(g => 'L' + levelNumber(g)).join('+');
}

/** How many recorded days qualify for a level, by the caller's day rule. */
export function qualifyingDayCount(state, gradeKey, qualifiesOn) {
  const days = new Set([
    ...Object.keys(state?.dailyTopicStats || {}),
    ...Object.keys(state?.gradeStats || {}),
  ]);
  let n = 0;
  for (const day of days) if (qualifiesOn(state, day, gradeKey)) n++;
  return n;
}

/**
 * How many tiers are open: the stored count, raised by what the records now
 * show. It never goes down. The first tier is always open.
 */
export function openTierCount(state, qualifiesOn) {
  let open = Math.max(1, Math.min(LEVEL_TIERS.length, Number(state?.levelTiersOpen) || 1));
  while (open < LEVEL_TIERS.length &&
         LEVEL_TIERS[open - 1].every(g => qualifyingDayCount(state, g, qualifiesOn) >= TIER_QUALIFY_DAYS)) {
    open++;
  }
  return open;
}

/** True when a level sits in an open tier. */
export function isLevelReachable(gradeKey, openTiers = 1) {
  const i = tierIndexOf(gradeKey);
  return i >= 0 && i < openTiers;
}

/** Highest level a learner can play with this many tiers open. */
export function highestReachableGrade(openTiers = 1) {
  const t = LEVEL_TIERS[Math.max(0, Math.min(LEVEL_TIERS.length, openTiers) - 1)];
  return t[t.length - 1];
}

/**
 * Days done toward opening a tier, 0..2: the fewest among the levels of the
 * tier before it. Open tiers show 2; tiers beyond the next one show 0.
 */
export function tierProgressDays(state, tierIdx, qualifiesOn, openTiers) {
  if (tierIdx < openTiers) return TIER_QUALIFY_DAYS;
  if (tierIdx !== openTiers) return 0;
  return Math.min(TIER_QUALIFY_DAYS,
    ...LEVEL_TIERS[tierIdx - 1].map(g => qualifyingDayCount(state, g, qualifiesOn)));
}

// How much evidence before a recommendation is worth making, and the accuracy
// at which a level looks comfortable. Pilot values: transparent, tunable, and
// deliberately not presented as anything more scientific than that.
export const MIN_ATTEMPTS_FOR_SIGNAL = 12;
export const COMFORTABLE_ACCURACY    = 0.8;
export const STRUGGLING_ACCURACY     = 0.5;

/**
 * Total attempts and accuracy for one level, across all recorded days.
 * Returns null when there is not enough evidence to say anything.
 */
export function levelAccuracy(state, gradeKey) {
  const byDay = state?.gradeStats || {};
  let correct = 0, wrong = 0;
  for (const day of Object.values(byDay)) {
    const g = day?.[gradeKey];
    if (!g) continue;
    correct += g.correct || 0;
    wrong   += g.wrong   || 0;
  }
  const attempts = correct + wrong;
  if (!attempts) return null;
  return { attempts, correct, wrong, accuracy: correct / attempts };
}

/** True when a level has been fully starred — the moon. Purely an achievement. */
export function hasMoon(state, gradeKey) {
  return !!state?.moons?.['grade' + gradeKey];
}

/**
 * Which level to suggest working on next, and why.
 *
 * Walks up from the first level while the evidence says the learner is
 * comfortable, and stops at the first level that is either untried or not yet
 * comfortable. No calendar streaks, no consecutive-day requirement.
 */
export function recommendLevel(state, { maxGradeKey = LAST_GRADE_KEY } = {}) {
  let lastComfortable = null;

  for (const key of GRADE_KEYS.filter(k => k <= maxGradeKey)) {
    const stats = levelAccuracy(state, key);

    if (!stats || stats.attempts < MIN_ATTEMPTS_FOR_SIGNAL) {
      return {
        gradeKey: key,
        reason: stats ? 'needs-more-evidence' : 'not-started',
        confidence: 'low',
        stats,
      };
    }
    if (stats.accuracy < STRUGGLING_ACCURACY) {
      return { gradeKey: key, reason: 'struggling', confidence: 'high', stats };
    }
    if (stats.accuracy < COMFORTABLE_ACCURACY) {
      return { gradeKey: key, reason: 'still-practising', confidence: 'high', stats };
    }
    lastComfortable = key;
  }

  // Comfortable on every open level, but more levels are still locked: stay on
  // the top open level and say how the next ones open.
  if (maxGradeKey < LAST_GRADE_KEY) {
    return {
      gradeKey: maxGradeKey,
      reason: 'earn-next-tier',
      confidence: 'high',
      stats: levelAccuracy(state, maxGradeKey),
    };
  }

  // Comfortable everywhere: stay at the top level rather than inventing one.
  return {
    gradeKey: LAST_GRADE_KEY,
    reason: 'all-levels-comfortable',
    confidence: 'high',
    stats: levelAccuracy(state, lastComfortable ?? LAST_GRADE_KEY),
  };
}

/** Short, encouraging explanation of a recommendation, for the child. */
export function recommendationText(rec) {
  switch (rec.reason) {
    case 'not-started':          return 'Start here — this one is new!';
    case 'needs-more-evidence':  return 'Keep going here so we can see how it feels.';
    case 'struggling':           return "Let's practise this one a bit more.";
    case 'still-practising':     return 'Almost there — a little more practice!';
    case 'all-levels-comfortable': return "You're doing brilliantly at every level!";
    case 'earn-next-tier':       return 'Earn a 🌙 here on 2 days to open new levels!';
    default:                     return 'Try this one next.';
  }
}
