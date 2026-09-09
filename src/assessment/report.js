// What a run is allowed to say about a child.
//
// Five banded sections — listening, reading, vocabulary and grammar, writing,
// speaking — and nothing else. No total, no average, no grade placement. Where
// a domain has not been measured it stays missing rather than being filled in
// (rules.scoring.overall).
//
// Pronunciation is not a sixth section. It is a group of observations nested
// inside the speaking report, it has no band of its own, and it is never
// totalled: rules.scoring.pronunciation says a device transcript is reported
// beside the human's observation, never converted into a score. A pronunciation
// number would be the single most authoritative-looking thing in this report
// and the least earned.
//
// One rule here is not the content owner's. Release A's reporting contract
// requires strength_skill_ids and next_need_skill_ids and defines neither, so
// SKILL_EVIDENCE_RULE below is written by the implementation, carries its own
// id, and travels in the report so that a parent reading "next: R_MAIN_IDEA"
// can see where the claim comes from. Its thresholds are the release's; only
// the evidence minimum is ours.

import * as content from './content.js';
import { scoreObjective, scoreRubric, objectiveBand, openDomainLabel } from './scoring.js';
import { responseKey } from './run-model.js';

const num = v => Number(v) || 0;

/** The five banded sections, in the release's own order. */
export const DOMAIN_LABELS = {
  listening: 'Listening',
  reading: 'Reading',
  vocabulary_grammar: 'Vocabulary and grammar',
  writing: 'Writing',
  speaking: 'Speaking',
};

/** Domains scored from the item bank, and domains that need a human first. */
export const OBJECTIVE_DOMAINS = ['listening', 'reading', 'vocabulary_grammar'];
export const OPEN_DOMAINS = ['writing', 'speaking'];

/**
 * Pronunciation observations live inside the speaking report.
 *
 * Not a section, not a domain_band, not a total. The parent report shows the
 * S_* skills under Speaking and the P_* skills under this heading, one level
 * further in.
 */
export const PRONUNCIATION_GROUP = {
  id: 'pronunciation_observations',
  label: 'Pronunciation observations',
  parent_domain: 'speaking',
  produces_band: false,
  produces_total: false,
};

/**
 * How a skill becomes a strength or a next need.
 *
 * Authored here, not by the content owner: Release A's reporting contract asks
 * for these two lists and defines no derivation. The cut scores are the
 * release's own (scoring.secure_threshold / scoring.emerging_threshold); the
 * two-attempt minimum is ours, and deliberately conservative — one item is an
 * anecdote, and a parent will act on this.
 */
export const SKILL_EVIDENCE_RULE = {
  id: 'skill-evidence-v1',
  authored_by: 'implementation',
  status: 'awaiting_content_owner_confirmation',
  minimum_attempts_per_skill: 2,
  strength: 'accuracy at or above scoring.secure_threshold',
  next_need: 'accuracy below scoring.emerging_threshold',
  between: 'reported as practising, and named as neither',
  excluded: 'supported, invalid and previously exposed responses',
};

/**
 * What has to be true before a pronunciation observation may be shown at all.
 *
 * rubrics.json → SPEAKING-ANALYTIC-V1: an adult who understands spoken French
 * must listen to the original recording, and transcript-only scoring is
 * prohibited. Two prompts because a single recording of one sentence says more
 * about that sentence than about the child.
 */
export const PRONUNCIATION_RULE = {
  id: 'pronunciation-observation-v1',
  requires_human_review_of_original_audio: true,
  minimum_distinct_valid_prompts: 2,
  produces_score: false,
  transcript_use: 'reported beside the observation, never converted into a score',
};

/** A band an open domain has not earned yet because nobody has reviewed it. */
export const AWAITING_REVIEW = 'awaiting_review';

