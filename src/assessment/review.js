// The awaiting-review queue, rubric application, and invalidation.
//
// Eleven prompts per form — six written, five spoken — are scored by a person
// against a rubric, because no answer key can decide whether a ten-year-old
// communicated what she meant. Until someone does, those responses sit at
// `awaiting_review`, which is a state and not a placeholder score: the domain
// reports no band rather than a low one.
//
// This module is that queue and the rules around it. It holds no DOM and no
// storage; it takes a run, and returns or edits one.
//
// Three rules from the release govern everything below.
//
// A review without a named scorer is refused. `rubrics.json` requires an
// eligible person, and an unattributed rubric score is indistinguishable from a
// machine-generated one — which for these two domains the rules forbid
// outright ("Do not assign a band or substitute speech-to-text/AI-only
// scoring").
//
// An invalid response is preserved, never converted to incorrect
// (`invalidity.rule`). It leaves the numerator and the denominator both.
//
// And `support_flag` is the adult's to set, not the app's. Only the person in
// the room knows whether a hint was given, and a supported response is kept as
// supported evidence rather than thrown away.

import * as content from './content.js';
import { newReview, responseKey } from './run-model.js';
import { scoreRubric } from './scoring.js';

/** The two domains a person scores. */
export const REVIEWED_DOMAINS = ['writing', 'speaking'];

/** The one invalidity reason a parent may set, from `invalidity.reasons`. */
export const PARENT_INVALID_REASON = 'parent_invalidated';

/** Every rubric dimension is scored on this scale, and nothing else. */
export const MIN_SCORE = 0;
export const MAX_SCORE = 3;

export class ReviewRefused extends Error {}

const refuse = (message) => { throw new ReviewRefused(message); };

/** The rubric an item is scored against, or null if it is not rubric-scored. */
export function rubricFor(item) {
  const id = item?.scoring?.rubric_id;
  if (!id) return null;
  return (content.RUBRICS.rubrics || []).find(r => r.id === id) || null;
}

/**
 * What the release says to do when nobody eligible is available.
 *
 * Surfaced rather than paraphrased: a parent reading the screen should see the
 * content owner's own sentence, not the implementer's summary of it.
 */
export const UNRESOLVED_RULE = content.RUBRICS.unresolved_review_handling;

function responseAt(run, itemId, attemptIndex = 0) {
  return run?.responses?.[responseKey(itemId, attemptIndex)] || null;
}

/**
 * Every open response in the run, with everything needed to score it.
 *
 * Ordered by section then by the order they were answered, so the queue reads
 * the way the sitting ran. Reviewed entries stay in the list: a re-score is an
 * intentional correction and the merge takes the later one.
 */
export function queue(run) {
  const out = [];
  for (const domain of REVIEWED_DOMAINS) {
    const responses = Object.values(run?.responses || {})
      .filter(r => r.domain === domain)
      .sort((a, b) => (a.response_submitted_at_utc || 0) - (b.response_submitted_at_utc || 0));
    for (const response of responses) {
      const item = content.getItem(response.item_id);
      const rubric = rubricFor(item);
      if (!rubric) continue;                      // not a rubric-scored prompt
      const key = responseKey(response.item_id, response.attempt_index);
      const review = run?.review?.[key] || null;
      const scored = review && !review.invalidated && review.scorer_id ? review : null;
      out.push({
        key,
        item_id: response.item_id,
        attempt_index: response.attempt_index || 0,
        domain,
        prompt_en: item.prompt_en,
        item_type: item.item_type,
        has_asset: content.hasAssetFor(item.id),
        raw_response: response.raw_response || '',
        audio_ref: response.audio_ref || null,
        support_flag: response.support_flag === true,
        technical_invalid_reason: response.technical_invalid_reason || null,
        rubric,
        review: scored,
        status: statusOf(response, scored),
        result: scoreRubric(rubric, scored ? scored.scores : null, response),
      });
    }
  }
  return out;
}

function statusOf(response, review) {
  if (response.technical_invalid_reason) return 'invalid';
  return review ? 'reviewed' : 'awaiting_review';
}

