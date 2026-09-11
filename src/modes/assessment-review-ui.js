// The screen where a person scores the written and spoken answers.
//
// Eleven prompts per form have no answer key, and until an adult reads or
// listens to them the two domains report nothing. This is where that happens.
//
// What it shows is what a scorer needs and no more: the prompt the child saw,
// her own words, and the rubric with every anchor written out beside the box
// it belongs to. A scale without its wording is an opinion with a number on
// it, so the wording is on screen rather than in a manual nobody opens.
//
// What it does not show is the model answer — not because it is secret, but
// because a scorer holding it marks the difference instead of judging the
// response. The rubric's own worked examples are the calibration the content
// owner authored for exactly this, and they live in the export.
//
// Built with createElement and textContent throughout, so nothing from the
// release or from a child's typing can be interpreted as markup.

import * as review from '../assessment/review.js';
import * as content from '../assessment/content.js';

const div = (className, text) => {
  const d = document.createElement('div');
  if (className) d.className = className;
  if (text != null) d.textContent = String(text);
  return d;
};

function button(label, action, { className = 'btn-secondary', data = {} } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.setAttribute('data-action', action);
  for (const [k, v] of Object.entries(data)) b.setAttribute(`data-${k}`, v);
  b.textContent = label;
  return b;
}

const STATUS_TEXT = {
  awaiting_review: 'Not scored yet',
  reviewed: 'Scored',
  invalid: 'Set aside — not scored',
};

const DOMAIN_TEXT = {
  writing: 'Writing — read what she typed',
  speaking: 'Speaking — listen to each recording',
};

/**
 * One rubric dimension: its name, the four anchors, and the choice.
 *
 * Radio buttons rather than a number box. A scorer choosing between four
 * sentences is doing the rubric's job; a scorer typing a digit is doing
 * arithmetic, and can type 7.
 */
function dimensionBlock(entry, dimension, chosen) {
  const box = div('assess-review-dim');
  const head = div('assess-review-dim-head');
  head.append(div('assess-review-dim-name', dimension.id.replace(/_/g, ' ')));
  head.append(div('assess-review-dim-weight', `counts ${dimension.weight}×`));
  box.append(head);

  for (const n of [0, 1, 2, 3]) {
    const label = document.createElement('label');
    label.className = 'assess-review-anchor';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `${entry.key}:${dimension.id}`;
    radio.value = String(n);
    radio.setAttribute('data-dim', dimension.id);
    radio.setAttribute('data-key', entry.key);
    if (chosen === n) radio.checked = true;
    label.append(radio);
    label.append(div('assess-review-anchor-n', n));
    label.append(div('assess-review-anchor-text', dimension.anchors?.[String(n)] ?? ''));
    box.append(label);
  }
  return box;
}