const CURRICULUM_DOMAIN_TO_KEY = {
  Listening: 'listening',
  Reading: 'reading',
  'Vocabulary and grammar': 'vocabulary_grammar',
  Writing: 'writing',
  Speaking: 'speaking',
  'Pronunciation observation': 'speaking',      // nested, not a sixth section
};

/**
 * Every skill in the release, by id.
 *
 * `group` is 'pronunciation' for the observation skills and 'domain' for the
 * rest. A skill whose curriculum domain this file does not know is an error,
 * not something to drop quietly: a release that adds a domain must be read by
 * a person before its skills start appearing in a parent's report.
 */
export function skillIndex(curriculum = content.CURRICULUM) {
  const out = {};
  for (const s of curriculum.skills || []) {
    const domain = CURRICULUM_DOMAIN_TO_KEY[s.domain];
    if (!domain) throw new Error(`curriculum_map.json: unknown skill domain "${s.domain}" for ${s.id}`);
    const group = s.domain === 'Pronunciation observation' ? 'pronunciation' : 'domain';
    // The two ways of telling them apart must agree. If a release renames a
    // skill so that P_ and the pronunciation domain diverge, the report would
    // put a pronunciation observation under Speaking as if it were a band.
    if ((group === 'pronunciation') !== String(s.id).startsWith('P_')) {
      throw new Error(`curriculum_map.json: ${s.id} does not match its domain "${s.domain}"`);
    }
    out[s.id] = { id: s.id, label: s.description || s.id, domain, group };
  }
  return out;
}

/** Independent, valid, freshly administered — the only responses that count. */
function isCountableObjective(response) {
  return !!response
    && response.scored_valid === true
    && response.support_flag !== true
    && response.previously_exposed !== true
    && response.scored_correct !== undefined;
}

/** The human's review of an open response, if there is a usable one. */
export function reviewFor(run, response) {
  const r = run?.review?.[responseKey(response.item_id, response.attempt_index)];
  if (!r || r.invalidated || !r.scorer_id) return null;
  return r;
}

function responsesFor(run, domain) {
  return Object.values(run?.responses || {}).filter(r => r.domain === domain);
}

/**
 * Per-skill evidence for one run.
 *
 * Objective skills are counted from items; writing and speaking skills from
 * reviewed prompts, using the rubric percent the human's own scoring produced.
 * Pronunciation skills are not here at all — they are observations, and
 * `pronunciationObservations` reports them without a level.
 */
export function skillEvidence(run, { rules = content.RULES, curriculum = content.CURRICULUM } = {}) {
  const skills = skillIndex(curriculum);
  const secure = Number(rules.scoring.secure_threshold);
  const emerging = Number(rules.scoring.emerging_threshold);
  if (!Number.isFinite(secure) || !Number.isFinite(emerging)) {
    throw new Error('assessment_rules.json: scoring thresholds are required to report skills');
  }

  const acc = {};   // skill_id -> { attempts, score_sum, items:[] }
  const bump = (skillId, score, itemId) => {
    const s = skills[skillId];
    if (!s || s.group === 'pronunciation') return;
    const a = acc[skillId] || (acc[skillId] = { attempts: 0, score_sum: 0, items: [] });
    a.attempts += 1;
    a.score_sum += score;
    a.items.push(itemId);
  };

  for (const response of Object.values(run?.responses || {})) {
    const item = content.getItem(response.item_id);
    if (!item) continue;
    if (item.scoring?.method === 'objective') {
      if (!isCountableObjective(response)) continue;
      for (const id of item.skill_ids || []) bump(id, response.scored_correct ? 1 : 0, item.id);
      continue;
    }
    // Open: only what a named human has actually reviewed, per rubrics.json.
    const review = reviewFor(run, response);
    if (!review || response.support_flag === true || response.technical_invalid_reason) continue;
    const rubric = (content.RUBRICS.rubrics || []).find(x => x.id === review.rubric_id);
    if (!rubric) continue;
    const scored = scoreRubric(rubric, review.scores, response);
    if (scored.status !== 'reviewed') continue;
    for (const id of item.skill_ids || []) bump(id, scored.percent / 100, item.id);
  }

  return Object.entries(acc).map(([skill_id, a]) => {
    const accuracy = a.attempts ? a.score_sum / a.attempts : 0;
    const enough = a.attempts >= SKILL_EVIDENCE_RULE.minimum_attempts_per_skill;
    const level = !enough ? 'insufficient_evidence'
      : accuracy >= secure ? 'strength'
        : accuracy < emerging ? 'next_need'
          : 'practising';
    return {
      skill_id,
      label: skills[skill_id].label,
      domain: skills[skill_id].domain,
      attempts: a.attempts,
      accuracy,
      level,
      item_ids: [...a.items],
      rule_id: SKILL_EVIDENCE_RULE.id,
    };
  }).sort((x, y) => (x.skill_id < y.skill_id ? -1 : 1));
}

