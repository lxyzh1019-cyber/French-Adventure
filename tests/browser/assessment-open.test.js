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

test('no model answer is ever rendered on screen', async () => {
  // Every open item carries a model_response for the scorer. It is an exemplar,
  // not a prompt, and a child must never see one.
  //
  // Scoped to what is DISPLAYED, not to the page source. The whole release is
  // inlined so the app works offline, so every model answer and every answer key
  // is in the file by construction — that is the accepted, documented risk in
  // known-risks.md §1c, and there is no fix without a server. What is fixable,
  // and what this checks, is that none of it is ever put in front of the child.
  const { page } = await openApp();
  assert.ok(await reachSection(page, 'writing'), 'never reached the writing section');

  const models = ITEMS.map(i => i.scoring?.model_response).filter(Boolean);
  assert.ok(models.length > 0, 'no model responses were found to check against');

  const shown = await page.evaluate(() => document.getElementById('screen-assessment').innerHTML);
  for (const m of models) {
    assert.equal(shown.includes(m), false, `a model answer is on screen: "${m}"`);
  }
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
  const { page } = await openApp();
  assert.ok(await reachSection(page, 'speaking'), 'never reached the speaking section');

  const briefed = ITEMS.filter(i => i.stimulus && String(i.stimulus.type || '').endsWith('_brief'));
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

      // The item's own prompt is excluded first. SA-D02 reads "how to go from
      // the school to the library on the map", so "school" and "library" are
      // legitimately on screen — they are the task. What must not appear is the
      // brief: its route steps, its element list, its prohibitions, its note.
      const { rest } = await page.evaluate(() => {
        const screen = document.getElementById('screen-assessment');
        const p = screen.querySelector('.assess-prompt')?.textContent ?? '';
        return { rest: screen.textContent.split(p).join(' ') };
      });
      for (const key of ['required_elements', 'required_route', 'prohibited_text']) {
        for (const phrase of item.stimulus[key] || []) {
          assert.equal(rest.toLowerCase().includes(String(phrase).toLowerCase()), false,
            `${current} printed its brief: "${phrase}"`);
        }
      }
      // The English place names must not appear outside the prompt either: the
      // map is labelled in French, and an English label would translate the
      // vocabulary the prompt is asking for.
      for (const label of item.stimulus.required_labels || []) {
        assert.equal(rest.toLowerCase().includes(String(label).toLowerCase()), false,
          `${current} shows the English place name "${label}" outside its prompt`);
      }
      if (item.stimulus.learner_view) {
        assert.equal(rest.includes(item.stimulus.learner_view), false,
          `${current} printed its learner_view note`);
      }
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

test('the open sections show no verdict, reward or score', async () => {
  const { page } = await openApp();
  assert.ok(await reachSection(page, 'writing'), 'never reached the writing section');

  const { rest, prompt } = await page.evaluate(() => {
    const screen = document.getElementById('screen-assessment');
    const p = screen.querySelector('.assess-prompt')?.textContent ?? '';
    return { rest: screen.textContent.split(p).join(' '), prompt: p };
  });
  assert.ok(prompt.length > 0, 'no prompt was rendered to exclude');
  assert.equal(/\b(correct|incorrect|wrong|well done|try again)\b/i.test(rest), false,
    `a verdict appeared: ${rest.slice(0, 200)}`);
  assert.equal(/\b(score|points?|stars?|lives?|streak|bonus|leaderboard)\b/i.test(rest), false,
    `a reward appeared: ${rest.slice(0, 200)}`);
  assert.equal(/⭐|🌟|❤️|🏆|🌙|🎉|✅|❌/.test(rest), false, 'a reward or verdict glyph appeared');
});
