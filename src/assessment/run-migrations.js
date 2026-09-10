// Forward-only, idempotent migrations for the assessment store.
//
// The same two rules as state/migrations.js, for the same reason:
//
//   1. NEVER DELETE. An assessment run is evidence about a child, collected
//      once under test conditions and not reproducible — a second sitting of
//      the same form is a different measurement, not a retake.
//   2. A store written by a NEWER build is left alone rather than coerced down.
//
// There is only one version so far. The file exists now, with its tests,
// because the first migration is the one most likely to be written in a hurry
// against real data.

import { ASSESSMENT_SCHEMA_VERSION, defaultAssessmentStore, newRun,
         RUN_STATUS, RUN_STATUS_RANK, SECTION_STATUS } from './run-model.js';

/** Ordered migrations. Index n takes a store from version n to n+1. */
const MIGRATIONS = [];

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

/**
 * Fill in anything a run is missing without inventing evidence.
 *
 * A partial run can reach us from a build that crashed mid-write or from a
 * hand-edited recovery file. Structure is repaired; responses, exposure and
 * review are only ever passed through.
 */
function normaliseRun(raw) {
  if (!isObj(raw)) return null;
  const base = newRun({
    runId: raw.run_id, learnerId: raw.learner_id, releaseId: raw.release_id,
    form: raw.form, sectionOrder: Array.isArray(raw.section_order) ? raw.section_order : [],
    contentSha: isObj(raw.content_sha) ? raw.content_sha : {},
    deviceId: raw.device_id_started,
    startedAtUtc: raw.started_at_utc, startedDayKey: raw.started_day_key,
  });

  const out = { ...base, ...raw };

  // Structural fields that must be the right shape for the merge to work.
  out.section_order = Array.isArray(raw.section_order) ? [...raw.section_order] : base.section_order;
  out.content_sha = isObj(raw.content_sha) ? { ...raw.content_sha } : {};
  out.exposure = isObj(raw.exposure) ? { ...raw.exposure } : {};
  out.responses = isObj(raw.responses) ? { ...raw.responses } : {};
  out.review = isObj(raw.review) ? { ...raw.review } : {};
  out.status = RUN_STATUS_RANK[raw.status] === undefined ? RUN_STATUS.IN_PROGRESS : raw.status;

  const sections = {};
  for (const d of out.section_order) {
    const s = isObj(raw.sections?.[d]) ? raw.sections[d] : {};
    sections[d] = {
      ...base.sections[d],
      ...s,
      plan: Array.isArray(s.plan) ? [...s.plan] : [],
      administered_tiers: Array.isArray(s.administered_tiers) ? [...s.administered_tiers] : [],
      sitting_ids: Array.isArray(s.sitting_ids) ? [...s.sitting_ids] : [],
      status: Object.values(SECTION_STATUS).includes(s.status) ? s.status : SECTION_STATUS.NOT_STARTED,
    };
  }
  // A section keyed outside section_order is somebody's data too. Keep it.
  for (const [d, s] of Object.entries(isObj(raw.sections) ? raw.sections : {})) {
    if (!sections[d] && isObj(s)) sections[d] = s;
  }
  out.sections = sections;

  // `report` is derived. If an older build ever stored one, drop it here rather
  // than let it become a merge input — this is the one exception to never
  // delete, and it removes nothing that cannot be recomputed from the responses.
  delete out.report;

  return out;
}

/** Bring a stored assessment store up to the current version. */
export function migrateAssessmentStore(raw) {
  if (!isObj(raw)) return defaultAssessmentStore();

  let store = { ...defaultAssessmentStore(raw.learner_id), ...raw };
  const stated = Number(raw.assessmentSchemaVersion) || 0;

  // Version 1 is the first released shape; there is no v0 to migrate from. An
  // unversioned store therefore did not come from an earlier build — it is a
  // fresh one, or a hand-written recovery file — so it is normalised below and
  // stamped current rather than left at 0, where a later `Math.max` would pin
  // it below the current version for ever and no future migration would run.
  let version = stated || ASSESSMENT_SCHEMA_VERSION;

  while (version < ASSESSMENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;              // no path forward; leave as-is rather than guess
    store = step(store);
    version = Number(store.assessmentSchemaVersion) || version + 1;
  }

  const runs = {};
  for (const [id, run] of Object.entries(isObj(raw.runs) ? raw.runs : {})) {
    const r = normaliseRun(run);
    if (r) runs[id] = r;
  }
  store.runs = runs;

  // A store written by a newer build keeps its own version number.
  store.assessmentSchemaVersion = Math.max(version, stated);
  return store;
}

/** True when a store is already at the current version. */
export function isCurrentAssessmentStore(store) {
  return Number(store?.assessmentSchemaVersion) >= ASSESSMENT_SCHEMA_VERSION;
}
