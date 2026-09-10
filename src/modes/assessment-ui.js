// The assessment screen.
//
// Step 2 is the shell: entry, form assignment, section navigation, autosave and
// resume. Item rendering is Step 3, so an open section says what it will
// administer and stops there rather than pretending to ask anything.
//
// What this screen must never grow: a hint, a translation, a correctness
// message during a section, a life, a star, a speed bonus, or a leaderboard
// effect. administration.language bars all of them, and a browser test asserts
// their absence rather than trusting this comment.

import * as session from '../assessment/session.js';
import * as content from '../assessment/content.js';
import { SECTION_STATUS, RUN_STATUS } from '../assessment/run-model.js';
import { DENIED, INTERRUPTED } from '../speech/capture.js';
import { escapeAttr } from '../util/html.js';

const el = id => document.getElementById(id);

// Injected by app.js, so this module reaches nothing global on its own.
let deps = {
  store: null,
  showScreen: () => {},
  minutesRemaining: () => Infinity,
  todayKey: () => null,
  deviceId: () => null,
  onExit: () => {},
  speak: () => {},              // plays a French string aloud
  voiceInfo: () => ({}),        // { resolvedLocale, name } for the record
  makeCapture: null,            // () => audio capture controller
  audioStore: null,             // device-local clip storage
};

let activePlayer = null;
let activeRunId = null;
let sittingId = null;

export function configureAssessmentUI(next) {
  deps = { ...deps, ...next };
}

/** The run this screen is showing, read fresh from the store every time. */
function currentRun() {
  if (!activePlayer || !activeRunId) return null;
  return deps.store?.get(activePlayer)?.runs?.[activeRunId] ?? null;
}

/**
 * Persist a change to the run.
 *
 * The store's merge compares whole objects, so a run must not be edited in
 * place: a snapshot queued mid-section would otherwise join against a value
 * that has already moved.
 */
async function commit(mutate) {
  const player = activePlayer, runId = activeRunId;
  await deps.store.update(player, prev => {
    const run = structuredClone(prev.runs[runId]);
    mutate(run);
    return { ...prev, runs: { ...prev.runs, [runId]: run } };
  });
}

/** Open, or resume, this learner's assessment. Parent-initiated only. */
export async function openAssessment(player) {
  if (!deps.store) return false;
  activePlayer = player;
  sittingId = session.newSittingId();

  const { run, resumed } = session.startRun(deps.store.get(player), player, {
    now: Date.now(), dayKey: deps.todayKey(), deviceId: deps.deviceId(),
  });
  activeRunId = run.run_id;

  if (!resumed) {
    await deps.store.update(player, prev => ({ ...prev, runs: { ...prev.runs, [run.run_id]: run } }));
  }
  // A live run queues inbound snapshots rather than applying them mid-section.
  deps.store.setLive(player);
  deps.showScreen('assessment');
  render();
  return true;
}

/** Leave the screen. The run stays open — a pause is not an abandonment. */
export async function pauseAssessment() {
  const player = activePlayer;
  deps.store?.clearLive();
  if (player) {
    deps.store?.applyPendingRemote(player);
    await deps.store?.save(player);
  }
  activePlayer = null; activeRunId = null; sittingId = null;
  deps.onExit();
}

/** Begin the next section, if the clock allows it. */
export async function beginNextSection() {
  const run = currentRun();
  if (!run) return;
  const domain = session.nextSection(run);
  if (!domain) return;
  if (!session.canBeginNextSection(deps.minutesRemaining())) { render(); return; }
  await commit(r => { session.beginSection(r, domain, { now: Date.now(), sittingId }); });
  render();
}

/**
 * Sections where the on-screen keyboard can answer for the child.
 *
 * VGA-F04 accepts "où" and iOS predictive text supplies exactly that accent;
 * the writing rubric's `conventions` dimension measures what autocorrect
 * erases. The four input attributes are set on every field, but they are not
 * sufficient — the QuickType bar above the keyboard cannot be suppressed from a
 * web page at all — so the only honest fix is to ask the adult, and to say
 * plainly that the app has not disabled anything.
 */
