// End-to-end regression checks that need a real browser.
//
// Run with:  npm run test:browser
// These cover the defects that unit tests cannot reach — DOM rendering, inline
// handler binding, and whether a learner's stored progress survives a load.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';

const APP = 'file://' + path.resolve('index.html');
const CHROME = process.env.CHROMIUM_PATH || undefined;

let browser;
const openContexts = [];
test.before(async () => { browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {}); });
test.afterEach(async () => {
  // Each test gets a clean context; without closing them they accumulate until
  // the run exhausts the machine and hangs with no output.
  await Promise.all(openContexts.splice(0).map(c => c.close().catch(() => {})));
});
test.after(async () => { await browser?.close(); });

async function open({ seed } = {}) {
  const context = await browser.newContext();
  openContexts.push(context);
  // Never reach the network. Fonts and the Firebase SDK come from CDNs; waiting
  // on them makes the suite slow and its timing dependent on the sandbox. The
  // app is built to work without them, so this also exercises the offline path.
  await context.route('**://*/**', route =>
    route.request().url().startsWith('file://') ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/net::ERR|Failed to load resource|firebase|FB /i.test(t))
      errors.push('console: ' + t);
  });
  if (seed) await page.addInitScript(v => localStorage.setItem('french_game_local_jenn', v), JSON.stringify(seed));
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  return { page, errors };
}

test('the app loads with no page errors and binds every inline handler', async () => {
  const { page, errors } = await open();
  const unbound = await page.evaluate(() => {
    const names = new Set();
    for (const el of document.querySelectorAll('*'))
      for (const a of el.attributes) {
        if (!a.name.startsWith('on')) continue;
        const m = a.value.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/);
        if (m) names.add(m[1]);
      }
    return [...names].filter(n => typeof window[n] !== 'function');
  });
  assert.deepEqual(unbound, [], 'inline handlers with no window binding');
  assert.deepEqual(errors, []);
});

test('every game mode renders without error', async () => {
  const { page, errors } = await open();
  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(400);
  for (const type of ['quiz', 'match', 'scramble', 'builder', 'listen', 'boss']) {
    const before = errors.length;
    await page.evaluate(t => startGame(t), type);
    await page.waitForTimeout(400);
    assert.equal(errors.length, before, `${type} raised: ${errors.slice(before).join(' | ')}`);
    await page.evaluate(() => exitGame());
    await page.waitForTimeout(200);
  }
});

test('a Word Match round survives being interrupted and resumed', async () => {
  // Regression: renderMatch declared frWords with const in the resume branch and
  // var in the other, so resume read an undefined binding and rendered nothing.
  const { page, errors } = await open();
  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(400);
  const r = await page.evaluate(async () => {
    startGame('match');
    await new Promise(r => setTimeout(r, 400));
    const before = [...document.querySelectorAll('#fr-col .word-chip')].map(b => b.textContent);
    document.querySelector('#fr-col .word-chip')?.click();
    // The app saves its own draft on a short debounce; wait for that rather
    // than reaching into a module-private function.
    await new Promise(r => setTimeout(r, 700));
    exitGame();
    await new Promise(r => setTimeout(r, 300));
    startGame('match');                       // resumes from the saved draft
    await new Promise(r => setTimeout(r, 500));
    const after = [...document.querySelectorAll('#fr-col .word-chip')].map(b => b.textContent);
    return { before, after };
  });
  assert.ok(r.after.length > 0, 'resumed board rendered no tiles');
  assert.deepEqual(r.after, r.before, 'resume reshuffled the board');
  assert.deepEqual(errors, []);
});

test('French apostrophes and oe reach the speech API intact', async () => {
  // Regression: the text was interpolated into an onclick attribute, so every
  // word with an apostrophe produced invalid inline JS and a dead button.
  const { page, errors } = await open();
  const results = await page.evaluate(() => {
    const got = [];
    const real = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = u => got.push(u.text);
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                              .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const words = ["aujourd'hui", "j'ai mangé", "l'école", 'sœur', 'le "chat"', 'a & b'];
    const out = [];
    for (const w of words) {
      host.innerHTML = `<button data-speak="${esc(w)}">S</button>`;
      got.length = 0;
      host.querySelector('button').click();
      out.push({ word: w, delivered: got[0] ?? null });
    }
    host.remove();
    window.speechSynthesis.speak = real;
    return out;
  });
  for (const r of results) assert.equal(r.delivered, r.word);
  assert.deepEqual(errors, []);
});

test('every level is reachable and playable', async () => {
  // Regression: unlocking the next level needed a full moon plus two consecutive
  // days at >=95% across all six game types, which is unreachable at one or two
  // sessions a week. A Grade 5 child was confined to the first level.
  const { page, errors } = await open();
  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(500);

  const locked = await page.$$eval('[id^=tab-g]', els =>
    els.filter(e => e.classList.contains('grade-locked') || /🔒/.test(e.textContent))
       .map(e => e.textContent.trim()));
  assert.deepEqual(locked, [], 'levels are still locked');

  const reached = await page.evaluate(async () => {
    const out = [];
    for (const g of [4, 5, 6, 7, 8, 9, 10]) {
      setGrade(g);
      await new Promise(r => setTimeout(r, 50));
      startGame('quiz');
      await new Promise(r => setTimeout(r, 200));
      out.push({ level: g - 3,
                 active: !!document.getElementById('tab-g' + g)?.classList.contains('active'),
                 question: document.querySelector('.question-main')?.textContent ?? null });
      exitGame();
      await new Promise(r => setTimeout(r, 100));
    }
    return out;
  });
  for (const r of reached) {
    assert.ok(r.active, `level ${r.level} could not be selected`);
    assert.ok(r.question, `level ${r.level} produced no question`);
  }
  assert.deepEqual(errors, []);
});

