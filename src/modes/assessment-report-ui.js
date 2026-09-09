// The report a parent actually reads.
//
// It renders what report.js derived and adds nothing of its own. In particular
// it has no arithmetic: no total, no average, no "overall", and no phrase from
// rules.reporting.prohibited_claims. A parent will act on this, so the two
// lists are named plainly — what the child showed, and what to practise next —
// and every band is written out in words rather than left as a token.
//
// Pronunciation appears once, inside Speaking, as observations with no level.
// It is built with createElement and textContent throughout, so nothing from
// the release can be interpreted as markup on its way to the screen.

import * as report from '../assessment/report.js';
import * as content from '../assessment/content.js';

/** Every band the release can produce, in words. */
const BAND_TEXT = {
  below_assessment_floor: 'Below what this check-in can measure',
  foundation_emerging: 'Foundation — emerging',
  foundation_secure: 'Foundation — secure',
  developing_emerging: 'Developing — emerging',
  developing_secure: 'Developing — secure',
  stretch_emerging: 'Stretch — emerging',
  stretch_secure: 'Stretch — secure',
  insufficient_evidence: 'Not enough evidence yet',
  awaiting_review: 'Waiting for an adult to read or listen',
  starting: 'Starting',
  foundation: 'Foundation',
  developing: 'Developing',
};

const CONFIDENCE_TEXT = {
  high: 'Clear enough to act on',
  moderate: 'Read alongside what you saw in the room',
  low: 'Treat as a hint, not a finding',
  insufficient: 'Not enough to say',
};

const PRONUNCIATION_REASON = {
  awaiting_human_review: 'Nobody has listened to the recordings yet, so there is nothing to report.',
  not_enough_prompts: 'Only one prompt has been listened to. Two are needed before anything is said.',
};

const div = (className, text) => {
  const d = document.createElement('div');
  if (className) d.className = className;
  if (text != null) d.textContent = String(text);
  return d;
};

/** A label and a value on one line. */
function row(label, value) {
  const r = div('assess-report-row');
  r.append(div('assess-report-label', label), div('assess-report-value', value));
  return r;
}

/** One of the two named lists, or a plain sentence when there is nothing in it. */
function skillList(title, skillIds, evidence, emptyText) {
  const box = div('assess-report-list');
  box.append(div('assess-report-list-head', title));
  if (!skillIds.length) {
    box.append(div('assess-report-empty', emptyText));
    return box;
  }
  const ul = document.createElement('ul');
  for (const id of skillIds) {
    const found = evidence.find(e => e.skill_id === id);
    const li = document.createElement('li');
    // The skill's own description, and its id, so a parent can ask about it.
    li.textContent = `${found?.label ?? id} (${id})`;
    ul.append(li);
  }
  box.append(ul);
  return box;
}

/** The nested observations. No level, no score, no total. */
function pronunciationBlock(observations) {
  const box = div('assess-report-nested');
  box.append(div('assess-report-nested-head', observations.label));
  if (!observations.available) {
    box.append(div('assess-report-empty',
      PRONUNCIATION_REASON[observations.reason] || 'Nothing to report yet.'));
    return box;
  }
  const ul = document.createElement('ul');
  for (const s of observations.skills) {
    const li = document.createElement('li');
    li.textContent = `${s.label} (${s.skill_id}) — observed in ${s.observed_in.length} prompt`
      + `${s.observed_in.length === 1 ? '' : 's'}`;
    ul.append(li);
  }
  box.append(ul);

  for (const p of observations.prompts) {
    const line = div('assess-report-observation');
    line.append(div(null, `${p.item_id}: ${p.anchor ?? 'observed'}`));
    // The device's transcript sits here, beside the person's observation and
    // clearly not part of it.
    const heard = p.transcript_observation
      ? `The device heard: "${p.transcript_observation}".`
      : 'The device recorded no transcript.';
    const voice = p.voice_resolved_locale && p.voice_requested_locale
      && p.voice_resolved_locale !== p.voice_requested_locale
      ? ` The voice asked for was ${p.voice_requested_locale} and the device used `
        + `${p.voice_resolved_locale}.`
      : '';
    line.append(div('assess-report-technical', `${heard}${voice} This is technical information only `
      + 'and is not part of the observation.'));
    if (!p.audio_available_on_this_device) {
      line.append(div('assess-report-technical',
        'The recording is on the other iPad. Speaking is best reviewed on the device that recorded it.'));
    }
    box.append(line);
  }
  box.append(div('assess-report-note', observations.note));
  return box;
}