/** How many of the run's open prompts still need a person. */
export function outstanding(run) {
  return queue(run).filter(e => e.status === 'awaiting_review').length;
}

/**
 * Validate a set of rubric scores against the rubric that will consume them.
 *
 * Returns the scores, or throws. `scoreRubric` already throws on a missing
 * dimension, but it does so while computing a percent — too late to tell a
 * person which box they left empty, and it would accept a 7 for a 0–3 anchor
 * and quietly report 233%.
 */
export function validateScores(rubric, scores) {
  if (!rubric) refuse('this prompt has no rubric');
  if (!scores || typeof scores !== 'object') refuse('no scores were given');
  const dimensions = rubric.dimensions || [];
  const wanted = new Set(dimensions.map(d => d.id));
  for (const id of Object.keys(scores)) {
    if (!wanted.has(id)) refuse(`${rubric.id} has no dimension "${id}"`);
  }
  for (const d of dimensions) {
    const raw = scores[d.id];
    if (raw == null || raw === '') refuse(`${d.id} has not been scored`);
    const n = Number(raw);
    if (!Number.isInteger(n) || n < MIN_SCORE || n > MAX_SCORE) {
      refuse(`${d.id} must be a whole number from ${MIN_SCORE} to ${MAX_SCORE}`);
    }
  }
  return Object.fromEntries(dimensions.map(d => [d.id, Number(scores[d.id])]));
}

/**
 * Record one person's scoring of one open response.
 *
 * Mutates the run it is given, which is the caller's clone — the store's merge
 * compares whole objects, so a run is never edited where a queued snapshot can
 * still see it.
 */
export function recordReview(run, {
  itemId, attemptIndex = 0, scorerId, scores, note = null,
  deviceId = null, now = Date.now(),
} = {}) {
  const response = responseAt(run, itemId, attemptIndex);
  if (!response) refuse(`${itemId} was never answered`);
  if (response.technical_invalid_reason) {
    refuse('this response is marked invalid, so it is not scored');
  }
  const name = String(scorerId ?? '').trim();
  if (!name) refuse('a review needs the name of whoever did the scoring');

  const item = content.getItem(itemId);
  const rubric = rubricFor(item);
  const checked = validateScores(rubric, scores);

  run.review = run.review || {};
  run.review[responseKey(itemId, attemptIndex)] = newReview({
    itemId,
    attemptIndex,
    scorerId: name,
    rubricId: rubric.id,
    rubricVersion: rubric.version || 1,
    scores: checked,
    reviewedAtUtc: now,
    deviceId,
    note,
  });
  return run.review[responseKey(itemId, attemptIndex)];
}

/**
 * The adult's answer to "was she helped?".
 *
 * A supported response is kept and reported as supported evidence; it is left
 * out of the independent band and nothing else changes about it.
 */
export function setSupport(run, itemId, attemptIndex = 0, supported = true) {
  const response = responseAt(run, itemId, attemptIndex);
  if (!response) refuse(`${itemId} was never answered`);
  response.support_flag = !!supported;
  return response;
}

/**
 * A parent setting a response aside.
 *
 * Only `parent_invalidated` can be set from here, and only a
 * `parent_invalidated` response can be cleared again: the app's own findings —
 * a microphone that failed, an interruption before submit — are records of
 * what happened and are not a parent's to erase.
 */
export function invalidate(run, itemId, attemptIndex = 0) {
  const response = responseAt(run, itemId, attemptIndex);
  if (!response) refuse(`${itemId} was never answered`);
  response.technical_invalid_reason = PARENT_INVALID_REASON;
  return response;
}

export function clearInvalidation(run, itemId, attemptIndex = 0) {
  const response = responseAt(run, itemId, attemptIndex);
  if (!response) refuse(`${itemId} was never answered`);
  if (response.technical_invalid_reason !== PARENT_INVALID_REASON) {
    refuse('only a response a parent set aside can be put back');
  }
  response.technical_invalid_reason = null;
  return response;
}

// -- the export a scorer takes away ------------------------------------------

const RULE = '='.repeat(70);
const THIN = '-'.repeat(70);

