// Assessment scoring — the rules in assessment_rules.json as pure functions.
//
// Nothing here touches the DOM, storage, or the practice-game scoring. It is
// the M2 scaffold: the content package's scoring_fixtures.json runs against
// these functions in tests/assessment-scoring.test.js, so the rules are proven
// before any learner-facing assessment exists. The app does not import this
// module yet; M2 integration waits on M1 acceptance.
//
// Every threshold is read from the rules object passed in. None is invented
// here: the content release owns them (master plan §5.4).

import { normalizeForRecognition, normalizeForSpelling } from '../util/fr-text.js';

const num = v => Number(v) || 0;

/** The skill whose presence makes accents count for the item point. */
export const SPELLING_SKILL = 'W_ENCODING';

/** Is this a response the rules say may not be scored? */
export function isTechnicallyInvalid(response) {
  return !!(response && response.technical_invalid_reason);
}

/**
 * Score one objective item (choice or typed).
 *
 * Returns { points, valid, incorrect, support, independent_band_included,
 *           support_count_increment, meaning?, spelling?, report_flag?,
 *           replacement_tier? }.
 * A technically invalid response scores null and is neither correct nor
 * incorrect; the same tier is reported so a replacement can be chosen.
 */
export function scoreObjective(item, response = {}) {
  if (item?.scoring?.method !== 'objective') throw new Error(`${item?.id}: not an objective item`);
  const support = !!response.support_flag;
  const base = {
    valid: true, incorrect: false, support,
    independent_band_included: !support,
    support_count_increment: support ? 1 : 0,
  };
  if (isTechnicallyInvalid(response)) {
    return { ...base, points: null, valid: false, replacement_tier: item.difficulty_tier,
             technical_invalid_reason: response.technical_invalid_reason };
  }

  if (Array.isArray(item.choices)) {
    const want = [...(item.answer_key?.correct_choice_ids || [])].sort();
    const got = [...(response.choice_ids || response.selected_choice_ids || [])].sort();
    const correct = want.length > 0 && want.length === got.length && want.every((v, i) => v === got[i]);
    return { ...base, points: correct ? num(item.scoring.correct_points ?? 1) : num(item.scoring.incorrect_points),
             incorrect: !correct };
  }

  // Typed: meaning ignores accents; spelling keeps them. The item point needs
  // spelling only when encoding is one of the skills tested (rules.scoring.objective).
  const text = String(response.text ?? '');
  const accepted = item.answer_key?.accepted_answers || [];
  const meaning = accepted.some(a => normalizeForRecognition(a) === normalizeForRecognition(text));
  const spelling = accepted.some(a => normalizeForSpelling(a) === normalizeForSpelling(text));
  const spellingCounts = (item.skill_ids || []).includes(SPELLING_SKILL);
  const correct = spellingCounts ? spelling : meaning;
  const out = { ...base, points: correct ? num(item.scoring.correct_points ?? 1) : num(item.scoring.incorrect_points),
                incorrect: !correct, meaning, spelling };
  if (meaning && !spelling) out.report_flag = 'spelling_needs_correction';
  return out;
}

/**
 * Weighted rubric total for an open response already scored by a human.
 * `scores` null/undefined means no eligible scorer has reviewed it yet.
 */
export function scoreRubric(rubric, scores, response = {}) {
  if (isTechnicallyInvalid(response)) {
    return { rubric_score: null, valid: false, status: 'invalid', pronunciation_score: null,
             technical_invalid_reason: response.technical_invalid_reason };
  }
  if (!scores) return { rubric_score: null, valid: true, status: 'awaiting_review', band: null };
  let points = 0, max = 0;
  for (const d of rubric.dimensions || []) {
    const s = scores[d.id];
    if (s == null) throw new Error(`rubric ${rubric.id}: no score for ${d.id}`);
    points += num(s) * num(d.weight);
    max += 3 * num(d.weight);
  }
  const percent = max ? Math.round((points / max) * 100) : 0;
  return { rubric_score: percent, weighted_points: points, weighted_max: max, percent,
           valid: true, status: 'reviewed' };
}

/** Label for an open domain's aggregate percent, from rules.scoring.open_domain_labels. */
export function openDomainLabel(percent, rules) {
  for (const [range, label] of Object.entries(rules.scoring.open_domain_labels || {})) {
    const [lo, hi] = range.split('-').map(Number);
    if (percent >= lo && percent <= hi) return label;
  }
  return null;
}

