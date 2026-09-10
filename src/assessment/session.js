// Administering a run: what to ask next, and when a section may begin or end.
//
// Pure. No DOM, no storage, no clock of its own — every function takes what it
// needs and returns the next state, so each rule in assessment_rules.json can be
// tested as a rule rather than through a browser.
//
// The plan for a section is built in two stages, because that is what the rules
// describe: an entry block is administered first, and only once the whole block
// is submitted does routing decide what follows. Nothing is chosen at random and
// nothing is generated — every item comes from the bank, in the order the bank
// lists it (objective_routing.invariant).

import {
  RUN_STATUS, SECTION_STATUS, newRun, newRunId, responseKey, newResponse,
} from './run-model.js';
import { assignFirstForm, alternateForm, routeAfterEntry, scoreObjective } from './scoring.js';
import * as content from './content.js';

const num = v => Number(v) || 0;

/** Sitting ids group the items answered in one sitting-down. */
export function newSittingId() {
  return 'sit_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

/**
 * Which form this learner should see.
 *
 * administration.first_form names jenn and jess explicitly; anyone else is
 * hashed. administration.reassessment then alternates, and refuses to repeat a
 * form within 60 days unless the previous attempt gathered fewer than three
 * valid scored items in every domain.
 */
export function chooseForm(learnerId, priorRuns = [], opts = {}) {
  return planNextAttempt(learnerId, priorRuns, opts).form;
}

/** Every item id this learner has ever been shown, across all their runs. */
export function exposedItemIds(runs = [], { excludeRunId = null } = {}) {
  const seen = new Set();
  for (const run of runs) {
    if (!run || run.run_id === excludeRunId) continue;
    for (const id of Object.keys(run.exposure || {})) seen.add(id);
  }
  return seen;
}

/** Valid, independent, scored responses per domain — administration.reassessment. */
export function validIndependentByDomain(run) {
  const per = {};
  for (const r of Object.values(run?.responses || {})) {
    if (r.technical_invalid_reason) continue;       // invalid: no evidence either way
    if (r.support_flag) continue;                   // supported: not independent
    const scored = r.scored_correct !== undefined || r.rubric_scored === true;
    if (!scored) continue;
    per[r.domain] = (per[r.domain] || 0) + 1;
  }
  return per;
}

/** True when every domain of a terminal attempt gathered fewer than three. */
export function barelyUsed(run) {
  const per = validIndependentByDomain(run);
  return Object.values(per).every(n => n < 3);
}

/**
 * How much fresh evidence a form could still yield, per domain.
 *
 * Exposure is permanent and this bank has no spares — invalidity.replacement
 * can never fire against it — so an exposed item is not swapped out, it is
 * re-shown and simply cannot count as fresh independent evidence. The estimate
 * is therefore the *worst* routing path rather than the best: routing depends on
 * how the learner performs, which is unknown before the attempt, and a form that
 * only sometimes yields enough is a form that will sometimes waste a sitting.
 */
export function freshEvidenceByDomain(form, exposed = new Set()) {
  const out = {};
  const fresh = its => its.filter(i => !exposed.has(i.id) && !content.needsUnbuiltAsset(i)).length;

  for (const domain of content.SECTION_ORDER) {
    const minimum = num(content.minimumEvidenceFor(domain));
    const routing = content.routingFor(domain);

    let available;
    if (!routing) {
      // Open sections administer every prompt in listed order.
      available = fresh(content.itemsFor({ form, domain }));
    } else {
      const entry = content.itemsFor({ form, domain, tier: routing.entry_tier })
        .slice(0, routing.entry_count);
      const foundation = content.itemsFor({ form, domain, tier: 'foundation' })
        .filter(i => !entry.includes(i));
      const stretch = content.itemsFor({ form, domain, tier: 'stretch' })
        .filter(i => !entry.includes(i));
      // Routing goes to [foundation], [foundation, stretch] or [stretch]; the
      // guaranteed floor is the entry block plus the smaller single tier.
      available = fresh(entry) + Math.min(fresh(foundation), fresh(stretch));
    }
    out[domain] = { available, minimum, sufficient: available >= minimum };
  }
  return out;
}

/**
 * Which form the next attempt should use, and whether it can measure anything.
 *
 * The order is the content owner's:
 *   1. A paused, resumable attempt is resumed — that is not a reassessment at
 *      all, and startRun handles it before this function is reached.
 *   2. A new attempt within 60 days normally alternates.
 *   3. The same form may be reused only when every domain of the previous
 *      terminal attempt gathered fewer than three valid independent scored
 *      responses AND enough unexposed items remain in it.
 *   4. Otherwise the alternate.
 *   5. If neither form can supply enough fresh evidence, say so rather than
 *      quietly counting repeated items as new.
 */
export function planNextAttempt(learnerId, priorRuns = [], { now = Date.now(), releaseId = content.RELEASE_ID } = {}) {
  const first = assignFirstForm(learnerId, releaseId);
  const terminal = priorRuns
    .filter(r => r && r.status !== RUN_STATUS.PARENT_INVALIDATED && r.status !== RUN_STATUS.IN_PROGRESS)
    .sort((a, b) => num(b.started_at_utc) - num(a.started_at_utc));

  if (!terminal.length) {
    return { form: first, reason: 'first_attempt', ...verdict(first, priorRuns) };
  }

  const last = terminal[0];
  const alternate = alternateForm(last.form) || first;
  const withinWindow = (now - num(last.started_at_utc)) / 86400000 < 60;

  // The exception is permission to reuse, not an instruction to. It applies
  // only if the form can still supply enough unexposed evidence.
  if (withinWindow && barelyUsed(last)) {
    const same = verdict(last.form, priorRuns);
    if (same.sufficient) return { form: last.form, reason: 'reuse_barely_used_form', ...same };
  }

  const alt = verdict(alternate, priorRuns);
  if (alt.sufficient) return { form: alternate, reason: 'alternate_form', ...alt };

  const same = verdict(last.form, priorRuns);
  if (same.sufficient) return { form: last.form, reason: 'alternate_exhausted', ...same };

  // Neither can measure. Say so; do not present repeats as fresh.
  return {
    form: alternate,
    reason: 'insufficient_fresh_evidence',
    ...alt,
    alternativeChecked: last.form,
  };
}

/**
 * Can this form still measure, given what this learner has already seen?
 *
 * Two different shortfalls have to be told apart, or one masks the other.
 *
 * A domain that cannot reach its minimum even on a pristine form is a gap in
 * the content, not in what is left of it — today speaking is exactly that: five
 * prompts of which two are asset briefs that must not be rendered, against a
 * minimum of four. That is `blockedByContent`, it is true of both forms equally,
 * and it must not decide which form to use or make an untouched bank look
 * exhausted. It is reported so the shortfall is visible rather than silently
 * producing a domain with no band.
 *
 * A domain that could have reached its minimum but no longer can, because this
 * learner has seen too much of it, is `insufficientDomains` — and that is what
 * form choice turns on.
 */
function verdict(form, priorRuns) {
  const exposed = exposedItemIds(priorRuns);
  const byDomain = freshEvidenceByDomain(form, exposed);
  const pristine = freshEvidenceByDomain(form, new Set());

  const blockedByContent = Object.keys(byDomain).filter(d => !pristine[d].sufficient);
  const short = Object.keys(byDomain)
    .filter(d => pristine[d].sufficient && !byDomain[d].sufficient);

  return {
    sufficient: short.length === 0,
    freshEvidence: byDomain,
    insufficientDomains: short,
    blockedByContent,
  };
}

/** Items for a section's entry block, in bank order. */
export function entryBlock(form, domain) {
  const routing = content.routingFor(domain);
  if (!routing) return [];
  return content
    .itemsFor({ form, domain, tier: routing.entry_tier })
    .slice(0, routing.entry_count)
    .map(i => i.id);
}

/**
 * Start a run, or hand back the one already in progress.
 *
 * A learner has at most one live run: starting a second while the first is open
 * would split one measurement across two records and burn the bank twice.
 */
export function startRun(store, learnerId, { now = Date.now(), dayKey = null, deviceId = null } = {}) {
  const existing = Object.values(store.runs || {})
    .find(r => r.learner_id === learnerId && r.status === RUN_STATUS.IN_PROGRESS);
  if (existing) return { run: existing, resumed: true };

  const priors = Object.values(store.runs || {}).filter(r => r.learner_id === learnerId);
  const plan = planNextAttempt(learnerId, priors, { now });
  const run = newRun({
    runId: newRunId(),
    learnerId,
    releaseId: content.RELEASE_ID,
    form: plan.form,
    sectionOrder: content.SECTION_ORDER,
    contentSha: {
      assessment_items: content.declaredSha('assessment_items.json'),
      assessment_rules: content.declaredSha('assessment_rules.json'),
    },
    deviceId,
    startedAtUtc: now,
    startedDayKey: dayKey,
  });
  // Why this form, and what this attempt cannot measure before it begins.
  // Recorded on the run so a report never has to reconstruct it, and so a
  // domain that reports insufficient_evidence can say which kind of shortfall
  // it was: too little left of the bank, or artwork that does not exist.
  run.form_choice_reason = plan.reason;
  run.insufficient_domains = plan.insufficientDomains;
  run.blocked_by_content_domains = plan.blockedByContent;
  // Items this learner has already been shown in an earlier attempt. They are
  // still administered — the bank has no spares — but they cannot count as
  // fresh independent evidence, and erasing the record would hide that.
  run.previously_exposed = [...exposedItemIds(priors)];
  return { run, resumed: false, plan };
}

/**
 * May the next section begin?
 *
 * section_boundaries.begin_next_section_only_with_at_least_minutes_remaining.
 * A section that has begun runs to its end; this only gates starting one, so a
 * child is never stopped four items into a section by a clock.
 */
export function canBeginNextSection(minutesRemaining) {
  const need = num(content.RULES.section_boundaries
    .begin_next_section_only_with_at_least_minutes_remaining);
  return num(minutesRemaining) >= need;
}

/** The first section not yet complete, in the release's order. */
export function nextSection(run) {
  return (run.section_order || []).find(d => run.sections[d]?.status !== SECTION_STATUS.COMPLETE) || null;
}

/**
 * Open a section: freeze its entry block, or the full prompt list for the open
 * sections, which are administered in listed order with no routing.
 */
export function beginSection(run, domain, { now = Date.now(), sittingId = null } = {}) {
  const section = run.sections[domain];
  if (!section) throw new Error(`no such section: ${domain}`);
  if (section.status === SECTION_STATUS.COMPLETE) return section;

  if (!section.plan.length) {
    const routing = content.routingFor(domain);
    section.plan = routing
      ? entryBlock(run.form, domain)
      : content.itemsFor({ form: run.form, domain }).map(i => i.id);
    if (routing) {
      section.entry_tier = routing.entry_tier;
      section.entry_count = routing.entry_count;
    }
  }
  if (section.status === SECTION_STATUS.NOT_STARTED) {
    section.status = SECTION_STATUS.IN_PROGRESS;
    section.started_at_utc = now;
  }
  if (sittingId && !section.sitting_ids.includes(sittingId)) section.sitting_ids.push(sittingId);
  return section;
}

/**
 * The next item to present, or null when the section's plan is exhausted.
 *
 * "Next" is the first planned item with no response, so resuming needs no
 * separate cursor: the responses are the position. An item whose asset has not
 * been produced is skipped here rather than rendered — printing an asset brief
 * would hand the learner the vocabulary the item is testing.
 */
export function nextItem(run, domain) {
  const section = run.sections[domain];
  if (!section) return null;
  for (const id of section.plan) {
    if (run.responses[responseKey(id, 0)]) continue;
    const item = content.getItem(id);
    if (item && content.needsUnbuiltAsset(item)) continue;
    return item || null;
  }
  return null;
}

/** Items planned but never presentable, so a report can say why evidence is short. */
export function skippedForMissingAsset(run, domain) {
  const section = run.sections[domain];
  if (!section) return [];
  return section.plan
    .map(id => content.getItem(id))
    .filter(i => i && content.needsUnbuiltAsset(i))
    .map(i => i.id);
}

/** Record that an item was put in front of the learner. */
export function recordExposure(run, itemId, { now = Date.now() } = {}) {
  const seen = run.exposure[itemId];
  run.exposure[itemId] = seen
    ? { ...seen, shown_count: num(seen.shown_count) + 1 }
    : { first_shown_at_utc: now, shown_count: 1 };
  return run.exposure[itemId];
}

/**
 * Store a submitted response.
 *
 * A submitted item is never replayed as a new scored item
 * (pause_resume.resume), so a second submission for the same key is refused
 * rather than allowed to overwrite the first.
 */
export function submitResponse(run, itemId, patch = {}, { now = Date.now(), attemptIndex = 0, deviceId = null } = {}) {
  const key = responseKey(itemId, attemptIndex);
  if (run.responses[key]) return { response: run.responses[key], accepted: false };

  const item = content.getItem(itemId);
  const base = newResponse({
    itemId,
    itemVersion: item?.version ?? 1,
    form: run.form,
    domain: item?.domain ?? null,
    difficultyTier: item?.difficulty_tier ?? null,
    attemptIndex,
    deviceId,
  });
  const response = {
    ...base,
    ...patch,
    response_submitted_at_utc: num(patch.response_submitted_at_utc) || now,
    written_at_ms: now,
  };
  // administration.exposure: never treat a previously exposed item as secure
  // progress evidence. The response is kept in full — it is still what she did
  // — but it is marked so scoring cannot count it as fresh.
  if ((run.previously_exposed || []).includes(itemId)) response.previously_exposed = true;

  // Objective items are scored here, at submit — routing reads the entry block's
  // result and cannot wait for the section to end. Scoring and SHOWING are
  // different things: administration.language bars correctness feedback until
  // the section is submitted, and nothing in the item renderers reads these
  // fields. Storing the outcome is what makes the section's own review possible
  // later without re-deriving it from a bank that may have moved on.
  // Open responses are not scored by anything here. scoring.writing and
  // scoring.speaking both require a qualified human first, and for speaking that
  // person must listen to the original recording — a transcript cannot score
  // comprehensibility, fluency or pronunciation. Until then the response sits in
  // awaiting_review, which is a state, not a placeholder score.
  if (item?.scoring?.method === 'analytic_rubric') {
    response.rubric_id = item.scoring.rubric_id ?? null;
    response.review_status = response.technical_invalid_reason ? 'invalid' : 'awaiting_review';
    response.scored_valid = !response.technical_invalid_reason;
  }

  if (item?.scoring?.method === 'objective') {
    const graded = scoreObjective(item, {
      ...response,
      // scoreObjective speaks in choice_ids/text; the record speaks in the
      // release's own field names.
      choice_ids: response.selected_choice_ids,
      text: response.raw_response,
    });
    response.points = graded.points;
    response.scored_correct = graded.valid ? !graded.incorrect : undefined;
    response.scored_valid = graded.valid;
    if (graded.report_flag) response.report_flag = graded.report_flag;
    if (graded.meaning !== undefined) response.meaning = graded.meaning;
    if (graded.spelling !== undefined) response.spelling = graded.spelling;
  }
  if (response.response_started_at_utc && response.response_time_ms == null) {
    response.response_time_ms = response.response_submitted_at_utc - response.response_started_at_utc;
  }
  run.responses[key] = response;
  return { response, accepted: true };
}

/**
 * How many plays this response has consumed, and whether another is allowed.
 *
 * replay.play_count_definition counts a playback once it has run past 500 ms;
 * replay.technical_replay lets a playback that produced no audible output be
 * repeated without consuming one. A child cannot be expected to notice silence
 * and report it, so the "no sound" control has to be obvious — but the rule is
 * that only she can say it, and the app must not guess.
 */
export function playsUsed(response) {
  return (response?.playback_events || []).filter(e => e.consumed).length;
}

export function canPlay(item, response) {
  const max = num(item?.audio?.max_plays) || num(content.MAX_LISTENING_PLAYS);
  return playsUsed(response) < max;
}

export function recordPlayback(response, { now = Date.now(), consumed = true, resolvedLocale = null } = {}) {
  response.playback_events = [...(response.playback_events || []),
    { at_utc: now, consumed, resolved_locale: resolvedLocale }];
  response.audio_play_count = playsUsed(response);
  if (resolvedLocale) response.voice_resolved_locale = resolvedLocale;
  return response;
}

/** Valid, unsupported answers to the entry block — what routing reads. */
function entryTally(run, domain) {
  const section = run.sections[domain];
  const ids = section.plan.slice(0, section.entry_count || section.plan.length);
  let correct = 0, valid = 0, answered = 0;
  for (const id of ids) {
    const r = run.responses[responseKey(id, 0)];
    if (!r) continue;
    answered++;
    if (r.technical_invalid_reason) continue;       // invalidity.rule: excluded entirely
    valid++;
    if (r.scored_correct) correct++;
  }
  return { ids, correct, valid, answered, complete: answered === ids.length };
}

/**
 * Apply routing once the whole entry block is in.
 *
 * objective_routing.invariant: routing is applied only after the full entry
 * block is submitted, and within a tier the bank's order is preserved. The
 * decision is frozen — routed_at_utc is what lets two devices that routed from
 * different subsets of the entry responses resolve deterministically.
 */
export function applyRoutingIfEntryComplete(run, domain, { now = Date.now() } = {}) {
  const section = run.sections[domain];
  const routing = content.routingFor(domain);
  if (!section || !routing) return null;
  if (section.routing_decision) return section.routing_decision;

  const tally = entryTally(run, domain);
  if (!tally.complete) return null;

  const tiers = routeAfterEntry(domain, tally.correct, tally.valid, content.RULES);
  for (const tier of tiers) {
    for (const item of content.itemsFor({ form: run.form, domain, tier })) {
      if (!section.plan.includes(item.id)) section.plan.push(item.id);
    }
  }
  section.routing_decision = tiers;
  section.routed_at_utc = now;
  section.administered_tiers = [...new Set([section.entry_tier, ...tiers])].filter(Boolean);
  return tiers;
}

/** True when every presentable item in the plan has a response. */
export function sectionIsAnswered(run, domain) {
  const section = run.sections[domain];
  if (!section) return false;
  return section.plan.every(id => {
    const item = content.getItem(id);
    if (item && content.needsUnbuiltAsset(item)) return true;   // skipped, not pending
    return !!run.responses[responseKey(id, 0)];
  });
}

export function completeSection(run, domain, { now = Date.now() } = {}) {
  const section = run.sections[domain];
  if (!section) return null;
  section.status = SECTION_STATUS.COMPLETE;
  section.completed_at_utc = now;
  return section;
}

export function completeRun(run, { now = Date.now() } = {}) {
  run.status = RUN_STATUS.COMPLETE;
  run.status_at_utc = now;
  return run;
}

/**
 * Mark an attempt invalid without deleting it, and link a replacement.
 * pause_resume.parent_invalidation.
 */
export function invalidateRun(run, { reason, by = 'parent', now = Date.now() } = {}) {
  run.status = RUN_STATUS.PARENT_INVALIDATED;
  run.status_at_utc = now;
  run.invalidated_reason = reason ?? null;
  run.invalidated_by = by;
  return run;
}

/** Where a resumed run should pick up: section, item, and what is left. */
export function resumePoint(run) {
  const domain = nextSection(run);
  if (!domain) return { done: true, domain: null, item: null };
  return {
    done: false,
    domain,
    item: nextItem(run, domain),
    sectionStatus: run.sections[domain].status,
    answered: Object.keys(run.responses).length,
  };
}
