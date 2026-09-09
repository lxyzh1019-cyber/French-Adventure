// The shape of an assessment run, and the defaults every field falls back to.
//
// This is deliberately NOT part of the learner profile in state/schema.js.
// window.fbSave writes the profile with setDoc, which is a full document
// replace, so folding runs into it would rewrite a child's entire history once
// per autosaved response — 45 replaces per run of the very record M1 exists to
// protect. Assessment data lives in its own document, its own localStorage key,
// and its own version line.
//
// Every field name in RESPONSE_STORAGE_FIELDS comes from
// assessment_rules.json → administration.response_storage. The contract is a
// list of names, so a test can iterate the release's own list and assert the
// record carries each one, rather than a human keeping two lists in step.

/** Bumped whenever a migration is needed. See run-migrations.js. */
export const ASSESSMENT_SCHEMA_VERSION = 1;

/**
 * How a run stands. Ranked, because two devices can hold the same run in
 * different states and the merge has to settle it without a clock: a parent's
 * invalidation always wins, and a device that saw the run finish knows more
 * than one that only saw it start.
 */
export const RUN_STATUS = {
  IN_PROGRESS: 'in_progress',
  ABANDONED: 'abandoned',
  COMPLETE: 'complete',
  PARENT_INVALIDATED: 'parent_invalidated',
};

export const RUN_STATUS_RANK = {
  [RUN_STATUS.IN_PROGRESS]: 0,
  [RUN_STATUS.ABANDONED]: 1,
  [RUN_STATUS.COMPLETE]: 2,
  [RUN_STATUS.PARENT_INVALIDATED]: 3,
};

export const SECTION_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'complete',
};

/** assessment_rules.json → invalidity.reasons, verbatim. */
export const INVALID_REASONS = [
  'audio_failed',
  'microphone_failed',
  'app_interrupted_before_submit',
  'input_control_failed',
  'parent_invalidated',
  'wrong_item_rendered',
];

/** assessment_rules.json → administration.response_storage, verbatim. */
export const RESPONSE_STORAGE_FIELDS = [
  'item_id',
  'item_version',
  'form',
  'raw_response',
  'selected_choice_ids',
  'response_started_at_utc',
  'response_submitted_at_utc',
  'response_time_ms',
  'audio_play_count',
  'support_flag',
  'technical_invalid_reason',
  'scorer_id',
  'rubric_version',
];

const str = v => (v == null ? null : String(v));
const num = v => Number(v) || 0;

/**
 * Run ids must not collide between two offline iPads, so they carry randomness
 * rather than being derived from the clock alone.
 */