/**
 * Pronunciation, reported and not scored.
 *
 * Nothing is shown until a named human has listened to the original recordings
 * of at least two distinct prompts. The device's transcript sits beside the
 * observation as a technical note, never inside it.
 */
export function pronunciationObservations(run, { curriculum = content.CURRICULUM } = {}) {
  const skills = skillIndex(curriculum);
  const out = {
    rule_id: PRONUNCIATION_RULE.id,
    id: PRONUNCIATION_GROUP.id,
    label: PRONUNCIATION_GROUP.label,
    parent_domain: PRONUNCIATION_GROUP.parent_domain,
    available: false,
    reason: null,
    score: null,                 // stated, so that its absence is deliberate
    band: null,
    reviewed_prompt_count: 0,
    prompts: [],
    skills: [],
    note: 'Observations from a person who listened to the recording. There is no '
      + 'pronunciation score, and speech recognition is not used to make one.',
  };

  const rubric = (content.RUBRICS.rubrics || []).find(r => r.id === 'SPEAKING-ANALYTIC-V1');
  for (const response of responsesFor(run, 'speaking')) {
    const review = reviewFor(run, response);
    if (!review || response.technical_invalid_reason) continue;
    const observation = review.scores?.pronunciation_observation;
    if (observation == null) continue;
    const item = content.getItem(response.item_id);
    const dim = (rubric?.dimensions || []).find(d => d.id === 'pronunciation_observation');
    out.prompts.push({
      item_id: response.item_id,
      skill_ids: (item?.skill_ids || []).filter(id => skills[id]?.group === 'pronunciation'),
      observation: num(observation),
      anchor: dim?.anchors?.[String(num(observation))] ?? null,
      scorer_id: review.scorer_id,
      reviewed_at_utc: num(review.reviewed_at_utc),
      // Technical context, kept beside the observation and outside it.
      transcript_observation: response.transcript_observation ?? null,
      voice_requested_locale: response.voice_requested_locale ?? null,
      voice_resolved_locale: response.voice_resolved_locale ?? null,
      audio_available_on_this_device: !!response.audio_ref,
    });
  }

  out.reviewed_prompt_count = new Set(out.prompts.map(p => p.item_id)).size;
  if (out.reviewed_prompt_count === 0) {
    out.reason = 'awaiting_human_review';
    return out;
  }
  if (out.reviewed_prompt_count < PRONUNCIATION_RULE.minimum_distinct_valid_prompts) {
    out.reason = 'not_enough_prompts';
    return out;
  }

  out.available = true;
  const seen = new Map();
  for (const p of out.prompts) {
    for (const id of p.skill_ids) {
      if (!seen.has(id)) seen.set(id, []);
      seen.get(id).push(p.item_id);
    }
  }
  out.skills = [...seen.entries()].sort().map(([id, items]) => ({
    skill_id: id,
    label: skills[id]?.label ?? id,
    observed_in: items,
    level: null,                 // observations do not have levels
  }));
  return out;
}

