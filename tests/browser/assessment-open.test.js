// Writing and speaking, in a real page.
//
// Neither is scored anywhere in the app. scoring.writing and scoring.speaking
// both require a qualified human first, and for speaking that person must
// listen to the original recording — a transcript cannot score
// comprehensibility, fluency or pronunciation. So what these tests check is
// that capture works, that nothing is marked, and that nothing leaks.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import * as G from '../helpers/content-guards.js';

const APP = 'file://' + path.resolve(process.env.APP_FILE || 'index.html');
const CHROME = process.env.CHROMIUM_PATH || undefined;
const PARENT_PWD = '1234';
const ITEMS = JSON.parse(
  readFileSync('content/releases/assessment-v1/assessment_items.json', 'utf8')).items;

let browser;
const openContexts = [];
test.before(async () => { browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {}); });
test.afterEach(async () => {
  await Promise.all(openContexts.splice(0).map(c => c.close().catch(() => {})));
});
test.after(async () => { await browser?.close(); });

/** micAllowed:false makes getUserMedia reject, exactly as a denied prompt does. */
async function openApp({ micAllowed = true } = {}) {
  const context = await browser.newContext();
  openContexts.push(context);
  await context.route('**://*/**', route =>
    route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await context.addInitScript(G.recordRendering);
  await context.addInitScript((allowed) => {
    window.fbInit = () => {}; window.fbSave = async () => true;
    window.fbAssessInit = () => {}; window.fbAssessSave = async () => true;
    window.fbBackupSave = async () => {}; window.fbBackupList = async () => [];
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = () => {};
      window.speechSynthesis.cancel = () => {};
    }

    // A microphone that can be granted or refused on demand, and a recorder
    // that produces a real Blob without needing a device.
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (!allowed) { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; }
          return { getTracks: () => [{ stop() {} }] };
        },
      },
    });
    window.MediaRecorder = class {
      constructor() { this.mimeType = 'audio/webm'; this.state = 'inactive'; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['clip'], { type: 'audio/webm' }) });
        this.onstop?.();
      }
    };
  }, micAllowed);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!(window.__faDebug?.assessment && window.showParentSummary), null, { timeout: 15000 });
  return { page, errors };
}

const openAsParent = page => page.evaluate(async ({ pwd }) => {
  showParentSummary();
  for (let i = 0; i < 100; i++) {
    const b = document.querySelector('[data-action="assess-open"][data-player="jenn"]');
    if (b) { document.getElementById('parent-pwd').value = pwd; b.click(); break; }
    await new Promise(r => setTimeout(r, 50));
  }
  for (let i = 0; i < 100; i++) {
    if (window.__faDebug.assessment.runs('jenn').length) break;
    await new Promise(r => setTimeout(r, 50));
  }
}, { pwd: PARENT_PWD });

const positionOf = page => page.evaluate(() => {
  const r = window.__faDebug.assessment.runs('jenn')[0];
  const next = r.section_order.find(d => r.sections[d].status !== 'complete') || null;
  return { next, status: next ? r.sections[next].status : null };
});

/** Answer whatever is on screen and move on, whatever kind of item it is. */
async function advance(page) {
  const begin = await page.$('[data-action="assess-begin-section"]');
  if (begin) { await begin.click(); await page.waitForTimeout(140); return; }
  const finish = await page.$('[data-action="assess-finish-section"]');
  if (finish) { await finish.click(); await page.waitForTimeout(140); return; }
  const choice = await page.$('.assess-choice');
  if (choice) await choice.click();
  const typed = await page.$('#assess-typed');
  if (typed) await typed.fill('x');
  const written = await page.$('#assess-written');
  if (written) await written.fill('x');
  const rec = await page.$('[data-action="assess-record"]');
  if (rec) {
    await rec.click(); await page.waitForTimeout(120);
    const stop = await page.$('[data-action="assess-stop-record"]');
    if (stop) { await stop.click(); await page.waitForTimeout(150); }
  }
  const submit = await page.$('[data-action="assess-submit-item"]:not([disabled])');
  if (submit) { await submit.click(); await page.waitForTimeout(150); return; }
  await page.waitForTimeout(80);
}