const KEYBOARD_SENSITIVE = new Set(['vocabulary_grammar', 'writing']);

function keyboardNote() {
  const n = document.createElement('div');
  n.className = 'assess-parent-note';
  const h = document.createElement('strong');
  h.textContent = 'Before this part — a grown-up job';
  const p = document.createElement('div');
  p.style.marginTop = '4px';
  p.textContent =
    'For an accurate placement result, temporarily turn off Auto-Correction and '
    + 'Predictive Text in Settings \u2192 General \u2192 Keyboard. '
    + 'The app cannot switch these off itself, and with them on the keyboard may '
    + 'supply accents and spellings this part is measuring.';
  n.append(h, p);
  return n;
}

const DOMAIN_LABEL = {
  listening: 'Listening',
  reading: 'Reading',
  vocabulary_grammar: 'Words and grammar',
  writing: 'Writing',
  speaking: 'Speaking',
};

function progressOf(run) {
  const planned = Object.values(run.sections)
    .flatMap(s => s.plan)
    .filter(id => { const i = content.getItem(id); return !(i && content.needsUnbuiltAsset(i)); });
  const answered = planned.filter(id => run.responses[`${id}#0`]).length;
  return { answered, planned: planned.length };
}

export function render() {
  const run = currentRun();
  if (!run) return;

  const at = session.resumePoint(run);
  const { answered, planned } = progressOf(run);

  el('assess-title').textContent = at.done ? 'All done' : (DOMAIN_LABEL[at.domain] ?? at.domain);
  el('assess-sub').textContent = at.done
    ? 'Nothing left to do today.'
    : `Form ${run.form} · ${answered} of ${planned} answered so far`;
  el('assess-progress-fill').style.width = planned ? `${Math.round((answered / planned) * 100)}%` : '0%';

  const body = el('assess-body');
  const actions = el('assess-actions');
  body.innerHTML = '';
  actions.innerHTML = '';

  if (at.done) {
    body.append(card(
      'That is everything for this check-in.',
      'Nothing is scored on this screen. A grown-up reads the results later, and the writing and speaking parts wait for a person to listen to them.'));
    return;
  }

  const section = run.sections[at.domain];

  if (section.status === SECTION_STATUS.NOT_STARTED) {
    const minutes = deps.minutesRemaining();
    const ok = session.canBeginNextSection(minutes);
    const need = content.RULES.section_boundaries.begin_next_section_only_with_at_least_minutes_remaining;
    if (KEYBOARD_SENSITIVE.has(at.domain)) body.append(keyboardNote());
    body.append(card(
      `Next: ${DOMAIN_LABEL[at.domain] ?? at.domain}`,
      ok
        ? 'You can stop after any part and pick it up later, on either iPad.'
        : `Not enough time left for a new part today — it needs about ${need} minutes. Come back next time and it will be here.`));
    if (ok) actions.append(button('Start this part', 'assess-begin-section'));
    return;
  }

  const item = at.item;
  if (!item) {
    // Every presentable item is answered; the section is ready to close.
    body.append(card(
      `${DOMAIN_LABEL[at.domain] ?? at.domain} — finished`,
      'Nothing is marked here. You can stop, or carry on with the next part.'));
    actions.append(button('Done with this part', 'assess-finish-section'));
    return;
  }

  if (content.routingFor(at.domain)) renderObjectiveItem(body, actions, run, item);
  else renderOpenItem(body, actions, run, item);
}

// ── Open items: writing and speaking ────────────────────────────────────────
//
// Neither is scored here, or anywhere in the app. scoring.writing and
// scoring.speaking both require a qualified human first, and for speaking that
// human must listen to the original recording — a transcript cannot score
// comprehensibility, fluency or pronunciation. So capture is all this does, and
// the response goes to awaiting_review.
//
// The item's `model_response` is an exemplar for the scorer. It is never
// rendered, never placed in the DOM, and a test checks the page for it.

