// Forward-only, idempotent profile migrations.
//
// Every profile that arrives from Firestore or localStorage goes through here
// before the app touches it. Two rules govern this file:
//
//   1. NEVER DELETE. A field that no longer fits the model is moved under
//      `legacy`, not dropped. These records are two children's history and the
//      app has lost them before.
//   2. Running twice must equal running once. Snapshots arrive repeatedly from
//      the live listener, so a migration that is not idempotent corrupts data a
//      little more on every delivery.

import {
  SCHEMA_VERSION, DEFAULT_STATE, GRADE_KEYS, REQUIRED_MAPS,
  defaultGradeUnlocked, defaultGradeParentOpen, defaultMoons,
  defaultParentSettings, clampGradeUnlocks, ROUND_OUTCOME } from './schema.js';

/** Fields that were once written but are no longer part of the model. */
const RETIRED_FIELDS = [];

/**
 * v0 -> v1
 *
 * v0 is "any profile written before schemaVersion existed". The work is
 * normalising shapes that older builds could leave missing or partial — the
 * same wall of `if (!x) x = {}` that used to sit inline in applyPlayerData,
 * where it ran on every snapshot and was impossible to test.
 */
function toV1(profile) {
  const out = { ...profile };

  for (const key of REQUIRED_MAPS) {
    if (!out[key] || typeof out[key] !== 'object') out[key] = {};
  }
  if (!Array.isArray(out.weeklyHistory)) out.weeklyHistory = [];
  if (!Number.isFinite(Number(out.lastUpdatedAt))) out.lastUpdatedAt = 0;

  // Levels. gradeUnlocked is now a record of levels visited, not a gate.
  if (!out.gradeUnlocked || typeof out.gradeUnlocked !== 'object') {
    out.gradeUnlocked = defaultGradeUnlocked();
  }
  clampGradeUnlocks(out.gradeUnlocked);

  if (!out.gradeParentOpen || typeof out.gradeParentOpen !== 'object') {
    out.gradeParentOpen = defaultGradeParentOpen();
  }
  for (const g of GRADE_KEYS) {
    if (out.gradeParentOpen[g] === undefined) out.gradeParentOpen[g] = false;
  }

  // Moons. Older profiles predate grades 6-10, so fill the gaps without ever
  // clearing one that was earned — a moon is an achievement, not a status.
  out.moons = Object.assign(defaultMoons(), out.moons || {});

  // Legacy tier flags. Retained because they are still written, but nothing
  // consults them now that levels are ungated.
  for (const f of ['tier1Conquered', 'tier2Conquered', 'tier3Conquered',
                   'tier1ParentOpen', 'tier2ParentOpen', 'tier3ParentOpen']) {
    if (out[f] === undefined) out[f] = false;
  }

  out.parentSettings = Object.assign(defaultParentSettings(), out.parentSettings || {});
  if (!Array.isArray(out.parentSettings.weekdayOpen) ||
      out.parentSettings.weekdayOpen.length !== 7) {
    out.parentSettings.weekdayOpen = defaultParentSettings().weekdayOpen;
  }

  // Anything retired is preserved rather than deleted.
  for (const f of RETIRED_FIELDS) {
    if (out[f] !== undefined) {
      out.legacy = out.legacy || {};
      out.legacy[f] = out[f];
      delete out[f];
    }
  }

  out.schemaVersion = 1;
  return out;
}

/**
 * v1 -> v2
 *
 * Adds the round ledger (`roundLog`). Nothing is rewritten: rounds played
 * before the ledger existed stay in the day counters and are treated by the
 * merge as history both devices already share. Only rounds finished from now
 * on carry their own record.
 */
function toV2(profile) {
  const out = { ...profile };
  if (!out.roundLog || typeof out.roundLog !== 'object' || Array.isArray(out.roundLog)) {
    out.roundLog = {};
  }
  out.schemaVersion = 2;
  return out;
}

/**
 * v2 → v3.
 *
 * Adds `outcome` to every round-ledger entry. Before this version a round could
 * only end two ways — every question answered, or out of lives — so `completed`
 * carried the whole story and the backfill is exact rather than a guess.
 * Nothing else changes; no entry is dropped or rewritten.
 */
function toV3(profile) {
  const out = { ...profile };
  const log = {};
  for (const [id, e] of Object.entries(out.roundLog || {})) {
    log[id] = (e && typeof e === 'object' && !e.outcome)
      ? { ...e, outcome: e.completed ? ROUND_OUTCOME.COMPLETED : ROUND_OUTCOME.CHALLENGE_FAILED }
      : e;
  }
  out.roundLog = log;
  out.schemaVersion = 3;
  return out;
}

/** Ordered migrations. Index n takes a profile from version n to n+1. */
const MIGRATIONS = [toV1, toV2, toV3];

/**
 * Bring a stored profile up to the current schema.
 *
 * Missing/unknown input yields a fresh default profile rather than throwing —
 * a corrupt record must not stop the app from opening, and the write barrier in
 * saveState stops that default from being written anywhere.
 */
export function migrateProfile(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_STATE();

  let profile = { ...DEFAULT_STATE(), ...raw };
  let version = Number(raw.schemaVersion) || 0;

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;                 // no path forward; leave as-is rather than guess
    profile = step(profile);
    version = Number(profile.schemaVersion) || version + 1;
  }

  // A profile written by a NEWER build than this one is left untouched. Coercing
  // it down would discard fields this build does not know about.
  profile.schemaVersion = Math.max(version, Number(raw.schemaVersion) || 0);
  return profile;
}

/** True when a profile is already at the current version. */
export function isCurrent(profile) {
  return Number(profile?.schemaVersion) >= SCHEMA_VERSION;
}
