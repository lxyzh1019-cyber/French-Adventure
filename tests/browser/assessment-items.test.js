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

test('choosing an answer says nothing about whether it is right', async () => {
  // administration.language. This is the guarantee a child would notice being
  // broken, and the one most easily broken by a well-meaning tick.
  const { page, errors } = await openApp();
  await intoFirstSection(page);

  const before = await screenText(page);
  await page.click('.assess-choice');
  await page.waitForTimeout(200);
  const after = await screenText(page);

  const banned = /correct|right|wrong|well done|nice|oops|try again|✅|❌|✔|✗|⭐/i;
  assert.equal(banned.test(after), false, `feedback appeared after choosing: ${after.slice(0, 200)}`);
  assert.equal(after.replace(/\s+/g, ''), before.replace(/\s+/g, ''),
    'choosing an answer changed what the screen says');

  const styling = await page.evaluate(() => {
    const b = document.querySelector('.assess-choice.chosen');
    const cs = getComputedStyle(b);
    return { border: cs.borderColor, bg: cs.backgroundColor };
  });
  // A chosen option is marked as chosen. Green or red would be a verdict.
  assert.equal(/rgb\(\s*(0|1?[0-9]?[0-9]|2[0-4][0-9]|25[0-5])\s*,\s*(1[6-9][0-9]|2[0-5][0-9])\s*,/.test(styling.border), false,
    `the chosen option is coloured like a verdict: ${styling.border}`);
  assert.deepEqual(errors, []);
});

test('submitting moves straight on, with no verdict and no reward', async () => {
  const { page, errors } = await openApp();
  await intoFirstSection(page);

  const firstId = (await run(page)).sections.listening.plan[0];
  await page.click('.assess-choice');
  await page.click('[data-action="assess-submit-item"]');
  await page.waitForTimeout(300);

  // The item's own instruction may legitimately contain words like "correct"
  // — several prompts read "choose the correct ...". What must not appear is
  // feedback ABOUT the answer, so the prompt on screen is excluded before the
  // scan; a blunt word search would flag the bank's own English.
  const { rest, prompt } = await page.evaluate(() => {
    const screen = document.getElementById('screen-assessment');
    const p = screen.querySelector('.assess-prompt')?.textContent ?? '';
    return { rest: screen.textContent.split(p).join(' '), prompt: p };
  });
  assert.ok(prompt.length > 0, 'no prompt was rendered to exclude');
  assert.equal(/\b(correct|incorrect|wrong|well done|try again)\b/i.test(rest), false,
    `a verdict appeared outside the prompt: ${rest.slice(0, 200)}`);
  assert.equal(/\b(score|points?|stars?|lives?|streak|bonus|leaderboard)\b/i.test(rest), false,
    `a reward appeared: ${rest.slice(0, 200)}`);
  assert.equal(/⭐|🌟|❤️|🏆|🌙|🎉|✅|❌/.test(rest), false, 'a reward or verdict glyph appeared');

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
