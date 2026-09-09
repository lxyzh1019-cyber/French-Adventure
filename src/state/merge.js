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
import { weekStartOf } from '../util/dates.js';

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

// ── The round ledger ────────────────────────────────────────────────────────
//
// Day counters cannot be reconciled on their own. If iPad A and iPad B both
// start from a 40-star day and each add a round, A says 70 and B says 60, and
// nothing in those two numbers says whether the extra 30 and 20 are the same
// round or different ones. Taking the larger value silently drops one round —
// which is what used to happen whenever both girls' iPads were used on the
// same day between syncs.
//
// `roundLog` records each finished round under its own id, so the union of two
// ledgers is exact. Each counter is then rebuilt as
//
//     base + (sum of the merged ledger)
//
// where `base` is whatever a side holds that its own ledger does not account
// for: rounds from before the ledger existed, or evidence that is not logged
// per round (My Words drills, an unfinished round's answers). Both sides share
// that history, so it is counted once, by taking the larger of the two.

/** Union two ledgers. Same id from both sides is the same round. */
function mergeRoundLog(a = {}, b = {}) {
  return unionBy(a, b, (x, y) => {
    // The same attempt id can appear on both sides in two states: a marker
    // written when the round was abandoned, interrupted or timed out, and the
    // real entry written if the learner came back and finished it. The finished
    // one is the truth, whatever the star counts say — a marker carries none.
    const xc = num(x?.completed), yc = num(y?.completed);
    if (xc !== yc) return xc > yc ? x : y;
    return num(x?.stars) >= num(y?.stars) ? x : y;
  });
}

/**
 * Fold a ledger into per-day aggregates shaped like the counters they explain:
 *   { [day]: { stars, correct, wrong, rounds,
 *              types:  { [type]: completedCount },
 *              grades: { [grade]: { correct, wrong } },
 *              gradeRounds: { [grade]: { [type]: completedCount } },
 *              topics: { [topicKey]: { [type]: { c, w } } } } }
 */
export function summarizeRoundLog(log = {}) {
  const days = {};
  for (const e of Object.values(log || {})) {
    if (!e || !e.day) continue;
    const d = days[e.day] ||= { stars: 0, correct: 0, wrong: 0, rounds: 0,
                                types: {}, grades: {}, gradeRounds: {}, topics: {} };
    d.stars += num(e.stars); d.correct += num(e.correct); d.wrong += num(e.wrong);
    if (e.completed) {
      d.rounds += 1;
      d.types[e.type] = num(d.types[e.type]) + 1;
      const gr = d.gradeRounds[e.grade] ||= {};
      gr[e.type] = num(gr[e.type]) + 1;
    }
    for (const [g, t] of Object.entries(e.grades || {})) {
      const gs = d.grades[g] ||= { correct: 0, wrong: 0 };
      gs.correct += num(t?.c); gs.wrong += num(t?.w);
    }
    for (const [tk, t] of Object.entries(e.topics || {})) {
      const ts = (d.topics[tk] ||= {})[e.type] ||= { c: 0, w: 0 };
      ts.c += num(t?.c); ts.w += num(t?.w);
    }
  }
  return days;
}

/** base + merged ledger, where base is the larger unexplained remainder. */
function ledgered(aVal, bVal, aLog, bLog, mLog) {
  const base = Math.max(num(aVal) - num(aLog), num(bVal) - num(bLog), 0);
  return base + num(mLog);
}

/**
 * Merge every day-keyed counter, reconciling through the ledger wherever the
 * ledger explains the counter, and by the old "larger value" rule elsewhere
 * (dailyTimeMs, drill flags, and any day neither ledger knows about).
 */