/** Everything for one prompt: what was asked, what came back, and the scale. */
function entryBlock(entry) {
  const card = div('assess-review-item');
  card.setAttribute('data-key', entry.key);

  const head = div('assess-review-head');
  head.append(div('assess-review-id', entry.item_id));
  const status = div('assess-review-status', STATUS_TEXT[entry.status] ?? entry.status);
  status.setAttribute('data-status', entry.status);
  head.append(status);
  card.append(head);

  card.append(div('assess-review-prompt-label', 'She was asked:'));
  card.append(div('assess-review-prompt', entry.prompt_en));
  if (entry.has_asset) {
    const figure = div('assess-review-figure');
    figure.innerHTML = content.assetFor(entry.item_id).svg;
    card.append(figure);
  }

  card.append(div('assess-review-prompt-label', 'She answered:'));
  if (entry.item_type === 'open_written') {
    const text = entry.raw_response.trim();
    card.append(text
      ? div('assess-review-answer', text)
      : div('assess-review-answer assess-review-empty', 'Nothing was written.'));
  } else {
    const row = div('assess-review-actions');
    if (entry.audio_ref) {
      row.append(button('▶ Play the recording', 'rev-play', { data: { key: entry.key } }));
    } else {
      row.append(div('assess-review-empty', 'No recording was kept on this device.'));
    }
    card.append(row);
    card.append(div('assess-review-note',
      'The recording lives on the iPad it was made on. Scoring a spoken answer '
      + 'from written text is not permitted by the rubric — listen to it.'));
  }

  // The two things only the adult in the room knows.
  const flags = div('assess-review-flags');
  flags.append(checkbox(entry, 'rev-support', 'She was helped with this one', entry.support_flag,
    'Kept and reported, but left out of the independent band.'));
  flags.append(checkbox(entry, 'rev-invalid', 'Set this one aside', entry.status === 'invalid',
    'For a prompt that went wrong — not for a poor answer. The response is kept either way.'));
  card.append(flags);

  if (entry.status === 'invalid') {
    card.append(div('assess-review-note',
      'A response that has been set aside is not scored. It counts neither right nor wrong.'));
    return card;
  }

  for (const d of entry.rubric.dimensions || []) {
    card.append(dimensionBlock(entry, d, entry.review?.scores?.[d.id] ?? null));
  }

  if (entry.review) {
    card.append(div('assess-review-note',
      `Scored by ${entry.review.scorer_id}. Choosing again replaces it.`));
  }
  const actions = div('assess-review-actions');
  actions.append(button(entry.review ? 'Save the change' : 'Save these scores', 'rev-save',
    { data: { key: entry.key } }));
  actions.append(div('assess-review-msg', ''));
  card.append(actions);
  return card;
}

function checkbox(entry, action, label, checked, note) {
  const wrap = document.createElement('label');
  wrap.className = 'assess-review-flag';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  input.setAttribute('data-action', action);
  input.setAttribute('data-key', entry.key);
  wrap.append(input);
  const text = div('assess-review-flag-text');
  text.append(div('assess-review-flag-label', label));
  text.append(div('assess-review-flag-note', note));
  wrap.append(text);
  return wrap;
}

/**
 * Mount the panel for one learner's most recent run.
 *
 * `deps` supplies what this module will not reach for itself: the store it
 * commits through, the clip store, and a way to play a blob.
 */
