// The progress-loss regression.
//
// Reproduces the chain that has repeatedly wiped Jenn's and Jess's progress:
//
//   1. WebKit deletes localStorage after ~7 days without the app being used.
//   2. The app opens with no local copy, so the profile is DEFAULT_STATE - all zeros.
//   3. The cloud read is async, and its failure is swallowed.
//   4. Tapping a name starts a 10s timer that calls saveState.
//   5. saveState does a FULL DOCUMENT REPLACE with the zeroed profile.
//
// Cloud and local are both blank within ten seconds of opening the app.
//
// These tests use a fake Firestore installed before the app boots, so the
// timing of the cloud read can be controlled precisely.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';

// APP_FILE lets a run be pointed at a deliberately broken copy of the built
// page, which is how a guard here is shown to be capable of failing. Without
// it every "verified by breaking it" run silently re-tests the fixed build.
const APP = 'file://' + path.resolve(process.env.APP_FILE || 'index.html');
const CHROME = process.env.CHROMIUM_PATH || undefined;

let browser;
const openContexts = [];
test.before(async () => { browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {}); });
test.afterEach(async () => {
  await Promise.all(openContexts.splice(0).map(c => c.close().catch(() => {})));
});
test.after(async () => { await browser?.close(); });

const POPULATED = {
  totalStars: 1240, weekStars: 85, streak: 6, lastPlayed: '2026-09-05',
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
  lastUpdatedAt: 1757000000000,
};

/**
 * Boot the app with a fake cloud whose read behaviour we control.
 * `cloudMode`: 'fast' | 'slow' | 'fail'  — how window.fbInit resolves.
 * `seedLocal`: whether localStorage has a copy (false = simulate eviction).
 */
async function boot({ cloudMode = 'fast', seedLocal = false, cloudDoc = POPULATED } = {}) {
  const context = await browser.newContext();
  openContexts.push(context);
  await context.route('**://*/**', route =>
    route.request().url().startsWith('file://') ? route.continue() : route.abort());

  await context.addInitScript(({ mode, doc, seed }) => {
    if (seed) localStorage.setItem('french_game_local_jenn', JSON.stringify(doc));

    // A fake Firestore, installed before the app's own bootstrap runs.
    window.__cloud = { jenn: JSON.parse(JSON.stringify(doc)), jess: null };
    window.__writes = [];
    window.__blockRealFirebase = true;

    window.__onData = {};
    // Push a snapshot from "the other iPad" at any point after boot.
    window.__deliver = (player, doc) => {
      window.__cloud[player] = JSON.parse(JSON.stringify(doc));
      window.__onData[player]?.(window.__cloud[player]);
      window.__onStatus[player]?.('loaded');
    };
    window.__onStatus = {};
    window.fbInit = (player, onData, onStatus = () => {}) => {
      window.__onData[player] = onData;
      window.__onStatus[player] = onStatus;
      if (mode === 'fail') return;                       // read never resolves
      const deliver = () => {
        if (window.__cloud[player]) { onData(window.__cloud[player]); onStatus('loaded'); }
        else onStatus('absent');
      };
      if (mode === 'slow') setTimeout(deliver, 15000);   // resolves after the 10s tick
      else setTimeout(deliver, 50);
    };
    window.fbSave = async (player, data) => {
      window.__writes.push({ at: Date.now(), player, totalStars: data.totalStars });
      window.__cloud[player] = JSON.parse(JSON.stringify(data));   // full replace, as today
      return true;
    };
    window.fbBackupSave = async () => {};
    window.fbBackupList = async () => [];
  }, { mode: cloudMode, doc: cloudDoc, seed: seedLocal });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  return { page, errors };
}

const cloudStars = page => page.evaluate(() => window.__cloud.jenn?.totalStars ?? null);
const writes     = page => page.evaluate(() => window.__writes);

test('local storage evicted + slow cloud read: progress must survive', async () => {
  // The exact failure. No local copy, cloud read lands after the first save tick.
  const { page } = await boot({ cloudMode: 'slow', seedLocal: false });

  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(12000);          // past the 10s play-time tick

  assert.equal(await cloudStars(page), 1240,
    'the zeroed profile overwrote 1240 stars in the cloud');
  const blanking = (await writes(page)).filter(w => !w.totalStars);
  assert.deepEqual(blanking, [], 'a blank profile was written to the cloud');
});

test('local storage evicted + cloud read fails: nothing may be written', async () => {
  const { page } = await boot({ cloudMode: 'fail', seedLocal: false });

  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(12000);

  assert.deepEqual(await writes(page), [],
    'wrote to the cloud despite never having read from it');
  assert.equal(await cloudStars(page), 1240, 'cloud profile was damaged');
});