function pointsFor(run, domain) {
  let raw = 0, possible = 0, invalid = 0, support = 0;
  for (const response of responsesFor(run, domain)) {
    if (response.support_flag === true) support += 1;
    if (response.technical_invalid_reason || response.scored_valid === false) { invalid += 1; continue; }
    if (!isCountableObjective(response)) continue;
    const item = content.getItem(response.item_id);
    raw += num(response.points);
    possible += num(item?.scoring?.correct_points ?? 1);
  }
  return { raw, possible, invalid, support };
}

/** Objective per-tier tallies, independent and valid only. */
function tierResults(run, domain) {
  const out = {};
  for (const response of responsesFor(run, domain)) {
    if (!isCountableObjective(response)) continue;
    const tier = response.difficulty_tier || content.getItem(response.item_id)?.difficulty_tier;
    if (!tier) continue;
    const t = out[tier] || (out[tier] = { correct: 0, valid: 0 });
    t.valid += 1;
    if (response.scored_correct) t.correct += 1;
  }
  return out;
}

/**
 * One banded section, carrying every field in reporting.required_fields.
 *
 * The fields are always present. A domain with nothing in it reports
 * insufficient_evidence and empty lists rather than being left out, because a
 * missing field reads as an oversight and an empty one reads as what it is.
 */
export function domainReport(run, domain, opts = {}) {
  const rules = opts.rules || content.RULES;
  const evidence = opts.evidence || skillEvidence(run, opts);
  const mine = evidence.filter(e => e.domain === domain);
  const { raw, possible, invalid, support } = pointsFor(run, domain);

  const base = {
    domain,
    label: DOMAIN_LABELS[domain],
    domain_band: 'insufficient_evidence',
    raw_points: raw,
    points_possible: possible,
    valid_independent_evidence_count: 0,
    administered_tiers: [],
    strength_skill_ids: mine.filter(e => e.level === 'strength').map(e => e.skill_id),
    next_need_skill_ids: mine.filter(e => e.level === 'next_need').map(e => e.skill_id),
    support_count: support,
    invalid_count: invalid,
    confidence: 'insufficient',
    form: run?.form ?? null,
    release_id: run?.release_id ?? null,
    // Beyond the contract, and useful to a person reading it.
    skill_evidence: mine,
    skill_rule_id: SKILL_EVIDENCE_RULE.id,
  };

  if (OBJECTIVE_DOMAINS.includes(domain)) {
    const banded = objectiveBand(domain, tierResults(run, domain), rules,
      { invalidCount: invalid, supportCount: support });
    return {
      ...base,
      domain_band: banded.band,
      confidence: banded.confidence,
      valid_independent_evidence_count: banded.valid_independent_evidence_count,
      administered_tiers: banded.administered_tiers,
      upper_limit_not_measured: banded.upper_limit_not_measured,
      ...(banded.ceiling_reached ? { ceiling_reached: true } : {}),
    };
  }

  // Writing and speaking: scoring.writing and scoring.speaking both require a
  // qualified human, and speaking requires that person to have listened to the
  // original audio. Until enough prompts are reviewed there is no band — not a
  // low one, and not a provisional one.
  const reviewed = [];
  for (const response of responsesFor(run, domain)) {
    const review = reviewFor(run, response);
    if (!review || response.technical_invalid_reason || response.support_flag === true) continue;
    const rubric = (content.RUBRICS.rubrics || []).find(x => x.id === review.rubric_id);
    if (!rubric) continue;
    const scored = scoreRubric(rubric, review.scores, response);
    if (scored.status === 'reviewed') reviewed.push({ response, scored });
  }
  const minimum = num(rules.scoring.minimum_independent_valid_items[domain]);
  const tiers = [...new Set(reviewed.map(r => r.response.difficulty_tier).filter(Boolean))];

  const out = {
    ...base,
    valid_independent_evidence_count: reviewed.length,
    administered_tiers: tiers,
    raw_points: reviewed.reduce((t, r) => t + num(r.scored.weighted_points), 0),
    points_possible: reviewed.reduce((t, r) => t + num(r.scored.weighted_max), 0),
    reviewed_prompt_count: reviewed.length,
  };
  if (reviewed.length < minimum) {
    return { ...out, domain_band: AWAITING_REVIEW, confidence: 'insufficient',
             awaiting_review_count: responsesFor(run, domain)
               .filter(r => r.review_status === 'awaiting_review').length };
  }
  const percent = Math.round(
    reviewed.reduce((t, r) => t + num(r.scored.percent), 0) / reviewed.length);
  const concerns = [invalid > 1, support > 0].filter(Boolean).length;
  return {
    ...out,
    domain_band: openDomainLabel(percent, rules),
    percent,
    confidence: concerns === 0 ? 'high' : concerns === 1 && reviewed.length > minimum ? 'moderate' : 'low',
  };
}

