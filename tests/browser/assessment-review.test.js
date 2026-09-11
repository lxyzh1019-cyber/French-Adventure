// Scoring the open prompts, on the parent's own screen.
//
// The three things that matter here are the three the release insists on: a
// score with nobody's name on it is refused, a response set aside is kept
// rather than marked wrong, and the model answer never reaches the person
// deciding what the child's answer is worth.
//
// Each runs against the real built page, through the real store, so what is
// proved is that the app does it — not that a module would if it were called.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import * as C from '../../src/assessment/content.js';
import * as R from '../../src/assessment/review.js';
import { administer, idsIn, storeFor, FULL_MARKS } from '../helpers/administer.js';
import * as G from '../helpers/content-guards.js';

const APP = 'file://' + path.resolve(process.env.APP_FILE || 'index.html');
const CHROME = process.env.CHROMIUM_PATH || undefined;
const PARENT_PWD = '1234';

let browser;
const openContexts = [];
test.before(async () => { browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {}); });
test.afterEach(async () => {
  await Promise.all(openContexts.splice(0).map(c => c.close().catch(() => {})));
});
test.after(async () => { await browser?.close(); });

async function open(run) {
  const context = await browser.newContext();
  openContexts.push(context);
  await context.route('**://*/**', route =>
    route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await context.addInitScript((assess) => {
    if (assess) localStorage.setItem('french_assessment_local_jenn', JSON.stringify(assess));
    window.fbInit = () => {}; window.fbSave = async () => true;
    window.fbAssessInit = () => {}; window.fbAssessSave = async () => true;
    window.fbBackupSave = async () => {}; window.fbBackupList = async () => [];
  }, run ? storeFor(run) : null);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!(window.__faDebug?.assessment && window.showParentSummary), null, { timeout: 15000 });
  return { page, errors };
}