export function newRunId() {
  return 'run_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** The key a response is stored under. See newResponse for attempt_index. */
export function responseKey(itemId, attemptIndex = 0) {
  return `${itemId}#${num(attemptIndex)}`;
}

export function defaultAssessmentStore(learnerId = null) {
  return {
    assessmentSchemaVersion: ASSESSMENT_SCHEMA_VERSION,
    learner_id: str(learnerId),
    runs: {},
    lastUpdatedAt: 0,
  };
}

export function newSection(domain, { entryTier = null, entryCount = 0 } = {}) {
  return {
    domain: String(domain),
    status: SECTION_STATUS.NOT_STARTED,
    entry_tier: str(entryTier),
    entry_count: num(entryCount),
    // The exact order administered. Append-only: an item that has been shown
    // cannot be un-shown, so the plan only ever grows.
    plan: [],
    administered_tiers: [],
    // Frozen once written. Routing is a pure function of the entry responses,
    // so two devices agree unless they hold different subsets of them — and
    // routed_at_utc is what makes that disagreement resolvable.
    routing_decision: null,
    routed_at_utc: null,
    started_at_utc: null,
    completed_at_utc: null,
    sitting_ids: [],
  };
}

export function newRun({
  runId = newRunId(), learnerId, releaseId, form,
  sectionOrder = [], contentSha = {}, deviceId = null,
  startedAtUtc = Date.now(), startedDayKey = null,
} = {}) {
  const sections = {};
  for (const d of sectionOrder) sections[d] = newSection(d);
  return {
    run_id: String(runId),
    learner_id: str(learnerId),
    release_id: str(releaseId),
    form: str(form),
    // Frozen at run start. If the release is amended mid-run, the responses
    // still say which bytes they were collected against.
    content_sha: { ...contentSha },
    device_id_started: str(deviceId),
    started_at_utc: num(startedAtUtc),
    started_day_key: str(startedDayKey),
    status: RUN_STATUS.IN_PROGRESS,
    status_at_utc: num(startedAtUtc),
    invalidated_reason: null,
    invalidated_by: null,
    // pause_resume.parent_invalidation: an invalidated attempt is kept and a
    // linked replacement created, never deleted.
    replacement_of_run_id: null,
    section_order: [...sectionOrder],
    sections,
    // administration.exposure: every item shown, answered or not.
    exposure: {},
    responses: {},
    review: {},
    // `report` is DERIVED and deliberately absent. Storing it would make a
    // computed value a merge input, and two devices could then disagree about
    // a number neither of them measured.
  };
}

/**
 * One response.
 *
 * `attempt_index` is above zero only for a replay the rules permit — a
 * playback that produced no audible output may be repeated without consuming an
 * allowed play (replay.technical_replay). It is part of the key so a permitted
 * retry does not overwrite the record of what went wrong the first time.
 */
export function newResponse({
  itemId, itemVersion = 1, form, domain = null, difficultyTier = null,
  attemptIndex = 0, deviceId = null,
} = {}) {
  return {
    // ── assessment_rules.json → administration.response_storage ──
    item_id: str(itemId),
    item_version: num(itemVersion),
    form: str(form),
    raw_response: null,
    selected_choice_ids: [],
    response_started_at_utc: null,
    response_submitted_at_utc: null,
    response_time_ms: null,
    audio_play_count: 0,
    support_flag: false,
    technical_invalid_reason: null,
    scorer_id: null,
    rubric_version: null,

    // ── required elsewhere in the rules, or by the merge ──
    attempt_index: num(attemptIndex),
    // Denormalised so a report never has to re-open the item bank to know which
    // domain and tier a response belongs to.
    domain: str(domain),
    difficulty_tier: str(difficultyTier),
    // replay.play_count_definition counts a playback once it passes 500 ms, and
    // a playback that produced nothing may be repeated without consuming one.
    // The count alone cannot express that, so the events are kept.
    playback_events: [],
    replacement_for_item_id: null,
    replaced_by_item_id: null,
    // Speaking audio stays on the device that recorded it; only the handle and
    // its metadata sync. Firestore documents cap at 1 MiB and no storage bucket
    // is configured, and §3.6 forbids storing raw child audio by default.
    audio_ref: null,
    audio_device_id: null,
    audio_duration_ms: null,
    audio_mime: null,
    // scoring.pronunciation: a device transcript is an observation. It is never
    // an input to a score, which is why it does not live under raw_response.
    transcript_observation: null,
    voice_requested_locale: null,
    voice_resolved_locale: null,
    voice_name: null,
    device_id: str(deviceId),
    written_at_ms: 0,
  };
}

/**
 * A human's rubric scoring of one open response.
 *
 * scorer_id is required by rubrics.json → scorer_requirement, and the app
 * refuses a review without one: an unattributed rubric score is indistinguishable
 * from a machine-generated one, which the rules forbid for these domains.
 */
export function newReview({
  itemId, attemptIndex = 0, scorerId, rubricId, rubricVersion = 1,
  scores = {}, reviewedAtUtc = Date.now(), deviceId = null, note = null,
} = {}) {
  return {
    item_id: str(itemId),
    attempt_index: num(attemptIndex),
    scorer_id: str(scorerId),
    rubric_id: str(rubricId),
    rubric_version: num(rubricVersion),
    scores: { ...scores },
    reviewed_at_utc: num(reviewedAtUtc),
    reviewed_by_device_id: str(deviceId),
    note: str(note),
    invalidated: false,
    invalidated_reason: null,
  };
}
