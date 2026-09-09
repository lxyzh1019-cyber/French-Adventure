// The assessment shell in a real page: entry, form, resume, and separation.
//
// Two things matter most here, and neither can be proven by a unit test:
// that a run survives the page going away and comes back to the same place,
// and that the assessment leaves the game's records alone.
//
// Run with:  npm run test:browser

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';

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

/** A populated game profile, so "the profile was not touched" has something to be about. */
const PROFILE = {
  schemaVersion: 3, totalStars: 1240, weekStars: 90, streak: 4,
  topicStars: { '4_colours': 3 }, moons: { grade4: true },
  playedDays: { '2026-09-08': true },
  todayStats: { '2026-09-08': { correct: 10, wrong: 2, rounds: 2, stars: 60 } },
  lastUpdatedAt: Date.now(),
};

async function open({ seedProfile = true, seedAssessment = null, reuse = null } = {}) {
  const context = reuse || await browser.newContext();
  if (!reuse) {
    openContexts.push(context);
    await context.route('**://*/**', route =>
      route.request().url().startsWith('file://') ? route.continue() : route.abort());
    await context.addInitScript(({ profile, assess }) => {
      if (profile) localStorage.setItem('french_game_local_jenn', JSON.stringify(profile));
      if (assess) localStorage.setItem('french_assessment_local_jenn', JSON.stringify(assess));
      // No cloud: these tests are about local behaviour, and the barrier must
      // hold writes rather than lose them when the SDK never loads.
      window.fbInit = () => {}; window.fbSave = async () => true;
      window.fbAssessInit = () => {}; window.fbAssessSave = async () => true;
      window.fbBackupSave = async () => {}; window.fbBackupList = async () => [];
    }, { profile: seedProfile ? PROFILE : null, assess: seedAssessment });
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  // Wait for the app to be ready rather than sleeping a fixed amount. A fixed
  // delay passes on an idle machine and fails on a busy one, which is how a
  // timing assumption gets mistaken for a flaky test.
  await page.waitForFunction(
    () => !!(window.__faDebug && window.__faDebug.assessment && window.showParentSummary),
    null, { timeout: 15000 });
  return { page, context, errors };
}

/** Open the assessment the way a parent does: password, then the button. */
const startAsParent = (page, player = 'jenn', pwd = PARENT_PWD) => page.evaluate(async ({ player, pwd }) => {
  showParentSummary();
  const btn = await (async () => {
    for (let i = 0; i < 100; i++) {
      const b = document.querySelector(`[data-action="assess-open"][data-player="${player}"]`);
      if (b) return b;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('the parent entry button never rendered');
  })();
  document.getElementById('parent-pwd').value = pwd;
  btn.click();

  // Wait for the LAST thing openAssessment does, not the first.
  //
  // It creates the run inside store.update, which makes it visible
  // synchronously, then awaits the save, and only then calls showScreen. So the
  // run existing does not mean the open has finished — waiting on it returned
  // mid-flight with the screen still hidden. The original condition was worse
  // still: "run OR screen" could return with neither, and the caller then
  // dereferenced runs[0] and got a TypeError instead of a readable failure.
  // That is what went red in CI, where a concurrent job made the gap wide
  // enough to land in.
  //
  // A wrong password is a legitimate outcome with no run and no screen, so this
  // waits, then reports both facts and lets the caller decide.
  for (let i = 0; i < 200; i++) {
    if (document.getElementById('screen-assessment').style.display === 'block') break;
    await new Promise(r => setTimeout(r, 50));
  }
  return {
    screenShown: document.getElementById('screen-assessment').style.display,
    runs: window.__faDebug.assessment.runs(player).length,
  };
}, { player, pwd });

/** Start as the parent and insist a run was actually created. */
async function startAsParentOrFail(page, player = 'jenn') {
  const r = await startAsParent(page, player);
  assert.equal(r.screenShown, 'block', `the assessment screen never opened for ${player}`);
  assert.equal(r.runs, 1, `no run was created for ${player}`);
  return r;
}

test('the assessment cannot be opened without the parent password', async () => {
  // Exposure is permanent and each form is 45 items. A child who wanders in
  // spends a measurement.
  const { page, errors } = await open();
  const r = await startAsParent(page, 'jenn', 'wrong');
  assert.equal(r.runs, 0, 'a run was started without the parent password');
  assert.notEqual(r.screenShown, 'block', 'the assessment screen opened anyway');
  assert.deepEqual(errors, []);
});

test('a parent can start a run, and the learners get the forms the rules name', async () => {
  const { page, errors } = await open();
  const r = await startAsParent(page, 'jenn');
  assert.equal(r.screenShown, 'block');
  assert.equal(r.runs, 1);

  const run = await page.evaluate(() => window.__faDebug.assessment.runs('jenn')[0]);
  assert.equal(run.form, 'A', 'jenn should sit form A');
  assert.equal(run.status, 'in_progress');
  assert.equal(run.release_id, 'assessment-v1.0.1');
  assert.deepEqual(errors, []);
});

test('jess sits the other form', async () => {
  const { page } = await open();
  await startAsParentOrFail(page, 'jess');
  const run = await page.evaluate(() => window.__faDebug.assessment.runs('jess')[0]);
  assert.equal(run.form, 'B');
});

test('opening twice resumes the same run rather than starting a second', async () => {
  const { page } = await open();
  await startAsParentOrFail(page, 'jenn');
  const first = await page.evaluate(() => window.__faDebug.assessment.runs('jenn')[0].run_id);
  await page.evaluate(() => window.__faDebug.assessment.pause());
  await page.waitForTimeout(200);
  await startAsParent(page, 'jenn');
  const runs = await page.evaluate(() => window.__faDebug.assessment.runs('jenn'));
  assert.equal(runs.length, 1, 'a second run was started for the same learner');
  assert.equal(runs[0].run_id, first);
});

test('a started section survives the page going away', async () => {
  // The real test of resume: not a soft navigation, but the app booting again
  // from what the device holds.
  //
  // What the device holds is captured verbatim from the first page and given
  // back to a fresh one. That is deliberate. Reopening a tab in the same
  // browser context made this test depend on Chromium committing localStorage
  // before the renderer died, which is not this app's behaviour and is exactly
  // what went red on a loaded CI runner while the same commit passed on an idle
  // one. The two claims are now separate and both are checked: the app writes a
  // mirror that fully describes the run, and the app boots from such a mirror
  // and resumes the same run rather than starting a new one.
  const { page } = await open();
  await startAsParentOrFail(page, 'jenn');
  const before = await page.evaluate(async () => {
    await window.__faDebug.assessment.beginSection();
    const run = window.__faDebug.assessment.runs('jenn')[0];
    return { runId: run.run_id, form: run.form, plan: run.sections.listening.plan,
             status: run.sections.listening.status };
  });
  assert.ok(before.plan.length > 0, 'no section plan was frozen');

  // The mirror, exactly as the app wrote it.
  const mirror = await page.evaluate(() => {
    const raw = localStorage.getItem('french_assessment_local_jenn');
    return raw ? JSON.parse(raw) : null;
  });
  assert.ok(mirror, 'the run never reached this device\'s storage');
  const mirrored = Object.values(mirror.runs || {})[0];
  assert.ok(mirrored, 'the mirror holds no run');
  assert.equal(mirrored.run_id, before.runId);
  assert.deepEqual(mirrored.sections?.listening?.plan ?? [], before.plan,
    'the mirror disagrees with memory');
  await page.close();

  // A restarted device: nothing in memory, that mirror on disk.
  const { page: page2 } = await open({ seedAssessment: mirror });
  await page2.waitForFunction(
    () => window.__faDebug.assessment.runs('jenn').length === 1, null, { timeout: 20000 });
  const after = await page2.evaluate(() => {
    const run = window.__faDebug.assessment.runs('jenn')[0];
    return { runId: run.run_id, form: run.form, plan: run.sections.listening.plan,
             status: run.sections.listening.status };
  });
  assert.equal(after.runId, before.runId, 'the run was not the same one');
  assert.equal(after.form, before.form, 'the form changed across a reload');
  assert.deepEqual(after.plan, before.plan, 'the section was re-planned on resume');
  assert.equal(after.status, before.status);

  // And opening the assessment again continues it instead of starting another.
  await startAsParent(page2, 'jenn');
  const runs = await page2.evaluate(() => window.__faDebug.assessment.runs('jenn'));
  assert.equal(runs.length, 1, 'a second run was started after the restart');
  assert.equal(runs[0].run_id, before.runId);
});

test('a run started on another device is picked up, not replaced', async () => {
  // The store on disk stands in for what the other iPad synced.
  const seeded = {
    assessmentSchemaVersion: 1, learner_id: 'jenn', lastUpdatedAt: Date.now(),
    runs: { run_other: {
      run_id: 'run_other', learner_id: 'jenn', release_id: 'assessment-v1.0.1', form: 'A',
      started_at_utc: Date.now() - 60000, status: 'in_progress',
      section_order: ['listening', 'reading', 'vocabulary_grammar', 'writing', 'speaking'],
      sections: { listening: { domain: 'listening', status: 'in_progress',
                               plan: ['LA-D01', 'LA-D02', 'LA-D03', 'LA-D04'],
                               entry_tier: 'developing', entry_count: 4 } },
      responses: { 'LA-D01#0': { item_id: 'LA-D01', domain: 'listening', scored_correct: true,
                                 response_submitted_at_utc: Date.now() - 30000 } },
      exposure: {}, review: {},
    } },
  };
  const { page } = await open({ seedAssessment: seeded });
  const r = await startAsParent(page, 'jenn');
  assert.equal(r.runs, 1, 'the other device\'s run was not adopted');
  const run = await page.evaluate(() => window.__faDebug.assessment.runs('jenn')[0]);
  assert.equal(run.run_id, 'run_other');
  assert.ok(run.responses['LA-D01#0'], 'the answer from the other device was lost');
});

test('running an assessment leaves the game profile alone', async () => {
  // The separation the whole data model exists for.
  const { page, errors } = await open();
  const before = await page.evaluate(() => localStorage.getItem('french_game_local_jenn'));
  await startAsParent(page, 'jenn');
  await page.evaluate(async () => { await window.__faDebug.assessment.beginSection(); });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => localStorage.getItem('french_game_local_jenn'));

  const b = JSON.parse(before), a = JSON.parse(after);
  delete b.lastUpdatedAt; delete a.lastUpdatedAt;
  delete b.dailyTimeMs; delete a.dailyTimeMs;
  assert.deepEqual(a, b, 'the assessment changed the game profile');
  assert.equal(a.totalStars, 1240, 'stars moved');
  assert.deepEqual(errors, []);
});

test('the assessment writes only to its own storage key', async () => {
  const { page } = await open();
  await startAsParent(page, 'jenn');
  await page.evaluate(async () => { await window.__faDebug.assessment.beginSection(); });
  const stored = await page.evaluate(() => localStorage.getItem('french_assessment_local_jenn'));
  assert.ok(stored, 'nothing was mirrored to the assessment key');
  const parsed = JSON.parse(stored);
  assert.equal(Object.keys(parsed.runs).length, 1);
  assert.ok(parsed.runs[Object.keys(parsed.runs)[0]].sections.listening.plan.length > 0);
});

test('the assessment screen offers no hint, reward or leaderboard', async () => {
  // administration.language: "No translations, hints, correctness feedback,
  // lives, stars, bonuses, or leaderboard effects."
  const { page, errors } = await open();
  await startAsParent(page, 'jenn');
  await page.evaluate(async () => { await window.__faDebug.assessment.beginSection(); });
  await page.waitForTimeout(200);

  const found = await page.evaluate(() => {
    const screen = document.getElementById('screen-assessment');
    const text = screen.textContent;
    return {
      banned: ['⭐', '🌟', '❤️', '🏆', '🌙'].filter(g => text.includes(g)),
      words: ['hint', 'streak', 'bonus', 'leaderboard', 'lives', 'correct!']
        .filter(w => text.toLowerCase().includes(w)),
      hintPanelVisible: document.getElementById('hint-panel')?.classList.contains('show') ?? false,
      // The game's own score strip must not be on this screen.
      hasScoreStrip: !!screen.querySelector('#game-score, #game-lives'),
    };
  });
  assert.deepEqual(found.banned, [], `reward glyphs on the assessment screen: ${found.banned}`);
  assert.deepEqual(found.words, [], `game language on the assessment screen: ${found.words}`);
  assert.equal(found.hintPanelVisible, false);
  assert.equal(found.hasScoreStrip, false);
  assert.deepEqual(errors, []);
});

test('every control on the assessment screen is a real iPad touch target', async () => {
  const context = await browser.newContext({
    viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  openContexts.push(context);
  await context.route('**://*/**', route =>
    route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await context.addInitScript(() => {
    window.fbInit = () => {}; window.fbSave = async () => true;
    window.fbAssessInit = () => {}; window.fbAssessSave = async () => true;
    window.fbBackupSave = async () => {}; window.fbBackupList = async () => [];
  });
  const page = await context.newPage();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await startAsParent(page, 'jenn');

  const small = await page.evaluate(() =>
    [...document.querySelectorAll('#screen-assessment button')]
      .map(b => ({ text: b.textContent.trim().slice(0, 20), h: b.getBoundingClientRect().height }))
      .filter(b => b.h > 0 && b.h < 44));
  assert.deepEqual(small, [], `controls under 44px: ${JSON.stringify(small)}`);
});