function mergeDayCounters(a, b, merged, aAgg, bAgg, mAgg) {
  const get = (o, ...path) => path.reduce((v, k) => (v == null ? undefined : v[k]), o);
  const days = new Set([
    ...Object.keys(aAgg), ...Object.keys(bAgg), ...Object.keys(mAgg),
  ]);

  // todayStats: stars / correct / wrong / rounds
  for (const day of days) {
    const ad = get(a, 'todayStats', day), bd = get(b, 'todayStats', day);
    const md = merged.todayStats[day] = { ...(merged.todayStats[day] || {}) };
    for (const f of ['correct', 'wrong', 'rounds', 'stars']) {
      md[f] = ledgered(ad?.[f], bd?.[f], get(aAgg, day, f), get(bAgg, day, f), get(mAgg, day, f));
    }
  }

  // dailyRounds: flat "{day}_{type}" keys, one count per format.
  for (const day of days) {
    const types = new Set([
      ...Object.keys(get(aAgg, day, 'types') || {}), ...Object.keys(get(bAgg, day, 'types') || {}),
      ...Object.keys(get(mAgg, day, 'types') || {}),
    ]);
    for (const t of types) {
      const k = day + '_' + t;
      merged.dailyRounds[k] = ledgered(get(a, 'dailyRounds', k), get(b, 'dailyRounds', k),
        get(aAgg, day, 'types', t), get(bAgg, day, 'types', t), get(mAgg, day, 'types', t));
    }
  }

  // gradeStats: per level correct / wrong
  for (const day of days) {
    const grades = new Set([
      ...Object.keys(get(aAgg, day, 'grades') || {}), ...Object.keys(get(bAgg, day, 'grades') || {}),
      ...Object.keys(get(mAgg, day, 'grades') || {}),
    ]);
    for (const g of grades) {
      const md = (merged.gradeStats[day] ||= {});
      md[g] = { ...(md[g] || {}) };
      for (const f of ['correct', 'wrong']) {
        md[g][f] = ledgered(get(a, 'gradeStats', day, g, f), get(b, 'gradeStats', day, g, f),
          get(aAgg, day, 'grades', g, f), get(bAgg, day, 'grades', g, f), get(mAgg, day, 'grades', g, f));
      }
    }
  }

  // gradeGameRounds: per level, per format, completed count
  for (const day of days) {
    for (const [g, byType] of Object.entries({ ...get(aAgg, day, 'gradeRounds'), ...get(bAgg, day, 'gradeRounds'), ...get(mAgg, day, 'gradeRounds') })) {
      const types = new Set([
        ...Object.keys(get(aAgg, day, 'gradeRounds', g) || {}), ...Object.keys(get(bAgg, day, 'gradeRounds', g) || {}),
        ...Object.keys(get(mAgg, day, 'gradeRounds', g) || {}),
      ]);
      const md = ((merged.gradeGameRounds[day] ||= {})[g] ||= {});
      for (const t of types) {
        md[t] = ledgered(get(a, 'gradeGameRounds', day, g, t), get(b, 'gradeGameRounds', day, g, t),
          get(aAgg, day, 'gradeRounds', g, t), get(bAgg, day, 'gradeRounds', g, t), get(mAgg, day, 'gradeRounds', g, t));
      }
      void byType;
    }
  }

  // dailyTopicStats: per topic, per format, c / w — the source of topic stars.
  for (const day of days) {
    const topics = new Set([
      ...Object.keys(get(aAgg, day, 'topics') || {}), ...Object.keys(get(bAgg, day, 'topics') || {}),
      ...Object.keys(get(mAgg, day, 'topics') || {}),
    ]);
    for (const tk of topics) {
      const types = new Set([
        ...Object.keys(get(aAgg, day, 'topics', tk) || {}), ...Object.keys(get(bAgg, day, 'topics', tk) || {}),
        ...Object.keys(get(mAgg, day, 'topics', tk) || {}),
      ]);
      const md = ((merged.dailyTopicStats[day] ||= {})[tk] ||= {});
      for (const t of types) {
        md[t] = { ...(md[t] || {}) };
        for (const f of ['c', 'w']) {
          md[t][f] = ledgered(get(a, 'dailyTopicStats', day, tk, t, f), get(b, 'dailyTopicStats', day, tk, t, f),
            get(aAgg, day, 'topics', tk, t, f), get(bAgg, day, 'topics', tk, t, f), get(mAgg, day, 'topics', tk, t, f));
        }
      }
    }
  }
}

/**
 * Reconstruct a star counter that two devices both advanced independently.
 *
 * Taking the max would silently drop the smaller side's work: 1240 + 30 offline
 * on one iPad and 1240 + 20 on the other should be 1290, not 1270. The per-day
 * ledger in todayStats — itself reconciled through roundLog above — records
 * what each side actually earned, so the merged ledger gives the true total.
 * The max is kept as a floor because that ledger only goes back as far as
 * todayStats does — older history predates it.
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

/**
 * Week stars, the same way: the days of the current week in todayStats are
 * the ledger. Only a side whose weekStart matches the merged week can hold an
 * unexplained remainder for it — the other side's weekStars belong to an
 * earlier week that has since been archived.
 */
function mergeWeekStars(a, b, merged) {
  const ws = merged.weekStart;
  const weekSum = p => {
    let t = 0;
    for (const [day, d] of Object.entries(p?.todayStats || {})) {
      if (ws && weekStartOf(day) === ws) t += num(d?.stars);
    }
    return t;
  };
  const remainder = p => (p?.weekStart === ws || !p?.weekStart ? num(p?.weekStars) - weekSum(p) : 0);
  const base = Math.max(remainder(a), remainder(b), 0);
  const floor = (a?.weekStart === b?.weekStart) ? Math.max(num(a?.weekStars), num(b?.weekStars)) : 0;
  return Math.max(floor, base + weekSum(merged));
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

  // Then let the ledger correct every counter it can explain.
  merged.roundLog = mergeRoundLog(a.roundLog, b.roundLog);
  mergeDayCounters(a, b, merged,
    summarizeRoundLog(a.roundLog), summarizeRoundLog(b.roundLog), summarizeRoundLog(merged.roundLog));

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

  // Latest wins for "when did this last happen" fields.
  merged.lastUpdatedAt = Math.max(num(a.lastUpdatedAt), num(b.lastUpdatedAt));
  merged.lastPlayed = [a.lastPlayed, b.lastPlayed].filter(Boolean).sort().pop() ?? null;
  merged.weekStart = [a.weekStart, b.weekStart].filter(Boolean).sort().pop() ?? null;

  merged.totalStars = mergeStarTotal(a, b, merged, 'totalStars', 'todayStats', d => d?.stars);
  merged.weekStars = mergeWeekStars(a, b, merged);
  merged.streak = Math.max(num(a.streak), num(b.streak));
  merged.lastDrillComplete =
    [a.lastDrillComplete, b.lastDrillComplete].filter(Boolean).sort().pop() ?? null;

  // Settings: genuine last-writer-wins, stated rather than implied.
  const newer = num(a.lastUpdatedAt) >= num(b.lastUpdatedAt) ? a : b;
  merged.parentSettings = newer.parentSettings ?? a.parentSettings ?? b.parentSettings;

  merged.schemaVersion = Math.max(num(a.schemaVersion), num(b.schemaVersion));
  return merged;
}
