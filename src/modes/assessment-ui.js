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
    body.append(card(
      `Next: ${DOMAIN_LABEL[at.domain] ?? at.domain}`,
      ok
        ? 'You can stop after any part and pick it up later, on either iPad.'
        : `Not enough time left for a new part today — it needs about ${need} minutes. Come back next time and it will be here.`));
    if (ok) actions.append(button('Start this part', 'assess-begin-section'));
    return;
  }

  // Step 3 renders the items. Until then the shell says plainly what it will
  // administer rather than showing a half-working question.
  const remaining = section.plan.filter(id => !run.responses[`${id}#0`]).length;
  body.append(card(
    `${DOMAIN_LABEL[at.domain] ?? at.domain} — ${remaining} to go`,
    'The questions themselves arrive in the next step of the build. Nothing here is scored yet.'));
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
