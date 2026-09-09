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
  await page.waitForTimeout(900);
  return { page, context, errors };
}

/** Open the assessment the way a parent does: password, then the button. */
const startAsParent = (page, player = 'jenn', pwd = PARENT_PWD) => page.evaluate(async ({ player, pwd }) => {
  showParentSummary();
  await new Promise(r => setTimeout(r, 150));
  document.getElementById('parent-pwd').value = pwd;
  document.querySelector(`[data-action="assess-open"][data-player="${player}"]`).click();
  await new Promise(r => setTimeout(r, 400));
  return {
    screenShown: document.getElementById('screen-assessment').style.display,
    runs: window.__faDebug.assessment.runs(player).length,
  };
}, { player, pwd });

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
  await startAsParent(page, 'jess');
  const run = await page.evaluate(() => window.__faDebug.assessment.runs('jess')[0]);
  assert.equal(run.form, 'B');
});

test('opening twice resumes the same run rather than starting a second', async () => {
  const { page } = await open();
  await startAsParent(page, 'jenn');
  const first = await page.evaluate(() => window.__faDebug.assessment.runs('jenn')[0].run_id);
  await page.evaluate(() => window.__faDebug.assessment.pause());
  await page.waitForTimeout(200);
  await startAsParent(page, 'jenn');
  const runs = await page.evaluate(() => window.__faDebug.assessment.runs('jenn'));
  assert.equal(runs.length, 1, 'a second run was started for the same learner');
  assert.equal(runs[0].run_id, first);
});

test('a started section survives the page going away', async () => {
  // The real test of resume: not a soft navigation, but the tab closing and
  // the app booting again from what is on the device.
  const { page, context } = await open();
  await startAsParent(page, 'jenn');
  const before = await page.evaluate(async () => {
    await window.__faDebug.assessment.beginSection();
    const run = window.__faDebug.assessment.runs('jenn')[0];
    return { runId: run.run_id, form: run.form, plan: run.sections.listening.plan,
             status: run.sections.listening.status };
  });
  assert.ok(before.plan.length > 0, 'no section plan was frozen');
  await page.close();

  const { page: page2 } = await open({ reuse: context });
  const after = await page2.evaluate(() => {
    const run = window.__faDebug.assessment.runs('jenn')[0];
    return { runId: run.run_id, form: run.form, plan: run.sections.listening.plan,
             status: run.sections.listening.status };
  });
  assert.equal(after.runId, before.runId, 'the run was not the same one');
  assert.equal(after.form, before.form, 'the form changed across a reload');
  assert.deepEqual(after.plan, before.plan, 'the section was re-planned on resume');
  assert.equal(after.status, before.status);
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