/** One section: band, evidence, and the two lists. */
function sectionBlock(section) {
  const box = div('assess-report-section');
  box.append(div('assess-report-section-head', section.label));
  box.append(row('Where this sits', BAND_TEXT[section.domain_band] ?? section.domain_band));
  box.append(row('How much to read into it', CONFIDENCE_TEXT[section.confidence] ?? section.confidence));
  box.append(row('Independent answers counted', String(section.valid_independent_evidence_count)));
  if (section.administered_tiers?.length) {
    box.append(row('Difficulty asked', section.administered_tiers.join(', ')));
  }
  if (section.support_count) box.append(row('Answers with help given', String(section.support_count)));
  if (section.invalid_count) box.append(row('Answers set aside (a fault, not a mistake)', String(section.invalid_count)));
  if (section.awaiting_review_count) {
    box.append(row('Waiting for an adult', String(section.awaiting_review_count)));
  }
  if (section.upper_limit_not_measured) {
    box.append(div('assess-report-note',
      'The hardest items here were secure, so the top of this is not measured.'));
  }

  box.append(skillList('Observed strengths', section.strength_skill_ids, section.skill_evidence,
    'Nothing has enough evidence to call a strength yet.'));
  box.append(skillList('Suggested next practice areas', section.next_need_skill_ids, section.skill_evidence,
    'Nothing stands out as a next practice area from this check-in.'));

  if (section.pronunciation_observations) box.append(pronunciationBlock(section.pronunciation_observations));
  return box;
}

/** The whole report for one run. */
export function buildReportElement(run, opts = {}) {
  const data = report.runReport(run, opts);
  const box = div('assess-report');

  const when = data.completed_at_utc || data.started_at_utc;
  box.append(div('assess-report-head',
    `${data.learner_id} · form ${data.form} · ${when ? new Date(when).toLocaleDateString() : 'not dated'}`));
  box.append(div('assess-report-note',
    'One measurement, on one day, of what this check-in asks. It is not a school placement '
    + 'and it is not compared with anyone else.'));

  for (const section of data.sections) box.append(sectionBlock(section));

  box.append(div('assess-report-note', data.overall_note));
  box.append(div('assess-report-note',
    `Strengths and next practice areas come from rule ${data.rules.skill_evidence.id}, `
    + `written by the app rather than by the content author, and still to be confirmed by them. `
    + `A skill is named only after ${data.rules.skill_evidence.minimum_attempts_per_skill} `
    + 'independent answers.'));
  return box;
}

/**
 * Every run this device knows about, newest first.
 *
 * A run in progress is reported too — with whatever it has — because a parent
 * looking mid-way through should not be told there is nothing.
 */
export function renderAssessmentReports(container, store, { players = ['jenn', 'jess'] } = {}) {
  if (!container) return;
  container.textContent = '';
  const runs = [];
  for (const player of players) {
    for (const run of Object.values(store?.get(player)?.runs || {})) runs.push(run);
  }
  runs.sort((a, b) => (b.started_at_utc || 0) - (a.started_at_utc || 0));

  if (!runs.length) {
    container.append(div('assess-report-empty', 'No check-in has been done yet.'));
    return;
  }
  for (const run of runs) {
    const wrap = buildReportElement(run);
    if (run.status === 'parent_invalidated') {
      wrap.prepend(div('assess-report-note',
        'This attempt was set aside by a parent. It is kept, and it is not used as a measurement.'));
    }
    container.append(wrap);
  }
}

/** Exposed so a caller can name the release the report was built from. */
export const REPORT_RELEASE_ID = content.RELEASE_ID;