/** Walk forward until `domain` is the open section. */
async function reachSection(page, domain, { started = true } = {}) {
  await openAsParent(page);
  for (let n = 0; n < 140; n++) {
    const at = await positionOf(page);
    if (at.next === domain && (started ? at.status !== 'not_started' : at.status === 'not_started')) return true;
    await advance(page);
  }
  return false;
}

const run = page => page.evaluate(() => window.__faDebug.assessment.runs('jenn')[0]);
const screenText = page => page.evaluate(() => document.getElementById('screen-assessment').textContent);

// ── the parent readiness instruction ────────────────────────────────────────

test('the adult is asked to turn the keyboard help off before the words section', async () => {
  // The app cannot switch iOS predictive text off — the QuickType bar is not
  // suppressible from a web page — so it must ask, and must not imply it has.
  const { page } = await openApp();
  assert.ok(await reachSection(page, 'vocabulary_grammar', { started: false }),
    'never reached the start of the words section');

  const note = await page.textContent('.assess-parent-note');
  assert.ok(note, 'no keyboard instruction was shown');
  assert.match(note, /Auto-Correction/);
  assert.match(note, /Predictive Text/);
  assert.match(note, /Settings/);
  assert.match(note, /Keyboard/);
  assert.equal(/we have (turned|switched)|disabled for you|automatically/i.test(note), false,
    `the note implies the app disabled the keyboard: ${note}`);
});

test('the same instruction appears before the writing section', async () => {
  const { page } = await openApp();
  assert.ok(await reachSection(page, 'writing', { started: false }),
    'never reached the start of the writing section');
  const note = await page.textContent('.assess-parent-note');
  assert.match(note, /Auto-Correction/);
});

// ── writing ────────────────────────────────────────────────────────────────

test('a written answer is captured, unmarked, and left awaiting review', async () => {
  const { page, errors } = await openApp();
  assert.ok(await reachSection(page, 'writing'), 'never reached the writing section');

  const area = await page.$('#assess-written');
  assert.ok(area, 'no writing field was rendered');
  const attrs = await page.evaluate(() => {
    const t = document.getElementById('assess-written');
    return ['autocomplete', 'autocorrect', 'autocapitalize', 'spellcheck'].map(a => t.getAttribute(a));
  });
  assert.deepEqual(attrs, ['off', 'off', 'off', 'false'],
    'the writing field lets the keyboard help');

  await area.fill('Je suis Jenn.');
  await page.click('[data-action="assess-submit-item"]');
  await page.waitForTimeout(300);

  const r = await run(page);
  const answered = Object.values(r.responses).filter(x => x.domain === 'writing');
  assert.equal(answered.length, 1);
  const resp = answered[0];
  assert.equal(resp.raw_response, 'Je suis Jenn.');
  assert.equal(resp.review_status, 'awaiting_review');
  assert.equal(resp.scored_correct, undefined, 'a written answer was marked');
  assert.equal(resp.scorer_id, null, 'a rubric score appeared without a named human');
  assert.equal(resp.rubric_id, 'WRITING-ANALYTIC-V1');
  assert.deepEqual(errors, []);
});

