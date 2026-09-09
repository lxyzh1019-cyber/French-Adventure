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
import { assignFirstForm, alternateForm, routeAfterEntry } from './scoring.js';
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
export function chooseForm(learnerId, priorRuns = [], { now = Date.now(), releaseId = content.RELEASE_ID } = {}) {
  const first = assignFirstForm(learnerId, releaseId);
  const usable = priorRuns
    .filter(r => r && r.status !== RUN_STATUS.PARENT_INVALIDATED)
    .sort((a, b) => num(b.started_at_utc) - num(a.started_at_utc));
  if (!usable.length) return first;

  const last = usable[0];
  const daysSince = (now - num(last.started_at_utc)) / 86400000;

  // The exception, and the reason it matters. A previous attempt that gathered
  // almost nothing did not really expose its form — a child who stopped after
  // two items has not seen the bank. Pushing her onto the alternate anyway
  // would spend both forms to measure her once, and leave nothing fresh for the
  // reassessment. So a nearly-empty prior attempt may repeat its own form.
  if (daysSince < 60 && barelyUsed(last)) return last.form;

  return alternateForm(last.form) || first;
}

/** Fewer than three valid scored items in every domain — administration.reassessment. */
export function barelyUsed(run) {
  const perDomain = {};
  for (const r of Object.values(run?.responses || {})) {
    if (r.technical_invalid_reason) continue;
    if (r.scored_correct === undefined && r.rubric_scored !== true) continue;
    perDomain[r.domain] = (perDomain[r.domain] || 0) + 1;
  }
  return Object.values(perDomain).every(n => n < 3);
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
  const run = newRun({
    runId: newRunId(),
    learnerId,
    releaseId: content.RELEASE_ID,
    form: chooseForm(learnerId, priors, { now }),
    sectionOrder: content.SECTION_ORDER,
    contentSha: {
      assessment_items: content.declaredSha('assessment_items.json'),
      assessment_rules: content.declaredSha('assessment_rules.json'),
    },
    deviceId,
    startedAtUtc: now,
    startedDayKey: dayKey,
  });
  return { run, resumed: false };
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
  if (response.response_started_at_utc && response.response_time_ms == null) {
    response.response_time_ms = response.response_submitted_at_utc - response.response_started_at_utc;
  }
  run.responses[key] = response;
  return { response, accepted: true };
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