/** Open the parent overlay and ask for the scoring screen. */
const askForReview = (page, { password = PARENT_PWD } = {}) => page.evaluate(async (pwd) => {
  showParentSummary();
  for (let i = 0; i < 100; i++) {
    const b = document.querySelector('[data-action="assess-review"]');
    if (b) {
      if (pwd !== null) document.getElementById('parent-pwd').value = pwd;
      b.click();
      break;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  await new Promise(r => setTimeout(r, 200));
  return document.getElementById('assess-review-panel').textContent;
}, password);

const panelText = page => page.evaluate(() =>
  document.getElementById('assess-review-panel').textContent.replace(/\s+/g, ' ').trim());

/**
 * The run as the device has it now, read back out of the local mirror.
 *
 * Deliberately the mirror rather than the module's in-memory copy: what matters
 * is that the scoring survived being written down, not that a variable moved.
 */
const storedRun = page => page.evaluate(() => {
  const store = JSON.parse(localStorage.getItem('french_assessment_local_jenn') || '{}');
  const runs = Object.values(store.runs || {});
  runs.sort((a, b) => (b.started_at_utc || 0) - (a.started_at_utc || 0));
  return runs[0];
});

/** Choose every anchor on one prompt's card, then press save. */
const scoreFirstWriting = (page, { name, value = 3 }) => page.evaluate(async ({ n, v }) => {
  const card = document.querySelector('.assess-review-item');
  const key = card.getAttribute('data-key');
  if (n !== null) {
    const input = document.getElementById('assess-review-scorer');
    input.value = n;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const seen = new Set();
  for (const radio of card.querySelectorAll('input[type="radio"]')) {
    const dim = radio.getAttribute('data-dim');
    if (seen.has(dim) || Number(radio.value) !== v) continue;
    radio.checked = true;
    seen.add(dim);
  }
  card.querySelector('[data-action="rev-save"]').click();
  await new Promise(r => setTimeout(r, 250));
  return { key, message: document.querySelector('.assess-review-msg')?.textContent || '' };
}, { n: name, v: value });

test('the scoring screen is behind the parent password', async () => {
  const { page } = await open(administer({ learner: 'jenn' }));
  assert.equal((await askForReview(page, { password: '' })).trim(), '',
    'the scoring screen opened without the password');
  assert.ok((await askForReview(page)).trim().length > 0, 'the scoring screen never appeared');
});

test('every open prompt is listed, with its anchors written out', async () => {
  const run = administer({ learner: 'jenn' });
  const { page, errors } = await open(run);
  await askForReview(page);
  const text = await panelText(page);

  assert.deepEqual(errors, []);
  assert.match(text, /11 of 11 still need a person/);
  for (const id of [...idsIn(run, 'writing'), ...idsIn(run, 'speaking')]) {
    assert.ok(text.includes(id), `${id} is not on the scoring screen`);
  }
  // The scale is on screen beside its buttons, not in a manual.
  const writing = C.RUBRICS.rubrics.find(r => r.id === 'WRITING-ANALYTIC-V1');
  for (const d of writing.dimensions) {
    for (const n of ['0', '1', '2', '3']) {
      assert.ok(text.includes(d.anchors[n].slice(0, 24)),
        `${d.id} anchor ${n} is missing, so the number has no meaning`);
    }
  }
});

test('a score with nobody\'s name on it is refused, and nothing is written', async () => {
  const { page } = await open(administer({ learner: 'jenn' }));
  await askForReview(page);

  const { message } = await scoreFirstWriting(page, { name: '' });
  assert.match(message, /name/i, 'the screen said nothing about the missing name');
  const run = await storedRun(page);
  assert.deepEqual(Object.keys(run.review || {}), [], 'an unattributed review was stored');
  assert.match(await panelText(page), /11 of 11 still need a person/);
});

test('a named scorer\'s numbers are stored, and the count moves', async () => {
  const { page, errors } = await open(administer({ learner: 'jenn' }));
  await askForReview(page);

  const { key } = await scoreFirstWriting(page, { name: 'Mme Tremblay', value: 2 });
  assert.deepEqual(errors, []);

  const run = await storedRun(page);
  const review = run.review[key];
  assert.equal(review.scorer_id, 'Mme Tremblay');
  assert.equal(review.rubric_id, 'WRITING-ANALYTIC-V1');
  for (const d of C.RUBRICS.rubrics.find(r => r.id === 'WRITING-ANALYTIC-V1').dimensions) {
    assert.equal(review.scores[d.id], 2, `${d.id} did not reach the record`);
  }
  assert.match(await panelText(page), /10 of 11 still need a person/);
});

test('a half-scored prompt names the box that is empty', async () => {
  const { page } = await open(administer({ learner: 'jenn' }));
  await askForReview(page);

  const message = await page.evaluate(async () => {
    const card = document.querySelector('.assess-review-item');
    const input = document.getElementById('assess-review-scorer');
    input.value = 'A parent';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // One dimension only.
    const radio = card.querySelector('input[type="radio"][value="3"]');
    radio.checked = true;
    card.querySelector('[data-action="rev-save"]').click();
    await new Promise(r => setTimeout(r, 250));
    return document.querySelector('.assess-review-msg')?.textContent || '';
  });
  assert.match(message, /has not been scored/);
  assert.deepEqual(Object.keys((await storedRun(page)).review || {}), []);
});

test('setting a response aside keeps her words and scores nothing', async () => {
  const { page, errors } = await open(administer({ learner: 'jenn' }));
  await askForReview(page);

  const before = await storedRun(page);
  const key = R.queue(before)[0].key;
  const written = before.responses[key].raw_response;
  assert.ok(written.length > 0);

  await page.evaluate(async () => {
    document.querySelector('.assess-review-item [data-action="rev-invalid"]').click();
    await new Promise(r => setTimeout(r, 250));
  });
  assert.deepEqual(errors, []);

  const after = await storedRun(page);
  assert.equal(after.responses[key].technical_invalid_reason, 'parent_invalidated');
  assert.equal(after.responses[key].raw_response, written, 'her words were destroyed');
  assert.equal(after.review?.[key], undefined, 'a set-aside response was scored');
  assert.match(await panelText(page), /Set aside/);
  assert.match(await panelText(page), /neither right nor wrong/);
});

test('marking a prompt as helped keeps it, and the report says so', async () => {
  const { page } = await open(administer({ learner: 'jenn' }));
  await askForReview(page);
  const key = R.queue(await storedRun(page))[0].key;

  await page.evaluate(async () => {
    document.querySelector('.assess-review-item [data-action="rev-support"]').click();
    await new Promise(r => setTimeout(r, 250));
  });
  const after = await storedRun(page);
  assert.equal(after.responses[key].support_flag, true);
  assert.ok(after.responses[key].raw_response.length > 0, 'a supported response was discarded');
});

test('the scoring screen never shows a model answer or an author note', async () => {
  // The whole point of the rubric is that it judges the response, not the
  // distance from a sample. A scorer holding the sample marks the distance.
  const run = administer({ learner: 'jenn' });
  const { page } = await open(run);
  await askForReview(page);

  const rendered = await page.evaluate(() => {
    const panel = document.getElementById('assess-review-panel');
    const out = [panel.textContent];
    for (const el of panel.querySelectorAll('*')) {
      for (const a of el.attributes) out.push(a.value);
    }
    return out;
  });
  const scorerFacing = C.ITEMS
    .flatMap(i => [i.scoring?.model_response, i.author_notes])
    .filter(Boolean);
  assert.deepEqual(G.leakedStrings(rendered, scorerFacing), [],
    'a model answer or an author note is on the scoring screen');

  // The same check over a page that does carry one still catches it.
  const model = C.ITEMS.find(i => i.scoring?.model_response).scoring.model_response;
  assert.deepEqual(G.leakedStrings([...rendered, model], scorerFacing), [model]);
});

test('the screen carries the release\'s own sentence about having no scorer', async () => {
  const { page } = await open(administer({ learner: 'jenn' }));
  await askForReview(page);
  const text = await panelText(page);
  assert.ok(text.includes(R.UNRESOLVED_RULE.replace(/\s+/g, ' ')),
    'the parent is not told what the release says to do when nobody can score');
});

test('scoring writes nothing to the game profile', async () => {
  // The same barrier every other assessment path is held to.
  const { page } = await open(administer({ learner: 'jenn' }));
  const before = await page.evaluate(() => localStorage.getItem('french_game_local_jenn'));
  await askForReview(page);
  await scoreFirstWriting(page, { name: 'A parent' });
  const after = await page.evaluate(() => localStorage.getItem('french_game_local_jenn'));
  assert.equal(after, before, 'scoring an answer changed the child\'s game record');
});