export function mountAssessmentReview(container, {
  store, audioStore, playBlob, players = ['jenn', 'jess'], deviceId = () => null,
  now = () => Date.now(), download = null,
} = {}) {
  if (!container) return () => {};

  let player = players[0];
  let scorerName = '';

  const runFor = (p) => {
    const runs = Object.values(store?.get(p)?.runs || {});
    runs.sort((a, b) => (b.started_at_utc || 0) - (a.started_at_utc || 0));
    return runs[0] || null;
  };

  async function commit(mutate) {
    const run = runFor(player);
    if (!run) return;
    await store.update(player, prev => {
      const next = structuredClone(prev.runs[run.run_id]);
      mutate(next);
      return { ...prev, runs: { ...prev.runs, [run.run_id]: next } };
    });
  }

  const draw = () => {
    container.textContent = '';

    const tabs = div('assess-review-tabs');
    for (const p of players) {
      const b = button(p === 'jenn' ? 'Jenn' : 'Jess', 'rev-player', { data: { player: p } });
      if (p === player) b.classList.add('active');
      tabs.append(b);
    }
    container.append(tabs);

    const run = runFor(player);
    if (!run) {
      container.append(div('assess-review-empty', 'This learner has not done a check-in yet.'));
      return;
    }

    const entries = review.queue(run);
    const left = entries.filter(e => e.status === 'awaiting_review').length;
    container.append(div('assess-review-count', left
      ? `${left} of ${entries.length} still need a person.`
      : `All ${entries.length} have been scored.`));

    // The release's own sentence about the case this family is in.
    container.append(div('assess-review-rule', review.UNRESOLVED_RULE));

    const who = div('assess-review-scorer');
    who.append(div('assess-review-prompt-label', 'Who is doing the scoring?'));
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'assess-review-name';
    input.id = 'assess-review-scorer';
    input.placeholder = 'The name of whoever read or listened';
    input.value = scorerName;
    input.addEventListener('input', () => { scorerName = input.value; });
    who.append(input);
    who.append(div('assess-review-flag-note',
      'Name the person who actually read the writing or listened to the recording '
      + 'and can judge French at this level — not whoever is holding the iPad. An AI '
      + 'assistant may give you a draft or a second opinion, but it cannot produce '
      + 'the score, and a score with nobody\'s name on it cannot be told apart from '
      + 'one a machine produced.'));
    container.append(who);

    if (download) {
      const row = div('assess-review-actions');
      row.append(button('⬇ Save the answers to score', 'rev-export'));
      row.append(div('assess-review-flag-note',
        'A text file with the prompts, her answers and the whole scale — for '
        + 'whoever is scoring and is not at this iPad.'));
      container.append(row);
    }

    for (const domain of review.REVIEWED_DOMAINS) {
      const group = entries.filter(e => e.domain === domain);
      if (!group.length) continue;
      container.append(div('assess-review-domain', DOMAIN_TEXT[domain]));
      for (const e of group) container.append(entryBlock(e));
    }
  };

  const entryFor = (key) => review.queue(runFor(player)).find(e => e.key === key) || null;

  const say = (key, text, ok = false) => {
    const card = container.querySelector(`.assess-review-item[data-key="${CSS.escape(key)}"]`);
    const msg = card?.querySelector('.assess-review-msg');
    if (!msg) return;
    msg.textContent = text;
    msg.setAttribute('data-ok', String(!!ok));
  };

  async function save(key) {
    const entry = entryFor(key);
    if (!entry) return;
    const scores = {};
    for (const d of entry.rubric.dimensions || []) {
      const picked = container.querySelector(
        `input[type="radio"][name="${CSS.escape(`${key}:${d.id}`)}"]:checked`);
      if (picked) scores[d.id] = Number(picked.value);
    }
    try {
      // Checked here as well as in commit(), so the message names the box.
      review.validateScores(entry.rubric, scores);
      if (!scorerName.trim()) throw new review.ReviewRefused('a name is needed before saving');
      await commit(run => review.recordReview(run, {
        itemId: entry.item_id, attemptIndex: entry.attempt_index,
        scorerId: scorerName, scores, deviceId: deviceId(), now: now(),
      }));
      draw();
    } catch (e) {
      if (!(e instanceof review.ReviewRefused)) throw e;
      say(key, e.message);
    }
  }

  async function play(key) {
    const entry = entryFor(key);
    const run = runFor(player);
    if (!entry || !run || !audioStore) return;
    const clip = await audioStore.get(run.run_id, entry.item_id, entry.attempt_index);
    if (!clip?.blob) return say(key, 'That recording is not on this iPad.');
    try { await playBlob(clip.blob); } catch { say(key, 'This device would not play it back.'); }
  }

  const onClick = async (event) => {
    const el = event.target.closest?.('[data-action]');
    if (!el || !container.contains(el)) return;
    const action = el.getAttribute('data-action');
    const key = el.getAttribute('data-key');

    if (action === 'rev-player') { player = el.getAttribute('data-player'); draw(); return; }
    if (action === 'rev-save') { await save(key); return; }
    if (action === 'rev-play') { await play(key); return; }
    if (action === 'rev-export') {
      const run = runFor(player);
      if (run && download) download(review.exportText(run, { learnerName: player }), player, run);
      return;
    }
    if (action === 'rev-support') {
      const on = el.checked;
      await commit(run => review.setSupport(run, ...splitKey(key), on));
      draw();
      return;
    }
    if (action === 'rev-invalid') {
      const on = el.checked;
      await commit(run => (on
        ? review.invalidate(run, ...splitKey(key))
        : review.clearInvalidation(run, ...splitKey(key))));
      draw();
    }
  };

  container.addEventListener('click', onClick);
  draw();
  return () => container.removeEventListener('click', onClick);
}

function splitKey(key) {
  const at = String(key).lastIndexOf('#');
  return [key.slice(0, at), Number(key.slice(at + 1))];
}