test('no scorer-facing text is ever put in front of the child', async () => {
  // Every open item carries a model_response and author_notes for whoever
  // scores it. Both are for the adult; neither is a prompt.
  //
  // What this reads is what the learner-facing container actually rendered -
  // its text and its attribute values - plus a record of everything inserted
  // into it along the way, so a placeholder or a flash counts too. It does not
  // read the page source: the whole release is inlined so the app works
  // offline, so every model answer is in the file by construction. That is the
  // documented risk in known-risks.md §1c and there is no fix without a
  // server; scanning for it only re-detects the bundling
  // (tests/fixtures/guard-regressions). What is fixable is never showing it.
  const { page } = await openApp();
  assert.ok(await reachSection(page, 'writing'), 'never reached the writing section');

  // Walk to the end, so every writing and speaking item is covered.
  for (let n = 0; n < 200; n++) {
    if (!(await positionOf(page)).next) break;
    await advance(page);
  }

  const scorerFacing = ITEMS.flatMap(i => [i.scoring?.model_response, i.author_notes]).filter(Boolean);
  assert.ok(scorerFacing.length > 0, 'the release carries no scorer-facing text to check against');

  const rendered = await page.evaluate(G.renderedStrings, '#screen-assessment');
  const inserted = await page.evaluate(() => window.__renderLog);
  assert.ok(inserted.length > 0, 'nothing was recorded, so this proves nothing');

  assert.deepEqual(G.leakedStrings([...rendered, ...inserted], scorerFacing), [],
    'scorer-facing text reached the learner');
});

// ── speaking ───────────────────────────────────────────────────────────────

test('a spoken answer is recorded, kept on the device, and left awaiting review', async () => {
  const { page, errors } = await openApp();
  assert.ok(await reachSection(page, 'speaking'), 'never reached the speaking section');

  await page.click('[data-action="assess-record"]');
  await page.waitForTimeout(150);
  assert.ok(await page.$('[data-action="assess-stop-record"]'), 'recording did not start');

  await page.click('[data-action="assess-stop-record"]');
  await page.waitForTimeout(200);
  assert.ok(await page.$('[data-action="assess-play-own"]'), 'the clip cannot be played back');

  await page.click('[data-action="assess-submit-item"]');
  await page.waitForTimeout(400);

  const r = await run(page);
  const spoken = Object.values(r.responses).filter(x => x.domain === 'speaking');
  assert.equal(spoken.length, 1);
  const resp = spoken[0];
  assert.equal(resp.review_status, 'awaiting_review');
  assert.equal(resp.scored_correct, undefined, 'a spoken answer was marked');
  assert.ok(resp.audio_ref, 'the recording was not filed');
  assert.ok(resp.audio_device_id, 'the record does not say which device holds the clip');
  assert.equal(resp.transcript_observation, null, 'a transcript was stored as if it were an answer');

  // And the clip really is in this device's storage, under that reference.
  const stored = await page.evaluate(key => new Promise(resolve => {
    const req = indexedDB.open('french_assessment_audio', 1);
    req.onsuccess = () => {
      const db = req.result;
      const get = db.transaction('clips', 'readonly').objectStore('clips').get(key);
      get.onsuccess = () => { db.close(); resolve(!!get.result); };
      get.onerror = () => { db.close(); resolve(false); };
    };
    req.onerror = () => resolve(false);
  }), resp.audio_ref);
  assert.equal(stored, true, 'audio_ref names a clip that is not there');
  assert.deepEqual(errors, []);
});

test('a refused microphone is not a wrong answer', async () => {
  // invalidity.rule: excluded from the numerator and the denominator.
  const { page, errors } = await openApp({ micAllowed: false });
  assert.ok(await reachSection(page, 'speaking'), 'never reached the speaking section');

  await page.click('[data-action="assess-record"]');
  await page.waitForTimeout(250);

  const text = await screenText(page);
  assert.match(text, /not a wrong answer/i, 'the child was not reassured');

  await page.click('[data-action="assess-submit-item"]');
  await page.waitForTimeout(300);

  const r = await run(page);
  const resp = Object.values(r.responses).find(x => x.domain === 'speaking');
  assert.ok(resp, 'nothing was recorded for the skipped prompt');
  assert.equal(resp.technical_invalid_reason, 'microphone_failed');
  assert.equal(resp.review_status, 'invalid');
  assert.equal(resp.scored_correct, undefined, 'a refused microphone was scored');
  assert.equal(resp.scored_valid, false);
  assert.deepEqual(errors, []);
});