/**
 * The open responses and their rubrics, as plain text.
 *
 * For whoever is doing the scoring and is not sitting at this iPad — a French
 * teacher, a tutor. It carries the child's own words, the prompt she saw, and
 * the rubric with every anchor spelled out, because a scale without its anchors
 * is an opinion with a number on it.
 *
 * Two things are deliberately absent. The model responses, because the rubric
 * asks whether the child communicated, not whether she matched a sample, and a
 * scorer holding the sample will drift toward marking the difference; the
 * rubric's own worked examples are the calibration the content owner authored
 * for this. And the spoken audio, which never leaves the device it was recorded
 * on — the export names the clips and says where to hear them.
 */
export function exportText(run, { learnerName = null, now = new Date() } = {}) {
  const entries = queue(run);
  const lines = [];
  const say = (...l) => lines.push(...l);

  say(RULE);
  say('FRENCH CHECK-IN — WRITTEN AND SPOKEN ANSWERS TO SCORE');
  say(RULE);
  say(`Learner:      ${learnerName || run.learner_id || 'unknown'}`);
  say(`Form:         ${run.form || 'unknown'}`);
  say(`Check-in:     ${run.run_id || 'unknown'}`);
  say(`Content:      ${content.RELEASE_ID}`);
  say(`Exported:     ${now.toISOString()}`);
  say('');
  say('HOW TO SCORE');
  say(THIN);
  say('Give each dimension a whole number from 0 to 3, using the wording under');
  say('it. There is no half mark. Score what is there, not what you hoped for.');
  say('');
  say('If you cannot score one — it is blank, or the recording is unusable —');
  say('say so instead of guessing. The release is explicit about the case where');
  say('nobody eligible is available:');
  say('');
  for (const l of wrap(UNRESOLVED_RULE, 66)) say(`    ${l}`);
  say('');
  say('Your name goes on the record as the scorer, whoever types the numbers');
  say('in. The person recorded is the one who read the writing or listened to');
  say('the audio — not whoever operated the iPad afterwards.');
  say('');
  say('An AI assistant may be used for a draft or a second opinion on these');
  say('written answers. It cannot produce the score. A qualified person still');
  say('has to read the writing, or listen to the recording, and confirm each');
  say('dimension; without that the domain stays unscored. Device transcripts');
  say('and automated pronunciation figures are practice aids and are not');
  say('evidence for any of these numbers.');
  say('');

  for (const domain of REVIEWED_DOMAINS) {
    const group = entries.filter(e => e.domain === domain);
    if (!group.length) continue;
    say('');
    say(RULE);
    say(domain === 'writing'
      ? 'WRITING — the child typed these'
      : 'SPEAKING — listen to each recording');
    say(RULE);
    if (domain === 'speaking') {
      say('The recordings stay on the iPad they were made on and are not in this');
      say('file. Play each one from the check-in screen. Scoring a spoken answer');
      say('from a transcript is not permitted by the rubric.');
      say('');
    }
    for (const e of group) say(...promptBlock(e));
    say(...rubricBlock(group[0].rubric, modelAnswersIn(entries)));
  }
  return lines.join('\n');
}

function promptBlock(e) {
  const lines = [THIN, `${e.item_id}`, ''];
  lines.push('Prompt shown to the child:');
  for (const l of wrap(e.prompt_en, 66)) lines.push(`    ${l}`);
  if (e.has_asset) lines.push('    (a picture was shown with this prompt — see the iPad)');
  lines.push('');

  if (e.technical_invalid_reason) {
    lines.push(`NOT FOR SCORING — set aside: ${e.technical_invalid_reason}`, '');
    return lines;
  }
  if (e.support_flag) {
    lines.push('MARKED AS HELPED — score it anyway; it is reported separately.', '');
  }

  if (e.item_type === 'open_written') {
    lines.push('Her answer, exactly as she typed it:');
    const text = e.raw_response.trim();
    if (!text) lines.push('    (nothing was written)');
    else for (const l of String(text).split('\n')) lines.push(`    ${l}`);
  } else {
    lines.push('Her answer: spoken.');
    lines.push(e.audio_ref ? `    recording: ${e.audio_ref}` : '    (no recording was kept)');
  }
  lines.push('');
  for (const d of e.rubric.dimensions || []) lines.push(`    ${pad(d.id)} ___`);
  lines.push('');
  return lines;
}