let capture = null;             // live audio controller, while recording
let captureState = 'idle';
let captureError = null;
let clipUrl = null;             // object URL for replaying what was just said

function resetCapture() {
  if (clipUrl) { try { URL.revokeObjectURL(clipUrl); } catch { /* already gone */ } clipUrl = null; }
  capture = null; captureState = 'idle'; captureError = null;
}

function renderOpenItem(body, actions, run, item) {
  const d = draftFor(run, item);
  const wrap = document.createElement('div');
  wrap.className = 'assess-card';

  const prompt = document.createElement('div');
  prompt.className = 'assess-prompt';
  prompt.textContent = item.prompt_en;
  wrap.append(prompt);

  // The picture some speaking prompts need. The brief that describes it is
  // authoring instruction and must never be shown: printing SA-D02's labels
  // would read "school, park, library, bank", the words the prompt is asking
  // the child to produce.
  const asset = content.assetFor(item.id);
  if (asset) {
    const figure = document.createElement('div');
    figure.className = 'assess-figure';
    figure.innerHTML = asset.svg;
    wrap.append(figure);
  }

  if (item.item_type === 'open_written') wrap.append(writtenInput(d));
  else wrap.append(speakingControls(d));

  body.append(wrap);

  const next = button(item.item_type === 'open_written' ? 'Next' : 'Next', 'assess-submit-item');
  next.disabled = !hasOpenAnswer(item, d);
  actions.append(next);
}

function hasOpenAnswer(item, d) {
  if (d.technical_invalid_reason) return true;
  return item.item_type === 'open_written'
    ? !!String(d.raw_response).trim()
    : !!d.audio_blob;
}

function writtenInput(d) {
  const box = document.createElement('div');

  const ta = document.createElement('textarea');
  ta.className = 'assess-textarea';
  ta.id = 'assess-written';
  ta.rows = 4;
  ta.value = d.raw_response;
  // The same four attributes the typed items carry, for the same reason: iOS
  // would otherwise supply the accents and spellings this section measures.
  // They are not sufficient on their own — the QuickType bar cannot be
  // suppressed from a page — which is why the parent is asked to turn
  // Auto-Correction off before this section.
  ta.setAttribute('autocomplete', 'off');
  ta.setAttribute('autocorrect', 'off');
  ta.setAttribute('autocapitalize', 'off');
  ta.setAttribute('spellcheck', 'false');
  ta.addEventListener('input', () => {
    d.raw_response = ta.value;
    const next = document.querySelector('[data-action="assess-submit-item"]');
    if (next) next.disabled = !String(ta.value).trim();
  });
  box.append(ta);

  const note = document.createElement('div');
  note.className = 'assess-note';
  note.textContent = 'Nobody marks this on the screen. A grown-up reads it later.';
  box.append(note);
  return box;
}

function speakingControls(d) {
  const box = document.createElement('div');
  box.className = 'assess-record';

  if (d.technical_invalid_reason === DENIED) {
    box.append(noteEl(
      'The microphone is not available, so this one is skipped. That is not a wrong answer — '
      + 'it is simply not counted. You can carry on with the rest.'));
    return box;
  }

  const rec = document.createElement('button');
  rec.type = 'button';
  rec.className = captureState === 'recording' ? 'btn-secondary recording' : 'btn-primary';
  rec.setAttribute('data-action', captureState === 'recording' ? 'assess-stop-record' : 'assess-record');
  rec.textContent = captureState === 'recording' ? '■ Stop' : (d.audio_blob ? '● Record again' : '● Record');
  box.append(rec);

  if (d.audio_blob && captureState !== 'recording') {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'btn-secondary';
    play.setAttribute('data-action', 'assess-play-own');
    play.textContent = '▶︎ Hear it back';
    box.append(play);
  }

  const state = document.createElement('div');
  state.className = 'assess-note';
  state.textContent = captureState === 'recording'
    ? 'Recording… tap Stop when you have finished.'
    : d.audio_blob
      ? `Recorded${d.audio_duration_ms ? ` — ${Math.round(d.audio_duration_ms / 1000)} seconds` : ''}. `
        + 'You can record again if you want to.'
      : 'Tap Record, say your answer in French, then tap Stop.';
  box.append(state);

  if (captureError) box.append(noteEl(captureError));

  const kept = document.createElement('div');
  kept.className = 'assess-note';
  kept.textContent = 'Your recording stays on this iPad so a grown-up can listen to it.';
  box.append(kept);

  return box;
}

