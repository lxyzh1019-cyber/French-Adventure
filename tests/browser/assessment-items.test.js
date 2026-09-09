// Administering objective items in a real page.
//
// The rules this file exists to hold the app to, all from
// content/releases/assessment-v1/assessment_rules.json:
//
//   administration.language   no translations, hints, correctness feedback,
//                             lives, stars, bonuses or leaderboard effects
//   audio.transcript_visibility  hidden until the section is submitted
//   replay.listening_max_plays   two, counted
//   replay.technical_replay      silence does not consume a play
//   invalidity.rule              invalid is excluded, never converted to wrong
//   pause_resume.resume          a submitted item is never re-presented

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import * as G from '../helpers/content-guards.js';

// The bank, read from disk. The page cannot be asked what it is hiding.
const ITEMS = JSON.parse(
  readFileSync('content/releases/assessment-v1/assessment_items.json', 'utf8')).items;

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

async function openApp() {
  const context = await browser.newContext();
  openContexts.push(context);
  await context.route('**://*/**', route =>
    route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await context.addInitScript(G.recordRendering);
  await context.addInitScript(() => {
    window.fbInit = () => {}; window.fbSave = async () => true;
    window.fbAssessInit = () => {}; window.fbAssessSave = async () => true;
    window.fbBackupSave = async () => {}; window.fbBackupList = async () => [];
    // Record what the page tries to speak, and never actually speak it.
    window.__spoken = [];
    const synth = window.speechSynthesis;
    if (synth) {
      synth.speak = u => { window.__spoken.push(u.text); };
      synth.cancel = () => {};
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!(window.__faDebug?.assessment && window.showParentSummary), null, { timeout: 15000 });
  return { page, errors };
}

/** Open the assessment and start the first section. */
async function intoFirstSection(page, player = 'jenn') {
  await page.evaluate(async ({ player, pwd }) => {
    showParentSummary();
    for (let i = 0; i < 100; i++) {
      const b = document.querySelector(`[data-action="assess-open"][data-player="${player}"]`);
      if (b) { document.getElementById('parent-pwd').value = pwd; b.click(); break; }
      await new Promise(r => setTimeout(r, 50));
    }
    for (let i = 0; i < 100; i++) {
      if (window.__faDebug.assessment.runs(player).length) break;
      await new Promise(r => setTimeout(r, 50));
    }
    await window.__faDebug.assessment.beginSection();
  }, { player, pwd: PARENT_PWD });
  await page.waitForSelector('#screen-assessment .assess-card', { timeout: 5000 });
}

const screenText = page => page.evaluate(() => document.getElementById('screen-assessment').textContent);
const run = page => page.evaluate(() => window.__faDebug.assessment.runs('jenn')[0]);

test('a listening item plays its script and never shows it', async () => {
  // A listening item that displays its script is a reading item.
  // audio.transcript_visibility is hidden_until_section_submitted.
  const { page, errors } = await openApp();
  await intoFirstSection(page);

  const firstId = (await run(page)).sections.listening.plan[0];
  const script = ITEMS.find(i => i.id === firstId)?.audio?.script_fr_ca;
  assert.ok(script, `${firstId} has no audio script to hide`);

  assert.equal((await screenText(page)).includes(script), false,
    'the listening script was on screen before playing');

  await page.click('[data-action="assess-play"]');
  await page.waitForTimeout(200);

  const spoken = await page.evaluate(() => window.__spoken);
  assert.deepEqual(spoken, [script], 'the item did not play its reviewed script');
  assert.equal((await screenText(page)).includes(script), false,
    'playing the audio revealed its script');
  assert.deepEqual(errors, []);
});

test('no listening item shows written French anywhere on screen', async () => {
  // The whole section, not just the first item: a single leaked stimulus would
  // turn one listening measurement into a reading one.
  const { page } = await openApp();
  await intoFirstSection(page);

  const plan = (await run(page)).sections.listening.plan;
  for (let i = 0; i < plan.length; i++) {
    const item = ITEMS.find(x => x.id === plan[i]);
    const text = await screenText(page);
    assert.equal(text.includes(item.audio.script_fr_ca), false,
      `${item.id} showed its script`);
    if (item.stimulus?.text_fr) {
      assert.equal(text.includes(item.stimulus.text_fr), false,
        `${item.id} showed written French`);
    }
    await page.click('.assess-choice');
    await page.click('[data-action="assess-submit-item"]');
    await page.waitForTimeout(220);
  }
});

test('a listening item allows exactly two plays', async () => {
  // replay.listening_max_plays
  const { page } = await openApp();
  await intoFirstSection(page);

  const counts = [];
  for (let i = 0; i < 3; i++) {
    const disabled = await page.evaluate(() =>
      document.querySelector('[data-action="assess-play"]')?.disabled ?? true);
    counts.push(disabled);
    if (!disabled) { await page.click('[data-action="assess-play"]'); await page.waitForTimeout(150); }
  }
  assert.deepEqual(counts, [false, false, true], 'the two-play cap was not enforced');
  const spoken = await page.evaluate(() => window.__spoken.length);
  assert.equal(spoken, 2, 'more plays happened than the cap allows');
});

test('reporting silence does not consume a play, and is not a wrong answer', async () => {
  // replay.technical_replay and invalidity.rule
  const { page } = await openApp();
  await intoFirstSection(page);

  await page.click('[data-action="assess-play"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="assess-no-sound"]');
  await page.waitForTimeout(150);

  await page.click('[data-action="assess-submit-item"]');
  await page.waitForTimeout(250);

  const r = await run(page);
  const first = r.sections.listening.plan[0];
  const resp = r.responses[`${first}#0`];
  assert.ok(resp, 'nothing was recorded');
  assert.equal(resp.technical_invalid_reason, 'audio_failed');
  assert.equal(resp.scored_valid, false, 'an invalid response was scored');
  assert.equal(resp.scored_correct, undefined, 'silence was recorded as an answer');
  assert.equal(resp.audio_play_count, 1, 'the silent replay consumed a play');
});

const snap = (page, sel) => page.evaluate(G.snapshot, sel);
const renderLog = page => page.evaluate(() =>
  window.__renderLog.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).sort());

/** Open a sitting and stop on the first listening item. */
async function firstItem(page) {
  await intoFirstSection(page);
  return (await run(page)).sections.listening.plan[0];
}

test('choosing an answer says nothing about whether it is right', async () => {
  // administration.language, tested by mechanism rather than by vocabulary.
  // Several prompts legitimately read "choose the correct ...", so a word scan
  // flags the bank's own English (tests/fixtures/guard-regressions). Instead:
  // two identical sittings, one choosing the key's answer and one choosing a
  // distractor. Nothing at all may differ except which option is marked chosen.
  const a = await openApp();
  const b = await openApp();
  const id = await firstItem(a.page);
  assert.equal(await firstItem(b.page), id, 'the two sittings were not given the same item');

  const item = ITEMS.find(i => i.id === id);
  const key = item.answer_key?.correct_choice_ids || [];
  const right = key[0];
  const wrong = item.choices.map(c => c.id).find(c => !key.includes(c));
  assert.ok(right && wrong, `${id} has no right and wrong pair to compare`);

  await a.page.click(`[data-choice="${right}"]`);
  await b.page.click(`[data-choice="${wrong}"]`);
  await a.page.waitForTimeout(200);
  await b.page.waitForTimeout(200);

  const fullA = await snap(a.page, '#screen-assessment');
  const fullB = await snap(b.page, '#screen-assessment');

  // Everything but the options: identical, to the pixel colour.
  assert.deepEqual(G.differences(G.prune(fullA, 'assess-choices'), G.prune(fullB, 'assess-choices')), [],
    'the screen changed according to whether the answer was right');

  // The options, compared by role rather than by position. A different button
  // is chosen in each sitting, and it is allowed to look chosen.
  const optionsA = G.nodesWithClass(fullA, 'assess-choice');
  const optionsB = G.nodesWithClass(fullB, 'assess-choice');
  const chosenIn = list => list.find(n => n.classes.includes('chosen'));
  const restOf = list => list.filter(n => !n.classes.includes('chosen'));
  assert.ok(chosenIn(optionsA) && chosenIn(optionsB), 'neither sitting marked a choice as chosen');

  // Its own label and id aside, being chosen looks the same whether the option
  // chosen was the key's or a distractor.
  const IDENTITY = { ignoreAttrs: ['data-choice'], ignoreText: true };
  assert.deepEqual(G.differences(chosenIn(optionsA), chosenIn(optionsB), IDENTITY), [],
    'the chosen option is styled according to whether it is right');

  // And every option left unchosen looks like every other, across both
  // sittings - so the key's answer is not marked out in the sitting that
  // missed it.
  const reference = restOf(optionsA)[0];
  for (const other of [...restOf(optionsA), ...restOf(optionsB)]) {
    assert.deepEqual(G.differences(reference, other, IDENTITY), [],
      'an option that was not chosen is drawn differently from the others');
  }

  assert.deepEqual([...a.errors, ...b.errors], []);
});

test('submitting says nothing either, not even in passing', async () => {
  // The same two sittings, submitted. The next screen must be identical, and
  // so must everything that was put into the screen along the way - a verdict
  // that appears and is taken away again is still a verdict.
  const a = await openApp();
  const b = await openApp();
  const id = await firstItem(a.page);
  assert.equal(await firstItem(b.page), id);

  const item = ITEMS.find(i => i.id === id);
  const key = item.answer_key?.correct_choice_ids || [];
  const wrong = item.choices.map(c => c.id).find(c => !key.includes(c));

  await a.page.click(`[data-choice="${key[0]}"]`);
  await b.page.click(`[data-choice="${wrong}"]`);
  await a.page.click('[data-action="assess-submit-item"]');
  await b.page.click('[data-action="assess-submit-item"]');

  const settled = page => page.waitForFunction(() => {
    const r = window.__faDebug.assessment.runs('jenn')[0];
    return Object.keys(r.responses).length === 1
      && window.__faDebug.assessment.currentItemId?.() !== null;
  }, null, { timeout: 5000 });
  await settled(a.page);
  await settled(b.page);
  await a.page.waitForTimeout(250);
  await b.page.waitForTimeout(250);

  // The answers really did differ, so the comparison means something.
  const scored = page => page.evaluate(() =>
    Object.values(window.__faDebug.assessment.runs('jenn')[0].responses)[0].scored_correct);
  assert.equal(await scored(a.page), true, 'the key answer was not recorded as correct');
  assert.equal(await scored(b.page), false, 'the distractor was not recorded as incorrect');

  assert.deepEqual(
    G.differences(await snap(a.page, '#screen-assessment'),
      await snap(b.page, '#screen-assessment')), [],
    'the next screen showed how the last answer went');

  assert.deepEqual(await renderLog(a.page), await renderLog(b.page),
    'something was rendered into the screen and taken away again');
  assert.deepEqual([...a.errors, ...b.errors], []);
});

test('no part of the game reward system is on the assessment screen', async () => {
  // administration.language again: no lives, stars, bonuses or leaderboard.
  // This reads class and id tokens - which are code, written by us - and never
  // the item text, so an item that happens to use one of these words in its
  // own English cannot trip it.
  const { page } = await openApp();
  await intoFirstSection(page);

  const tokens = await page.evaluate(() => {
    const out = new Set();
    const screen = document.getElementById('screen-assessment');
    for (const el of [screen, ...screen.querySelectorAll('*')]) {
      for (const c of el.classList) out.add(c);
      if (el.id) out.add('#' + el.id);
    }
    return [...out];
  });
  const rewardish = tokens.filter(t =>
    /star|life|lives|heart|moon|streak|score|trophy|leaderboard|badge|reward|hint/i.test(t));
  assert.deepEqual(rewardish, [], 'game chrome is inside the assessment screen');

  const firstId = (await run(page)).sections.listening.plan[0];
  await page.click('.assess-choice');
  await page.click('[data-action="assess-submit-item"]');
  await page.waitForTimeout(300);

  const r = await run(page);
  assert.ok(r.responses[`${firstId}#0`], 'the answer was not recorded');
  assert.equal(r.exposure[firstId]?.shown_count, 1, 'the item was not recorded as shown');
});

test('an answered item is never presented again', async () => {
  // pause_resume.resume
  const { page } = await openApp();
  await intoFirstSection(page);

  const seen = [];
  for (let i = 0; i < 4; i++) {
    const id = await page.evaluate(() => window.__faDebug.assessment.currentItemId?.() ?? null);
    const r = await run(page);
    const answered = Object.keys(r.responses).length;
    seen.push(answered);
    const hasChoice = await page.$('.assess-choice');
    if (hasChoice) await page.click('.assess-choice');
    else await page.fill('#assess-typed', 'test');
    await page.click('[data-action="assess-submit-item"]');
    await page.waitForTimeout(250);
  }
  const r = await run(page);
  const ids = Object.keys(r.responses);
  assert.equal(new Set(ids).size, ids.length, 'an item was answered twice');
  assert.equal(ids.length, 4, 'four answers were not recorded');
});

test('answering the entry block routes, and the routed items are appended', async () => {
  // objective_routing: routing runs only once the whole entry block is in.
  const { page } = await openApp();
  await intoFirstSection(page);

  const entry = (await run(page)).sections.listening.plan.length;
  for (let i = 0; i < entry; i++) {
    const hasChoice = await page.$('.assess-choice');
    if (hasChoice) await page.click('.assess-choice');
    await page.click('[data-action="assess-submit-item"]');
    await page.waitForTimeout(220);
  }
  const r = await run(page);
  const s = r.sections.listening;
  assert.ok(s.routing_decision, 'routing did not run after the entry block');
  assert.ok(s.plan.length > entry, 'no items were appended by routing');
  assert.ok(s.routed_at_utc > 0, 'the routing decision was not timestamped');
});

test('a typed item does not let the keyboard supply the accent it is testing', async () => {
  // iOS predictive text turns "ou" into "où", which is exactly the distinction
  // VGA-F04 measures. These attributes are the only lever a web page has, and
  // they are NOT sufficient on their own — the QuickType bar cannot be
  // suppressed from a page at all, so the iPad checklist also asks the parent
  // to turn Auto-Correction off. This test pins the part code can do.
  const { page } = await openApp();
  await intoFirstSection(page);

  // Walk to the words section, where the typed items are.
  const answerEverything = async (limit = 60) => {
    for (let n = 0; n < limit; n++) {
      const typed = await page.$('#assess-typed');
      if (typed) return true;
      const choice = await page.$('.assess-choice');
      if (choice) { await choice.click(); }
      const submit = await page.$('[data-action="assess-submit-item"]:not([disabled])');
      if (submit) { await submit.click(); await page.waitForTimeout(160); continue; }
      const finish = await page.$('[data-action="assess-finish-section"]');
      if (finish) { await finish.click(); await page.waitForTimeout(160); }
      const begin = await page.$('[data-action="assess-begin-section"]');
      if (begin) { await begin.click(); await page.waitForTimeout(160); }
    }
    return !!(await page.$('#assess-typed'));
  };

  const reached = await answerEverything();
  assert.ok(reached, 'never reached a typed item');

  const attrs = await page.evaluate(() => {
    const i = document.getElementById('assess-typed');
    return {
      autocomplete: i.getAttribute('autocomplete'),
      autocorrect: i.getAttribute('autocorrect'),
      autocapitalize: i.getAttribute('autocapitalize'),
      spellcheck: i.getAttribute('spellcheck'),
    };
  });
  assert.deepEqual(attrs, {
    autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
  }, 'the typed input lets the keyboard help');
});