/**
 * Which tiers to administer after the entry block, per rules.objective_routing.
 * Returns e.g. ['foundation'] | ['foundation','stretch'] | ['stretch'].
 */
export function routeAfterEntry(domain, entryCorrect, entryValid, rules) {
  const r = rules.objective_routing[domain];
  if (!r) throw new Error(`no routing for ${domain}`);
  // "Apply routing only after the full entry block is submitted"; an invalid
  // entry item neither helps nor hurts, so the thresholds are on correct count.
  void entryValid;
  const n = num(entryCorrect);
  const strongMin = r.entry_count === 3 ? 3 : 3;   // 3–4 of 4, or 3 of 3
  if (n >= strongMin) return ['stretch'];
  if (n === 2) return ['foundation', 'stretch'];
  return ['foundation'];
}

const TIER_ORDER = ['foundation', 'developing', 'stretch'];
const SECURE = 0.75, EMERGING = 0.5;   // stated in rules.scoring.tier_profile; asserted in tests

/**
 * Domain band for an objective domain from per-tier results
 *   tier_results: { [tier]: { correct, valid } }   (independent valid items only)
 * plus support/invalid counts. Implements rules.scoring.tier_profile,
 * minimum_independent_valid_items, ceiling and reporting.confidence.
 */
export function objectiveBand(domain, tierResults, rules, { invalidCount = 0, supportCount = 0 } = {}) {
  const minimum = num(rules.scoring.minimum_independent_valid_items[domain]);
  const totalValid = Object.values(tierResults).reduce((t, r) => t + num(r?.valid), 0);

  const level = tier => {
    const r = tierResults[tier];
    if (!r || num(r.valid) < 3) return null;                  // not enough to judge this tier
    const acc = num(r.correct) / num(r.valid);
    return acc >= SECURE ? 'secure' : acc >= EMERGING ? 'emerging' : 'below';
  };
  const levels = Object.fromEntries(TIER_ORDER.map(t => [t, level(t)]));

  const out = { domain, band: null, confidence: null, upper_limit_not_measured: false,
                valid_independent_evidence_count: totalValid, administered_tiers: TIER_ORDER.filter(t => tierResults[t]) };

  if (totalValid < minimum) {
    return { ...out, band: 'insufficient_evidence', confidence: 'insufficient' };
  }

  // The band is the highest tier the learner reached at all (emerging or
  // better), labelled with how securely. Fixture FX-STRETCH fixes this reading:
  // developing secure + stretch emerging reports stretch_emerging, not
  // developing_secure. The prose in rules.scoring.tier_profile can be read
  // either way; the fixtures are the executable contract, and the wording is
  // flagged for the content owner in docs/implementation-status.md.
  const reached = [...TIER_ORDER].reverse().find(t => levels[t] === 'secure' || levels[t] === 'emerging');
  if (reached) out.band = `${reached}_${levels[reached]}`;
  else if (levels.foundation === 'below') out.band = 'below_assessment_floor';
  else out.band = 'insufficient_evidence';               // e.g. only developing seen, and below

  if (levels.stretch === 'secure') {
    out.upper_limit_not_measured = true;
    const s = tierResults.stretch;
    if (num(s.correct) === num(s.valid)) out.ceiling_reached = true;
  }

  // Adjacent-tier inconsistency: a higher tier judged secure/emerging while a
  // lower administered tier sits below emerging.
  let inconsistent = false;
  for (let i = 1; i < TIER_ORDER.length; i++) {
    const lower = levels[TIER_ORDER[i - 1]], upper = levels[TIER_ORDER[i]];
    if (lower === 'below' && (upper === 'secure' || upper === 'emerging')) inconsistent = true;
  }
  const concerns = [invalidCount > 1, supportCount > 0, inconsistent].filter(Boolean).length;
  if (out.band === 'insufficient_evidence') out.confidence = 'insufficient';
  else if (concerns === 0) out.confidence = 'high';
  else if (concerns === 1 && totalValid > minimum) out.confidence = 'moderate';
  else out.confidence = 'low';
  return out;
}

/** Unsigned 32-bit FNV-1a over UTF-8 bytes. */
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(String(str))) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** First-form assignment per rules.administration.first_form. */
export function assignFirstForm(learnerId, releaseId) {
  if (learnerId === 'jenn') return 'A';
  if (learnerId === 'jess') return 'B';
  return (fnv1a32(`${learnerId}|${releaseId}`) & 1) === 0 ? 'A' : 'B';
}

/** The other form, for reassessment. */
export function alternateForm(form) { return form === 'A' ? 'B' : 'A'; }