test('a speaking prompt that needs a picture shows the picture, never the brief', async () => {
  // A brief is instruction to an illustrator. Printing SA-D02's required_labels
  // would hand the child "school, park, library, bank" - the vocabulary the
  // prompt asks them to produce in French.
  //
  // The prompt itself, though, legitimately says "from the school to the
  // library": those places are the task, and an earlier version of this guard
  // flagged the item's own prompt for containing them
  // (tests/fixtures/guard-regressions). So the brief is compared against the
  // item's own learner-facing copy first, and what is left - the drawing
  // instructions, the prohibitions, the labels the prompt does not name - is
  // what must not appear.
  const { page } = await openApp();
  assert.ok(await reachSection(page, 'speaking'), 'never reached the speaking section');

  const briefed = ITEMS.filter(G.isBrief);
  let sawArtwork = false;

  for (let n = 0; n < 12; n++) {
    const current = await page.evaluate(() => {
      const r = window.__faDebug.assessment.runs('jenn')[0];
      return r.sections.speaking.plan.find(id => !r.responses[`${id}#0`]) || null;
    });
    if (!current) break;

    const item = briefed.find(i => i.id === current);
    if (item) {
      sawArtwork = true;
      assert.ok(await page.$('#screen-assessment .assess-figure svg'), `${current} showed no picture`);

      const guarded = G.briefOnlyPhrases(item);
      assert.ok(guarded.length > 0, `${current}: nothing of its brief is guarded against`);

      // Scoped to the item on screen. A whole-session record would be the
      // wrong haystack: "chair" and "table" are SA-F02's brief, and they are
      // also the English choice labels of four listening and reading items
      // answered earlier in the same sitting (tests/fixtures/guard-regressions).
      const rendered = await page.evaluate(G.renderedStrings, '#screen-assessment');
      const leaked = G.leakedStrings(rendered, guarded.map(g => g.phrase));
      assert.deepEqual(leaked, [], `${current} printed its brief`);

      // The prompt is on screen and is meant to be. Its own words are not a leak.
      assert.ok((await screenText(page)).includes(item.prompt_en),
        `${current} did not show its prompt`);
    }

    const rec = await page.$('[data-action="assess-record"]');
    if (rec) {
      await rec.click(); await page.waitForTimeout(120);
      const stop = await page.$('[data-action="assess-stop-record"]');
      if (stop) { await stop.click(); await page.waitForTimeout(150); }
    }
    const submit = await page.$('[data-action="assess-submit-item"]:not([disabled])');
    if (submit) { await submit.click(); await page.waitForTimeout(200); }
  }

  assert.equal(sawArtwork, true, 'no prompt with artwork was reached');
});