function noteEl(text) {
  const n = document.createElement('div');
  n.className = 'assess-note';
  n.textContent = text;
  return n;
}

/** Start recording. A refused microphone is an invalid item, not a wrong one. */
export async function startRecording() {
  const run = currentRun();
  if (!run || !draft || !deps.makeCapture) return;
  captureError = null;
  capture = deps.makeCapture();
  const started = await capture.start();
  if (!started.ok) {
    // invalidity.rule: excluded from the numerator and the denominator.
    draft.technical_invalid_reason = started.reason || DENIED;
    captureState = 'idle';
    capture = null;
    render();
    return;
  }
  captureState = 'recording';
  render();
}

export async function stopRecording() {
  if (!capture || !draft) return;
  const result = await capture.stop();
  captureState = 'idle';
  capture = null;
  if (result?.ok && result.blob) {
    draft.audio_blob = result.blob;
    draft.audio_duration_ms = result.durationMs ?? null;
    draft.audio_mime = result.mimeType ?? null;
    draft.technical_invalid_reason = null;
    if (clipUrl) { try { URL.revokeObjectURL(clipUrl); } catch { /* gone */ } }
    clipUrl = null;
  } else {
    captureError = 'That did not record. You can try again.';
  }
  render();
}

/** Let the learner hear her own answer back. Nothing is judged by it. */
export function playOwnRecording() {
  if (!draft?.audio_blob) return;
  try {
    if (!clipUrl) clipUrl = URL.createObjectURL(draft.audio_blob);
    const audio = new Audio(clipUrl);
    void audio.play();
  } catch { captureError = 'That clip cannot be played back here.'; render(); }
}

/**
 * The page is going away mid-recording.
 *
 * Whatever was captured is kept — it is still what she said — but the response
 * is invalid, because she was interrupted rather than finished.
 */
export function abandonRecording() {
  if (!capture || captureState !== 'recording' || !draft) return null;
  const out = capture.abandon();
  captureState = 'idle';
  capture = null;
  draft.technical_invalid_reason = INTERRUPTED;
  if (out?.blob) {
    draft.audio_blob = out.blob;
    draft.audio_duration_ms = out.durationMs ?? null;
  }
  return out;
}

// ── Objective items ─────────────────────────────────────────────────────────
//
// Three types, all from the bank: audio_choice (listening), text_choice
// (reading and words) and typed_short (words).
//
// What is deliberately absent, per administration.language: any hint, any
// translation of the French, any indication of whether the answer was right,
// any score, life or streak. The answer IS graded on submit — routing reads the
// entry block's result and cannot wait for the section to end — but nothing
// here reads that grade, and the next item simply appears.

/** The draft response for the item on screen, created on first render. */
let draft = null;

function draftFor(run, item) {
  if (draft && draft.item_id === item.id) return draft;
  draft = {
    item_id: item.id,
    selected_choice_ids: [],
    raw_response: '',
    response_started_at_utc: Date.now(),
    playback_events: [],
    technical_invalid_reason: null,
    support_flag: false,
  };
  return draft;
}