/**
 * The model answers for the prompts in this export.
 *
 * Not hypothetical, and not a rule invented here: `WRITING-ANALYTIC-V1`'s 3/3
 * worked example is, word for word, `WA-D02`'s model answer — and `WA-D02` is
 * one of the six written prompts on form A. Printing the calibration section
 * whole would hand a scorer the answer to a prompt they are about to score.
 */
function modelAnswersIn(entries) {
  const out = new Set();
  for (const e of entries) {
    const model = content.getItem(e.item_id)?.scoring?.model_response;
    if (model) out.add(String(model).trim());
  }
  return out;
}

/**
 * Split a rubric's worked examples into those a scorer may see and a count of
 * those held back.
 *
 * Both exports need this and both must agree: a worked example whose text is
 * the model answer to a prompt in the same export is withheld, because reading
 * it first turns the question into a comparison. Stated once, so the plain-text
 * and HTML files cannot drift into different rules.
 */
function partitionExamples(rubric, modelAnswers = new Set()) {
  const all = rubric.examples || [];
  const shown = all.filter(ex => !modelAnswers.has(String(ex.response ?? '').trim()));
  return { all, shown, withheld: all.length - shown.length };
}

function rubricBlock(rubric, modelAnswers = new Set()) {
  const lines = ['', RULE, `THE SCALE — ${rubric.id}`, RULE];
  lines.push('Who may score this:');
  for (const l of wrap(rubric.scorer_requirement, 66)) lines.push(`    ${l}`);
  lines.push('');
  for (const d of rubric.dimensions || []) {
    lines.push(`${d.id}  (counts ${d.weight}×)`);
    for (const n of ['0', '1', '2', '3']) {
      for (const [i, l] of wrap(d.anchors?.[n] ?? '', 62).entries()) {
        lines.push(i === 0 ? `    ${n}  ${l}` : `       ${l}`);
      }
    }
    lines.push('');
  }
  const { shown, withheld } = partitionExamples(rubric, modelAnswers);

  if (shown.length) {
    lines.push('WORKED EXAMPLES — what these numbers look like in practice', THIN);
    for (const ex of shown) {
      lines.push(`${ex.prompt_id}`);
      const text = ex.response ?? ex.audio_description ?? '';
      for (const l of wrap(text, 64)) lines.push(`    ${l}`);
      lines.push(`    scored: ${Object.entries(ex.scores || {}).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      for (const l of wrap(ex.comment || '', 64)) lines.push(`    → ${l}`);
      lines.push('');
    }
  }
  if (withheld) {
    lines.push(`(${withheld} worked example${withheld === 1 ? ' is' : 's are'} held back: the`);
    lines.push('wording is also the model answer to a prompt you are scoring, and');
    lines.push('reading it first turns the question into a comparison.)');
    lines.push('');
  }
  return lines;
}

const pad = s => String(s).padEnd(22, '.');

/** Fold a sentence to a width, for a file someone reads in a plain editor. */
function wrap(text, width) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const out = [];
  let line = '';
  for (const w of words) {
    if (line && (line.length + 1 + w.length) > width) { out.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

// -- the whole sitting in one file, audio included ---------------------------

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Everything a scorer needs, as one self-contained HTML file.
 *
 * `exportText` deliberately leaves the recordings behind, because they live on
 * the iPad and a text file cannot carry them. That is the right answer when the
 * scorer is coming this week. It is the wrong answer when they are not: WebKit
 * clears unused site data after about a week, so "I will find someone later"
 * and "the audio is only in IndexedDB" together mean the spoken half of the
 * check-in quietly stops existing.
 *
 * This carries the audio out. Each clip is embedded as a data: URI behind a
 * normal <audio> element, so the file plays in any browser with no network, no
 * app and no unpacking — mail it, keep it in a folder, hand it to a teacher, or
 * give it to an AI for a draft. One file per sitting; nothing to keep together.
 *
 * `clips` maps a response key (`item#attempt`) to `{ dataUrl, mimeType }`. A
 * prompt whose clip is missing says so in the file rather than rendering a
 * player that does nothing: a scorer must be able to tell "she said nothing"
 * from "the recording is gone".
 */
export function exportHtml(run, { learnerName = null, clips = {}, now = new Date() } = {}) {
  const entries = queue(run);
  const models = modelAnswersIn(entries);
  const who = learnerName || run.learner_id || 'unknown';
  const parts = [];

  parts.push(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>French check-in — ${esc(who)} — form ${esc(run.form || '?')}</title>
<style>
 body{font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:46rem;
      margin:0 auto;padding:24px 16px;color:#1b1b1f;background:#fff}
 h1{font-size:1.4rem;margin:0 0 .2em} h2{font-size:1.1rem;margin:2em 0 .4em;
      border-bottom:2px solid #ddd;padding-bottom:.2em} h3{font-size:.95rem;margin:1.6em 0 .3em}
 .meta{color:#555;font-size:.85rem;margin-bottom:1.5em}
 .rule{border-left:3px solid #bbb;padding:.6em .9em;margin:1em 0;background:#fafafa;font-size:.9rem}
 .item{border:1px solid #ddd;border-radius:8px;padding:12px 14px;margin:1em 0}
 .id{font-size:.78rem;color:#666} .prompt{margin:.4em 0 .6em}
 .answer{white-space:pre-wrap;background:#f4f6f8;border-radius:6px;padding:10px 12px;font-size:1.02rem}
 .none{color:#777;font-style:italic}
 .gone{background:#fff4f4;border:1px solid #e3b7b7;border-radius:6px;padding:10px 12px;font-size:.9rem}
 audio{width:100%;margin:.4em 0}
 table{border-collapse:collapse;width:100%;font-size:.88rem;margin:.6em 0}
 th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;vertical-align:top}
 th{background:#f0f0f2;font-weight:600} td.score{width:4.5rem;text-align:center}
 .anchor{font-size:.85rem} .anchor b{display:inline-block;min-width:1.2rem}
 @media print{.item{break-inside:avoid}}
</style></head><body>`);

  parts.push(`<h1>French check-in — written and spoken answers</h1>`);
  parts.push(`<div class="meta">
    Learner: <b>${esc(who)}</b> &middot; Form ${esc(run.form || '?')} &middot;
    Check-in ${esc(run.run_id || 'unknown')}<br>
    Content ${esc(content.RELEASE_ID)} &middot; Exported ${esc(now.toISOString())}
  </div>`);

  parts.push(`<h2>How to score this</h2>
   <p>Give each dimension a whole number from <b>0 to 3</b>, using the wording in
   the table under it. There is no half mark. Score what is there, not what you
   hoped for.</p>
   <p>Your name goes on the record as the scorer, whoever types the numbers in.
   The person recorded is the one who <b>read the writing or listened to the
   audio</b> &mdash; not whoever operated the iPad afterwards.</p>
   <p>An AI assistant may be used for a draft or a second opinion. It
   <b>cannot produce the score</b>: a qualified person still has to read the
   writing, or listen to the recording, and confirm each dimension. Without that
   the domain stays unscored. Device transcripts and automated pronunciation
   figures are practice aids and are not evidence for any of these numbers.</p>
   <div class="rule">${esc(UNRESOLVED_RULE)}</div>`);

  for (const domain of REVIEWED_DOMAINS) {
    const group = entries.filter(e => e.domain === domain);
    if (!group.length) continue;
    parts.push(`<h2>${domain === 'writing' ? 'Writing — what she typed'
                                           : 'Speaking — listen to each recording'}</h2>`);
    if (domain === 'speaking') {
      parts.push(`<p>The recordings are embedded in this file and play offline.
        Scoring a spoken answer from written text is not permitted by the rubric
        &mdash; listen to it.</p>`);
    }
    for (const e of group) parts.push(itemHtml(e, clips));
    parts.push(rubricHtml(group[0].rubric, models));
  }

  parts.push(`</body></html>`);
  return parts.join('\n');
}

function itemHtml(e, clips) {
  const out = [`<div class="item"><div class="id">${esc(e.item_id)}</div>`];
  out.push(`<div class="prompt"><b>She was asked:</b><br>${esc(e.prompt_en)}</div>`);
  if (e.has_asset) out.push(`<div class="id">(a picture was shown with this prompt)</div>`);

  if (e.technical_invalid_reason) {
    out.push(`<div class="gone"><b>Not for scoring</b> — set aside:
      ${esc(e.technical_invalid_reason)}.</div></div>`);
    return out.join('\n');
  }
  if (e.support_flag) {
    out.push(`<div class="gone"><b>Marked as helped.</b> Score it anyway; it is
      reported separately and left out of the independent band.</div>`);
  }

  if (e.item_type === 'open_written') {
    const text = e.raw_response.trim();
    out.push(`<div><b>Her answer:</b></div>`);
    out.push(text ? `<div class="answer">${esc(text)}</div>`
                  : `<div class="answer none">Nothing was written.</div>`);
  } else {
    const clip = clips[e.key];
    out.push(`<div><b>Her answer — spoken:</b></div>`);
    if (clip?.dataUrl) {
      out.push(`<audio controls preload="none" src="${esc(clip.dataUrl)}"></audio>`);
    } else if (e.audio_ref) {
      // The difference a scorer must be able to see.
      out.push(`<div class="gone"><b>The recording is not in this file.</b> She
        answered — the check-in holds a reference to a clip
        (${esc(e.audio_ref)}) — but the audio was not on the iPad that made this
        export. It was recorded on the other iPad, or the browser has cleared it.
        This prompt cannot be scored from what is here.</div>`);
    } else {
      out.push(`<div class="answer none">No recording was kept.</div>`);
    }
  }

  out.push(`<div><b>Your scores</b></div><table><tr>`);
  for (const d of e.rubric.dimensions || []) out.push(`<th>${esc(d.id.replace(/_/g, ' '))}</th>`);
  out.push(`</tr><tr>`);
  for (const d of e.rubric.dimensions || []) out.push(`<td class="score">&nbsp;</td>`);
  out.push(`</tr></table></div>`);
  return out.join('\n');
}

function rubricHtml(rubric, modelAnswers) {
  const out = [`<h3>The scale — ${esc(rubric.id)}</h3>`];
  out.push(`<div class="rule"><b>Who may score this:</b> ${esc(rubric.scorer_requirement)}</div>`);
  out.push(`<table><tr><th>Dimension</th><th>What each number means</th></tr>`);
  for (const d of rubric.dimensions || []) {
    const anchors = ['0', '1', '2', '3']
      .map(n => `<b>${n}</b> ${esc(d.anchors?.[n] ?? '')}`).join('<br>');
    out.push(`<tr><td><b>${esc(d.id.replace(/_/g, ' '))}</b><br>
      <span class="id">counts ${esc(d.weight)}&times;</span></td>
      <td class="anchor">${anchors}</td></tr>`);
  }
  out.push(`</table>`);

  const { shown, withheld } = partitionExamples(rubric, modelAnswers);
  if (shown.length) {
    out.push(`<h3>Worked examples — what these numbers look like in practice</h3><table>
      <tr><th>Prompt</th><th>Response</th><th>Scored</th></tr>`);
    for (const ex of shown) {
      const text = ex.response ?? ex.audio_description ?? '';
      const scores = Object.entries(ex.scores || {}).map(([k, v]) => `${k} ${v}`).join(', ');
      out.push(`<tr><td>${esc(ex.prompt_id)}</td><td>${esc(text)}<br>
        <span class="id">${esc(ex.comment || '')}</span></td><td>${esc(scores)}</td></tr>`);
    }
    out.push(`</table>`);
  }
  if (withheld) {
    out.push(`<p class="id">(${withheld} worked example${withheld === 1 ? ' is' : 's are'}
      held back: the wording is also the model answer to a prompt you are
      scoring, and reading it first turns the question into a comparison.)</p>`);
  }
  return out.join('\n');
}
