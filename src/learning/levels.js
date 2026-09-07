// Learner levels.
//
// This replaces a gate that made the app's own content unreachable. To open the
// next level a learner had to earn a full moon on the current one AND, on two
// *consecutive calendar days*, play all six game types and score at least 95%
// each day. At one or two twenty-minute sessions a week that is not achievable,
// so a Grade 5 child starting at the default was permanently confined to the
// grade 4 material with no available path out.
//
// Every level is now reachable at any time. Instead of gating, the app
// *recommends* where to work next, from demonstrated accuracy rather than from
// calendar streaks — a child who is away for a week loses nothing.
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

/** Every level is always reachable. Kept as a function so callers read clearly. */
export function isLevelReachable() {
  return true;
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
export function recommendLevel(state) {
  let lastComfortable = null;

  for (const key of GRADE_KEYS) {
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
    default:                     return 'Try this one next.';
  }
}