function renderObjectiveItem(body, actions, run, item) {
  const d = draftFor(run, item);

  const wrap = document.createElement('div');
  wrap.className = 'assess-card';

  const prompt = document.createElement('div');
  prompt.className = 'assess-prompt';
  prompt.textContent = item.prompt_en;      // instructions may be English
  wrap.append(prompt);

  if (item.item_type === 'audio_choice') wrap.append(audioControls(item, d));

  // A reading stimulus is French the learner is meant to read. A listening
  // stimulus is not shown at all: audio.transcript_visibility is
  // hidden_until_section_submitted, and a listening item that displays its
  // script is a reading item.
  if (item.stimulus?.text_fr && item.item_type !== 'audio_choice') {
    const st = document.createElement('div');
    st.className = 'assess-stimulus';
    st.textContent = item.stimulus.text_fr;
    wrap.append(st);
  }

  if (Array.isArray(item.choices)) wrap.append(choiceList(item, d));
  else wrap.append(typedInput(d));

  body.append(wrap);

  const next = button('Next', 'assess-submit-item');
  next.disabled = !hasAnswer(d);
  actions.append(next);
}

function hasAnswer(d) {
  return d.technical_invalid_reason
    ? true
    : !!(d.selected_choice_ids.length || String(d.raw_response).trim());
}

function audioControls(item, d) {
  const box = document.createElement('div');
  box.className = 'assess-audio';

  const used = session.playsUsed(d);
  const max = item.audio?.max_plays ?? content.MAX_LISTENING_PLAYS;

  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'btn-primary';
  play.setAttribute('data-action', 'assess-play');
  play.textContent = used === 0 ? '▶︎ Play' : '▶︎ Play again';
  play.disabled = !session.canPlay(item, d);
  box.append(play);

  const left = document.createElement('div');
  left.className = 'assess-note';
  left.textContent = play.disabled
    ? 'That was the last play for this one.'
    : `${max - used} play${max - used === 1 ? '' : 's'} left`;
  box.append(left);

  // The child is the only one who can tell silence from a device fault, so the
  // control has to be plain and easy to reach. A repeat after this does not
  // consume a play (replay.technical_replay).
  const nosound = document.createElement('button');
  nosound.type = 'button';
  nosound.className = 'btn-secondary';
  nosound.setAttribute('data-action', 'assess-no-sound');
  nosound.textContent = 'I heard nothing';
  box.append(nosound);

  return box;
}

function choiceList(item, d) {
  const list = document.createElement('div');
  list.className = 'assess-choices';
  for (const c of item.choices) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'assess-choice';
    b.setAttribute('data-action', 'assess-choose');
    b.setAttribute('data-choice', c.id);
    b.setAttribute('aria-pressed', String(d.selected_choice_ids.includes(c.id)));
    if (d.selected_choice_ids.includes(c.id)) b.classList.add('chosen');
    b.textContent = c.label;
    list.append(b);
  }
  return list;
}

function typedInput(d) {
  const input = document.createElement('input');
  input.className = 'assess-input';
  input.id = 'assess-typed';
  input.type = 'text';
  input.value = d.raw_response;
  input.setAttribute('data-action-input', 'assess-typed');
  // iOS will otherwise supply the accent this item is testing.
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('spellcheck', 'false');
  input.addEventListener('input', () => {
    d.raw_response = input.value;
    const next = document.querySelector('[data-action="assess-submit-item"]');
    if (next) next.disabled = !hasAnswer(d);
  });
  return input;
}

/** Choose an option. Choosing again clears it; nothing says whether it is right. */
export function chooseOption(choiceId) {
  if (!draft) return;
  draft.selected_choice_ids = draft.selected_choice_ids.includes(choiceId) ? [] : [choiceId];
  render();
}

/** Play the item's audio, consuming one of the allowed plays. */
export async function playCurrentAudio() {
  const run = currentRun();
  if (!run || !draft) return;
  const item = content.getItem(draft.item_id);
  if (!item?.audio || !session.canPlay(item, draft)) return;
  const info = deps.voiceInfo() || {};
  session.recordPlayback(draft, { consumed: true, resolvedLocale: info.resolvedLocale ?? null });
  draft.voice_requested_locale = item.audio.locale ?? null;
  draft.voice_name = info.name ?? null;
  deps.speak(item.audio.script_fr_ca);
  render();
}

/**
 * The learner reports silence.
 *
 * invalidity.rule: this is not a wrong answer. It is excluded from the
 * numerator and the denominator, and the record is kept.
 */