test('a written answer is not reacted to, however good or bad it is', async () => {
  // Writing and speaking are never scored by the app - scoring.writing
  // requires a qualified human - so the mechanism is straightforward: two
  // identical sittings, one submitting the release's own model answer and one
  // submitting nonsense. If the screen or anything rendered into it differs,
  // the app formed an opinion it is not entitled to have.
  const a = await openApp();
  const b = await openApp();
  assert.ok(await reachSection(a.page, 'writing'), 'never reached the writing section');
  assert.ok(await reachSection(b.page, 'writing'), 'never reached the writing section');

  const itemId = await a.page.evaluate(() => {
    const r = window.__faDebug.assessment.runs('jenn')[0];
    return r.sections.writing.plan.find(id => !r.responses[`${id}#0`]) || null;
  });
  const model = ITEMS.find(i => i.id === itemId)?.scoring?.model_response;
  assert.ok(model, `${itemId} has no model answer to submit`);

  await a.page.fill('#assess-written', model);
  await b.page.fill('#assess-written', 'zzz zzz');
  await a.page.click('[data-action="assess-submit-item"]');
  await b.page.click('[data-action="assess-submit-item"]');
  await a.page.waitForTimeout(400);
  await b.page.waitForTimeout(400);

  const stored = page => page.evaluate(() =>
    Object.values(window.__faDebug.assessment.runs('jenn')[0].responses)
      .filter(x => x.domain === 'writing').map(x => x.raw_response));
  assert.deepEqual(await stored(a.page), [model], 'the model answer was not the one submitted');
  assert.notDeepEqual(await stored(b.page), [model], 'both sittings submitted the same thing');

  const shot = page => page.evaluate(G.snapshot, '#screen-assessment');
  assert.deepEqual(G.differences(await shot(a.page), await shot(b.page)), [],
    'the screen responded to what was written');

  const log = page => page.evaluate(() => window.__renderLog
    .map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).sort());
  assert.deepEqual(await log(a.page), await log(b.page),
    'something was rendered in response to what was written');
  assert.deepEqual([...a.errors, ...b.errors], []);
});

test('no part of the game reward system is on the open sections', async () => {
  // Class and id tokens only - those are code we wrote. Item text is left
  // alone, so a prompt using one of these words cannot trip this.
  const { page } = await openApp();
  assert.ok(await reachSection(page, 'writing'), 'never reached the writing section');

  const tokens = await page.evaluate(() => {
    const out = new Set();
    const screen = document.getElementById('screen-assessment');
    for (const el of [screen, ...screen.querySelectorAll('*')]) {
      for (const c of el.classList) out.add(c);
      if (el.id) out.add('#' + el.id);
    }
    return [...out];
  });
  assert.deepEqual(tokens.filter(t =>
    /star|life|lives|heart|moon|streak|score|trophy|leaderboard|badge|reward|hint/i.test(t)), [],
    'game chrome is inside the assessment screen');
});

// ── the end of a check-in ──────────────────────────────────────────────────

test('a finished check-in offers its own way out, and says the run is over', async () => {
  // It used to offer none: the "All done" screen appended a card and stopped,
  // so the only exit was the bar's Pause button — the wrong word for a run
  // with nothing left in it, and easy to miss at the top of the screen.
  const { page, errors } = await openApp();
  await openAsParent(page);

  for (let n = 0; n < 250; n++) {
    if (!(await positionOf(page)).next) break;
    await advance(page);
  }
  assert.equal((await positionOf(page)).next, null, 'never reached the end of the check-in');

  const before = await page.evaluate(() => {
    const r = window.__faDebug.assessment.runs('jenn')[0];
    return { status: r.status, responses: Object.keys(r.responses).length };
  });
  assert.equal(before.status, 'complete', 'the run did not finish');

  const bar = await page.textContent('#screen-assessment [data-action="assess-pause"]');
  assert.equal(bar, 'Close', 'the bar still offers to pause a finished run');

  const leave = await page.$('#assess-actions [data-action="assess-pause"]');
  assert.ok(leave, 'the finished screen offers no way out of its own');
  assert.match(await leave.textContent(), /Done/);

  await leave.click();
  await page.waitForTimeout(300);

  // Back where a parent started, with the run untouched by leaving it.
  const after = await page.evaluate(() => {
    const r = window.__faDebug.assessment.runs('jenn')[0];
    return {
      onScreen: ['select', 'hub', 'assessment'].find(n =>
        document.getElementById(`screen-${n}`).style.display === 'block') ?? null,
      status: r.status, responses: Object.keys(r.responses).length,
    };
  });
  assert.notEqual(after.onScreen, 'assessment', 'leaving did not leave the check-in');
  assert.equal(after.status, before.status, 'leaving changed the run');
  assert.equal(after.responses, before.responses, 'leaving changed the answers');
  assert.deepEqual(errors, []);
});