/**
 * The whole report for one run.
 *
 * Five sections and no total. `sections` is an array in the release's order so
 * that nothing can quietly reorder into a ranking, and speaking carries the
 * pronunciation observations inside it.
 */
export function runReport(run, opts = {}) {
  const rules = opts.rules || content.RULES;
  const evidence = skillEvidence(run, { ...opts, rules });
  const order = rules.section_order.filter(d => DOMAIN_LABELS[d]);
  if (order.length !== 5) throw new Error('assessment_rules.json: expected five banded sections');

  const sections = order.map(domain => {
    const section = domainReport(run, domain, { ...opts, rules, evidence });
    if (domain !== 'speaking') return section;
    return { ...section, pronunciation_observations: pronunciationObservations(run, opts) };
  });

  return {
    learner_id: run?.learner_id ?? null,
    run_id: run?.run_id ?? null,
    form: run?.form ?? null,
    release_id: run?.release_id ?? null,
    status: run?.status ?? null,
    started_at_utc: num(run?.started_at_utc),
    completed_at_utc: num(run?.completed_at_utc),
    sections,
    rules: {
      skill_evidence: SKILL_EVIDENCE_RULE,
      pronunciation: PRONUNCIATION_RULE,
      thresholds: { secure: rules.scoring.secure_threshold, emerging: rules.scoring.emerging_threshold },
    },
    // Said out loud, because the absence is the point (rules.scoring.overall).
    overall_score: null,
    overall_note: 'Each section is reported on its own. There is no total and no average.',
  };
}

/**
 * Two runs side by side.
 *
 * Band movement per domain and nothing aggregated. A domain missing from
 * either run compares to nothing and says so; the alternative is to treat
 * "not measured" as a starting point, which invents a gain.
 */
export function compareRuns(previous, current, opts = {}) {
  const before = runReport(previous, opts);
  const after = runReport(current, opts);
  const bandOf = (rep, domain) => rep.sections.find(s => s.domain === domain)?.domain_band ?? null;
  const measured = b => !!b && b !== 'insufficient_evidence' && b !== AWAITING_REVIEW;

  return {
    previous_run_id: before.run_id,
    current_run_id: after.run_id,
    previous_form: before.form,
    current_form: after.form,
    domains: after.sections.map(s => {
      const was = bandOf(before, s.domain);
      const now = s.domain_band;
      return {
        domain: s.domain,
        label: s.label,
        previous_band: was,
        current_band: now,
        comparable: measured(was) && measured(now),
        changed: measured(was) && measured(now) ? was !== now : null,
      };
    }),
    note: 'Bands are compared one domain at a time. Nothing is added up across domains.',
  };
}

/** rules.reporting.prohibited_claims, for whatever renders this. */
export function prohibitedClaims(rules = content.RULES) {
  return [...(rules.reporting?.prohibited_claims || [])];
}

// Re-exported so a caller scoring a single item does not reach past this module.
export { scoreObjective, scoreRubric };