export function reportNoSound() {
  if (!draft) return;
  draft.technical_invalid_reason = 'audio_failed';
  session.recordPlayback(draft, { consumed: false });
  render();
}

/** Submit the item on screen and move on. No verdict is shown. */
export async function submitCurrentItem() {
  const run = currentRun();
  if (!run || !draft) return;
  const at = session.resumePoint(run);
  if (!at.item || at.item.id !== draft.item_id) return;
  const d = draft;
  draft = null;
  const item = at.item;

  // The clip is filed before the response, so audio_ref never names something
  // that is not there. A storage failure is survivable and recorded: the
  // response still exists, and the reference says plainly that the audio does
  // not — better than a review panel offering a play button to nothing.
  let audioRef = null, audioDevice = null;
  if (d.audio_blob && deps.audioStore) {
    const stored = await deps.audioStore.put(run.run_id, d.item_id, d.audio_blob, {
      durationMs: d.audio_duration_ms, mimeType: d.audio_mime,
    });
    audioRef = stored.ok ? stored.key : null;
    audioDevice = stored.ok ? stored.device_id : null;
  }

  await commit(r => {
    session.recordExposure(r, d.item_id, { now: Date.now() });
    session.submitResponse(r, d.item_id, {
      selected_choice_ids: d.selected_choice_ids,
      raw_response: d.raw_response || null,
      response_started_at_utc: d.response_started_at_utc,
      technical_invalid_reason: d.technical_invalid_reason,
      support_flag: d.support_flag,
      playback_events: d.playback_events,
      audio_play_count: session.playsUsed(d),
      voice_requested_locale: d.voice_requested_locale ?? null,
      voice_resolved_locale: d.voice_resolved_locale ?? null,
      voice_name: d.voice_name ?? null,
      audio_ref: audioRef,
      audio_device_id: audioDevice,
      audio_duration_ms: d.audio_duration_ms ?? null,
      audio_mime: d.audio_mime ?? null,
    }, { now: Date.now(), deviceId: deps.deviceId() });
    session.applyRoutingIfEntryComplete(r, at.domain, { now: Date.now() });
  });
  resetCapture();
  void item;
  render();
}

/** Close a section the learner has worked through. */
export async function finishSection() {
  const run = currentRun();
  if (!run) return;
  const domain = session.nextSection(run);
  if (!domain || !session.sectionIsAnswered(run, domain)) return;
  await commit(r => {
    session.completeSection(r, domain, { now: Date.now() });
    if (!session.nextSection(r)) session.completeRun(r, { now: Date.now() });
  });
  deps.store.applyPendingRemote(activePlayer);
  render();
}

function card(title, note) {
  const d = document.createElement('div');
  d.className = 'assess-card';
  const h = document.createElement('div');
  h.className = 'assess-prompt';
  h.textContent = title;
  const p = document.createElement('div');
  p.className = 'assess-note';
  p.textContent = note;
  d.append(h, p);
  return d;
}

function button(label, action) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn-primary';
  b.setAttribute('data-action', action);
  b.textContent = label;
  return b;
}

/** The parent-facing panel: what exists, and what is still waiting on a human. */
export function renderAssessmentParentPanel() {
  const panel = el('assess-parent-panel');
  if (!panel || !deps.store) return;
  const rows = [];
  for (const player of ['jenn', 'jess']) {
    for (const run of Object.values(deps.store.get(player)?.runs || {})) {
      const { answered, planned } = progressOf(run);
      const state = run.status === RUN_STATUS.PARENT_INVALIDATED ? 'voided'
        : run.status === RUN_STATUS.COMPLETE ? 'complete' : 'in progress';
      rows.push(`${player} · form ${escapeAttr(run.form)} · ${state} · ${answered}/${planned} answered`);
    }
  }
  panel.textContent = rows.length ? rows.join('\n') : 'No check-in has been started yet.';
  panel.style.whiteSpace = 'pre-line';
  panel.style.fontSize = '.72rem';
  panel.style.color = 'var(--text-muted)';
  panel.style.textAlign = 'center';
}