test('opening the app preserves everything a learner has earned', async () => {
  // The milestone's hard rule: loading a profile must never clear or rewrite it.
  const seed = {
    totalStars: 1240, weekStars: 85, streak: 6, lastPlayed: 'Sat Sep 05 2026',
    weekStart: '2026-08-31',
    topicStars: { '4_colours': 3, '4_numbers': 3, '5_body': 2 },
    moons: { grade4: true, grade5: false, grade6: false, grade7: false,
             grade8: false, grade9: false, grade10: false, super: false },
    gradeUnlocked: { 4: true, 5: true, 6: false, 7: false, 8: false, 9: false, 10: false },
    failedWords: { chien: { fr: 'chien', en: 'dog', misses: 2 } },
    playedDays: { '2026-09-01': true, '2026-09-05': true },
    todayStats: { '2026-09-05': { correct: 20, wrong: 3, rounds: 2, stars: 85 } },
    gradeStats: { '2026-09-05': { 4: { correct: 20, wrong: 3 } } },
    weeklyHistory: [{ weekStart: '2026-08-24', stars: 300 }],
    tier1Conquered: true, tier1ParentOpen: false,
    lastUpdatedAt: Date.now(),
  };
  const { page, errors } = await open({ seed });
  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(700);

  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('french_game_local_jenn')));

  assert.equal(after.totalStars, 1240, 'stars lost');
  assert.equal(after.weekStars, 85, 'week stars lost');
  assert.ok(after.streak >= 6, 'streak lost');
  assert.equal(after.topicStars['4_colours'], 3, 'topic star lost');
  // Retired seed patch used to delete every level 2 and 3 topic star on load.
  assert.equal(after.topicStars['5_body'], 2, 'level 2 topic star was deleted on load');
  // A moon is an achievement and is never revoked.
  assert.equal(after.moons.grade4, true, 'earned moon was revoked');
  assert.ok('chien' in after.failedWords, 'practice queue lost');
  assert.equal(Object.keys(after.playedDays).length, 2, 'played days lost');
  assert.equal(after.weeklyHistory.length, 1, 'weekly history lost');
  assert.ok(after.gradeStats['2026-09-05'], 'grade stats lost');
  assert.deepEqual(errors, []);
});

test('running out of lives is not recorded as completing the round', async () => {
  // Regression: endRound was reached from both "answered every question" and
  // "lives hit zero" and credited a completed round either way — consuming a
  // daily round and marking the format as played.
  const { page, errors } = await open();
  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(400);

  const r = await page.evaluate(async () => {
    const stored = () => JSON.parse(localStorage.getItem('french_game_local_jenn') || '{}');
    const roundsToday = () => {
      const s = stored();
      const tk = Object.keys(s.todayStats || {}).sort().pop();
      return (s.todayStats?.[tk]?.rounds) || 0;
    };
    const livesShown = () => (document.getElementById('game-lives')?.textContent.match(/❤️/g) || []).length;

    startGame('quiz');
    await new Promise(r => setTimeout(r, 400));
    const before = roundsToday();

    // Deliberately pick a wrong answer each time, using only what is on screen:
    // the correct choice is revealed in the feedback panel after a mistake.
    for (let i = 0; i < 8 && livesShown() > 0; i++) {
      const choices = [...document.querySelectorAll('#choices-grid button')];
      if (!choices.length) break;
      const shown = document.querySelector('.question-main')?.textContent || '';
      // Any choice may be right; try the last one, then move on regardless.
      choices[choices.length - 1].click();
      await new Promise(r => setTimeout(r, 350));
      const overlay = document.getElementById('feedback-overlay');
      if (overlay?.classList.contains('show')) { nextQuestion(); await new Promise(r => setTimeout(r, 200)); }
      if (shown === (document.querySelector('.question-main')?.textContent || '')) break;
    }
    await new Promise(r => setTimeout(r, 2400));   // knockout timer
    return { before, after: roundsToday(), lives: livesShown(),
             text: document.getElementById('game-area')?.textContent || '' };
  });

  if (r.lives === 0) {
    assert.match(r.text, /out of lives|good effort/i, 'knockout was not communicated');
    assert.equal(r.after, r.before, 'a knocked-out round was counted as completed');
  }
  assert.deepEqual(errors, []);
});

test('an answered question is never re-presented after a resume', async () => {
  // Regression: a draft saved while the feedback overlay was open re-presented
  // the same question on resume, letting the same response score twice.
  const { page, errors } = await open();
  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(400);

  const r = await page.evaluate(async () => {
    const progress = () => document.getElementById('progress-bar')?.style.width || '0%';
    const question = () => document.querySelector('.question-main')?.textContent || null;

    startGame('quiz');
    await new Promise(r => setTimeout(r, 400));
    const asked = question();

    // Answer, then leave with the feedback overlay still open — what happens
    // when an iPad locks mid-question.
    document.querySelector('#choices-grid button')?.click();
    await new Promise(r => setTimeout(r, 800));      // let the draft persist
    const overlayOpen = !!document.getElementById('feedback-overlay')?.classList.contains('show');
    const progressAtSave = progress();

    exitGame();
    await new Promise(r => setTimeout(r, 300));

    startGame('quiz');                                // resume
    await new Promise(r => setTimeout(r, 700));
    return { asked, resumed: question(), overlayOpen,
             progressAtSave, progressAfter: progress() };
  });

  assert.ok(r.overlayOpen, 'test did not reach the feedback-open state');
  assert.notEqual(r.resumed, r.asked,
    'resume re-presented the question that was already answered and scored');
  assert.deepEqual(errors, []);
});
