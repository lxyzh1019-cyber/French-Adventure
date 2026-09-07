// Merging two versions of the same learner profile.
//
// Sync used to pick a winner and throw the loser away: `scoreProgressRichness`
// guessed which of the local and remote profiles "looked" richer, and then
// `Object.assign({}, defaults, winner)` replaced the whole thing. If both iPads
// were used between syncs, one child's session simply vanished.
//
// This merges instead. The rules below are chosen so the result does not depend
// on which side is called "a" and which "b", and so nothing a learner earned can
// go backwards:
//
//   commutative — merge(a, b) equals merge(b, a)
//   idempotent  — merge(a, a) equals a
//   monotonic   — no counter is ever lower than it was in either input
//
// Those three properties are tested. They matter because snapshots arrive in an
// unpredictable order and are frequently redelivered.

import { DAY_KEYED_FIELDS, GRADE_KEYS, defaultMoons } from './schema.js';

const num = v => Number(v) || 0;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

/** Union two maps, resolving a key present on both with `resolve`. */
function unionBy(a = {}, b = {}, resolve) {
  const out = { ...a };
  for (const [k, bv] of Object.entries(b || {})) {
    out[k] = (k in out) ? resolve(out[k], bv) : bv;
  }
  return out;
}

/**
 * Merge one day's record. A given day's counters only ever grow, so the larger
 * value is the more complete one. Nested shapes (per level, per topic, per game
 * type) recurse; booleans OR; anything else prefers a truthy value.
 */
function mergeDayEntry(a, b) {
  if (a === b) return a;
  if (typeof a === 'number' || typeof b === 'number') return Math.max(num(a), num(b));
  if (typeof a === 'boolean' || typeof b === 'boolean') return !!a || !!b;
  if (isObj(a) && isObj(b)) return unionBy(a, b, mergeDayEntry);
  return a ?? b;
}

/**
 * Sum the per-day totals of a field, so a counter can be rebuilt from the
 * merged ledger rather than guessed at.
 */
function sumDaily(profile, field, pick) {
  let total = 0;
  for (const day of Object.values(profile?.[field] || {})) total += num(pick(day));
  return total;
}

/**
 * Reconstruct a star counter that two devices both advanced independently.
 *
 * Taking the max would silently drop the smaller side's work: 1240 + 30 offline
 * on one iPad and 1240 + 20 on the other should be 1290, not 1270. The per-day
 * ledger in todayStats records what each side actually earned, so the merged
 * ledger gives the true total. The max is kept as a floor because that ledger
 * only goes back as far as todayStats does — older history predates it.
 */
function mergeStarTotal(a, b, merged, field, dayField, pick) {
  const floor = Math.max(num(a?.[field]), num(b?.[field]));
  const ledgerA = sumDaily(a, dayField, pick);
  const ledgerB = sumDaily(b, dayField, pick);
  const ledgerMerged = sumDaily(merged, dayField, pick);

  // What each side holds that its own ledger cannot account for: history from
  // before the ledger existed. Both sides share it, so count it once.
  const preLedger = Math.max(num(a?.[field]) - ledgerA, num(b?.[field]) - ledgerB, 0);
  return Math.max(floor, preLedger + ledgerMerged);
}

/** Deduplicate archived weeks, preferring the fuller record for a given week. */
function mergeWeeklyHistory(a = [], b = [], cap = 8) {
  const byWeek = new Map();
  for (const entry of [...(a || []), ...(b || [])]) {
    if (!entry || !entry.weekStart) continue;
    const existing = byWeek.get(entry.weekStart);
    if (!existing) { byWeek.set(entry.weekStart, entry); continue; }
    // Same week from both sides: keep whichever recorded more.
    byWeek.set(entry.weekStart,
      num(entry.stars) + num(entry.rounds) > num(existing.stars) + num(existing.rounds)
        ? entry : existing);
  }
  return [...byWeek.values()]
    .sort((x, y) => String(x.weekStart).localeCompare(String(y.weekStart)))
    .slice(-cap);
}

/** Merge the practice queue: a word either side is still working on stays. */
function mergeFailedWords(a = {}, b = {}) {
  return unionBy(a, b, (x, y) => ({
    ...x, ...y,
    misses: Math.max(num(x.misses), num(y.misses)),
    lastFailed: [x.lastFailed, y.lastFailed].filter(Boolean).sort().pop() ?? null,
  }));
}

/**
 * Merge two profiles for the same learner.
 *
 * Settings are the one field group where "combine" is meaningless — a weekday
 * is open or closed, and the two sides can genuinely disagree. Those take the
 * more recently written side, which is a real last-writer-wins choice rather
 * than an accident of ordering.
 */
export function mergeProfiles(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };

  const merged = { ...a, ...b };

  for (const field of DAY_KEYED_FIELDS) {
    merged[field] = unionBy(a[field], b[field], mergeDayEntry);
  }

  merged.topicStars = unionBy(a.topicStars, b.topicStars, (x, y) => Math.max(num(x), num(y)));

  // A moon is an achievement. Once either side has it, it is earned.
  merged.moons = defaultMoons();
  for (const key of Object.keys(merged.moons)) {
    merged.moons[key] = !!(a.moons?.[key] || b.moons?.[key]);
  }

  // Levels visited on either device count as visited.
  merged.gradeUnlocked = {};
  for (const g of GRADE_KEYS) {
    merged.gradeUnlocked[g] = !!(a.gradeUnlocked?.[g] || b.gradeUnlocked?.[g]);
  }

  merged.weeklyHistory = mergeWeeklyHistory(a.weeklyHistory, b.weeklyHistory);
  merged.failedWords = mergeFailedWords(a.failedWords, b.failedWords);
  merged.seedProfilePatches = { ...(a.seedProfilePatches || {}), ...(b.seedProfilePatches || {}) };

  merged.totalStars = mergeStarTotal(a, b, merged, 'totalStars', 'todayStats', d => d?.stars);
  merged.weekStars = Math.max(num(a.weekStars), num(b.weekStars));
  merged.streak = Math.max(num(a.streak), num(b.streak));

  // Latest wins for "when did this last happen" fields.
  merged.lastUpdatedAt = Math.max(num(a.lastUpdatedAt), num(b.lastUpdatedAt));
  merged.lastPlayed = [a.lastPlayed, b.lastPlayed].filter(Boolean).sort().pop() ?? null;
  merged.weekStart = [a.weekStart, b.weekStart].filter(Boolean).sort().pop() ?? null;
  merged.lastDrillComplete =
    [a.lastDrillComplete, b.lastDrillComplete].filter(Boolean).sort().pop() ?? null;

  // Settings: genuine last-writer-wins, stated rather than implied.
  const newer = num(a.lastUpdatedAt) >= num(b.lastUpdatedAt) ? a : b;
  merged.parentSettings = newer.parentSettings ?? a.parentSettings ?? b.parentSettings;

  merged.schemaVersion = Math.max(num(a.schemaVersion), num(b.schemaVersion));
  return merged;
}