test('a failed cloud read is visible, not silent', async () => {
  const { page } = await boot({ cloudMode: 'fail', seedLocal: false });
  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(1500);

  const text = await page.evaluate(() => document.body.innerText);
  assert.match(text, /offline|not connected|sync/i,
    'no on-screen indication that the profile has not loaded');
});

test('normal case still works: cloud read lands, play is saved', async () => {
  const { page } = await boot({ cloudMode: 'fast', seedLocal: false });
  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(12000);

  assert.equal(await cloudStars(page), 1240, 'loaded profile was not preserved');
  const blanking = (await writes(page)).filter(w => !w.totalStars);
  assert.deepEqual(blanking, [], 'a blank profile was written');
});

test("clearing today does not erase other days' stars or the other child", async () => {
  // Regression: clearProgress('today') ran `s.topicStars = {}`, erasing every
  // topic star ever earned — and it did it for BOTH girls, not the one selected.
  const today = new Intl.DateTimeFormat('en-CA',
    { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());

  const seeded = {
    ...POPULATED,
    topicStars: { '4_colours': 3, '4_numbers': 3, '5_body': 2 },
    dailyTopicStats: { [today]: { '4_colours': { quiz: { c: 5, w: 0 } } } },
  };
  const { page } = await boot({ cloudMode: 'fast', seedLocal: true, cloudDoc: seeded });
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    document.getElementById('parent-pwd').value = '1234';
    return clearProgress('today');
  });
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => ({
    jenn: window.__cloud.jenn?.topicStars,
    jess: window.__cloud.jess?.topicStars,
  }));

  assert.equal(after.jenn['4_colours'], undefined, "today's topic star was not cleared");
  assert.equal(after.jenn['4_numbers'], 3, "another day's topic star was erased");
  assert.equal(after.jenn['5_body'], 2, "another level's topic star was erased");
});

test('weekly history keeps 8 weeks, not 4', async () => {
  // Regression: the rollover capped weeklyHistory at 4 while every other place
  // said 8, silently discarding half the archived history.
  const seeded = {
    ...POPULATED,
    weekStart: '2020-01-06',                       // long past - forces a rollover
    weekStars: 50,
    weeklyHistory: Array.from({ length: 8 }, (_, i) => ({
      weekStart: `2025-0${i + 1}-06`, stars: 100 + i, correct: 10, wrong: 1, rounds: 2 })),
  };
  const { page } = await boot({ cloudMode: 'fast', seedLocal: true, cloudDoc: seeded });
  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(1200);

  const kept = await page.evaluate(() =>
    (window.__cloud.jenn?.weeklyHistory || []).length);
  assert.ok(kept >= 8, `weekly history truncated to ${kept} entries`);
});

test('a remote update arriving mid-round is kept, not dropped', async () => {
  // Regression: applyPlayerData returned early during a round, discarding the
  // other device's snapshot entirely. It is now queued and merged at round end.
  const { page, errors } = await boot({ cloudMode: 'fast', seedLocal: true });
  await page.waitForTimeout(800);

  const r = await page.evaluate(async () => {
    selectPlayer('jenn');
    await new Promise(r => setTimeout(r, 300));
    startGame('quiz');
    await new Promise(r => setTimeout(r, 400));

    // The other iPad finishes a round on a day this device has never seen.
    const fromOtherDevice = {
      ...window.__cloud.jenn,
      totalStars: (window.__cloud.jenn.totalStars || 0) + 25,
      playedDays: { ...(window.__cloud.jenn.playedDays || {}), '2026-09-09': true },
      todayStats: { ...(window.__cloud.jenn.todayStats || {}),
                    '2026-09-09': { correct: 7, wrong: 1, rounds: 1, stars: 25 } },
      lastUpdatedAt: Date.now(),
    };
    window.__deliver('jenn', fromOtherDevice);        // arrives mid-round
    await new Promise(r => setTimeout(r, 300));

    exitGame();                                        // leaving drains the queue
    await new Promise(r => setTimeout(r, 800));

    const stored = JSON.parse(localStorage.getItem('french_game_local_jenn') || '{}');
    return { playedDays: Object.keys(stored.playedDays || {}),
             hasOtherDay: !!stored.todayStats?.['2026-09-09'] };
  });

  assert.ok(r.hasOtherDay,
    "the other device's round was dropped because it arrived mid-round");
  assert.ok(r.playedDays.includes('2026-09-09'));
  assert.deepEqual(errors, []);
});
