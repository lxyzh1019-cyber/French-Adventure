// The parent report, on the parent's own screen.
//
// What it must never do is easier to state than what it must: no total, no
// average, no phrase from the release's prohibited_claims, and no pronunciation
// figure. The aggregate check below is arithmetic rather than vocabulary - it
// works out the numbers a total WOULD be and looks for them on screen - so a
// rewording cannot slip one past it.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import * as C from '../../src/assessment/content.js';
import * as R from '../../src/assessment/report.js';
import { administer, humanReview, idsIn, storeFor, FULL_MARKS, SPEAKING_MARKS }
  from '../helpers/administer.js';
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

/** A page whose device already holds `run`. */
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

/** Open the parent overlay and ask for the report. */
const askForReport = (page, { password = PARENT_PWD } = {}) => page.evaluate(async (pwd) => {
  showParentSummary();
  for (let i = 0; i < 100; i++) {
    const b = document.querySelector('[data-action="assess-report"]');
    if (b) {
      if (pwd !== null) document.getElementById('parent-pwd').value = pwd;
      b.click();
      break;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  await new Promise(r => setTimeout(r, 150));
  return document.getElementById('assess-report-panel').textContent;
}, password);

const panelText = page => page.evaluate(() =>
  document.getElementById('assess-report-panel').textContent.replace(/\s+/g, ' ').trim());

/** A run with every open prompt reviewed by a named adult. */
function reviewedRun() {
  const run = administer({ answer: () => true });
  for (const id of idsIn(run, 'writing')) humanReview(run, id, FULL_MARKS);
  for (const id of idsIn(run, 'speaking')) humanReview(run, id, SPEAKING_MARKS);
  return run;
}

test('the report is behind the parent password', async () => {
  const { page } = await open(reviewedRun());
  const withoutPassword = await askForReport(page, { password: '' });
  assert.equal(withoutPassword.trim(), '', 'the report was rendered without the password');

  const withPassword = await askForReport(page);
  assert.ok(withPassword.trim().length > 0, 'the report never appeared');
});

test('five sections, named as the release names them', async () => {
  const { page, errors } = await open(reviewedRun());
  await askForReport(page);

  const heads = await page.evaluate(() =>
    [...document.querySelectorAll('#assess-report-panel .assess-report-section-head')]
      .map(e => e.textContent));
  assert.deepEqual(heads,
    ['Listening', 'Reading', 'Vocabulary and grammar', 'Writing', 'Speaking']);
  assert.deepEqual(errors, []);
});

test('pronunciation appears once, inside Speaking, with no band of its own', async () => {
  const { page } = await open(reviewedRun());
  await askForReport(page);

  // It is not a section.
  const heads = await page.evaluate(() =>
    [...document.querySelectorAll('#assess-report-panel .assess-report-section-head')]
      .map(e => e.textContent));
  assert.equal(heads.some(h => /pronunciation/i.test(h)), false, 'pronunciation was given a section');

  // It is inside the speaking one, one level in.
  const placement = await page.evaluate(() => {
    const sections = [...document.querySelectorAll('#assess-report-panel .assess-report-section')];
    const nested = [...document.querySelectorAll('#assess-report-panel .assess-report-nested')];
    return {
      nestedCount: nested.length,
      parentHeads: nested.map(n => n.closest('.assess-report-section')
        ?.querySelector('.assess-report-section-head')?.textContent ?? null),
      label: nested[0]?.querySelector('.assess-report-nested-head')?.textContent ?? null,
    };
  });
  assert.equal(placement.nestedCount, 1, 'pronunciation was reported more than once');
  assert.deepEqual(placement.parentHeads, ['Speaking']);
  assert.equal(placement.label, 'Pronunciation observations');
});

test('the report shows the two named lists', async () => {
  const { page } = await open(reviewedRun());
  await askForReport(page);
  const headings = await page.evaluate(() =>
    [...document.querySelectorAll('#assess-report-panel .assess-report-list-head')].map(e => ({
      text: e.textContent,
      nested: !!e.closest('.assess-report-nested'),
    })));
  const named = t => headings.filter(h => h.text === t);
  // One pair per section, and one more pair inside the pronunciation
  // observations - which are named by the same rule, and still get no figure.
  assert.equal(named('Observed strengths').length, 6);
  assert.equal(named('Suggested next practice areas').length, 6);
  assert.equal(named('Observed strengths').filter(h => h.nested).length, 1);
  assert.equal(named('Suggested next practice areas').filter(h => h.nested).length, 1);
});

test('no number on screen is a total or an average across domains', async () => {
  // Arithmetic rather than vocabulary. These are the figures a total would be;
  // none of them may be on the page. Section-level counts are fine and are
  // excluded, because they are what the release asks to be reported.
  const run = reviewedRun();
  const report = R.runReport(run);
  const { page } = await open(run);
  await askForReport(page);
  const text = await panelText(page);

  const raw = report.sections.map(s => Number(s.raw_points) || 0);
  const possible = report.sections.map(s => Number(s.points_possible) || 0);
  const percents = report.sections.map(s => Number(s.percent)).filter(Number.isFinite);
  const sum = xs => xs.reduce((t, x) => t + x, 0);
  const perSection = new Set([...raw, ...possible, ...percents,
    ...report.sections.map(s => s.valid_independent_evidence_count),
    ...report.sections.map(s => s.support_count), ...report.sections.map(s => s.invalid_count)]);

  const aggregates = [
    sum(raw), sum(possible),
    Math.round((sum(raw) / Math.max(sum(possible), 1)) * 100),
    percents.length ? Math.round(sum(percents) / percents.length) : null,
    Math.round(sum(report.sections.map(s => s.valid_independent_evidence_count))),
  ].filter(n => Number.isFinite(n) && n > 1 && !perSection.has(n));
  assert.ok(aggregates.length > 0, 'no aggregate could be computed, so this proves nothing');

  const onScreen = new Set((text.match(/\d+(?:\.\d+)?/g) || []).map(Number));
  for (const n of aggregates) {
    assert.equal(onScreen.has(n), false, `a cross-domain figure is on screen: ${n}`);
  }
});

test('the report repeats none of the release prohibited claims', async () => {
  const { page } = await open(reviewedRun());
  await askForReport(page);
  const text = await panelText(page);
  for (const claim of C.RULES.reporting.prohibited_claims) {
    // "French Immersion Grade X" is a template; the X stands for any grade.
    const stem = claim.replace(/\s*x$/i, '').trim();
    assert.equal(G.occurs(text, stem), false, `the report claims "${claim}"`);
  }
  assert.equal(/grade\s*\d/i.test(text), false, 'the report places the child in a grade');
});

test('an unreviewed run says so instead of reporting a band', async () => {
  const run = administer({ answer: () => true });          // nothing reviewed
  const { page } = await open(run);
  await askForReport(page);

  const sections = await page.evaluate(() =>
    [...document.querySelectorAll('#assess-report-panel .assess-report-section')].map(s => ({
      head: s.querySelector('.assess-report-section-head')?.textContent,
      text: s.textContent.replace(/\s+/g, ' '),
    })));
  const writing = sections.find(s => s.head === 'Writing');
  assert.match(writing.text, /Waiting for an adult to read or listen/);

  const speaking = sections.find(s => s.head === 'Speaking');
  assert.match(speaking.text, /Nobody has listened to the recordings yet/);
});

test('a voided attempt is still shown, and marked as not a measurement', async () => {
  const run = reviewedRun();
  run.status = 'parent_invalidated';
  const { page } = await open(run);
  await askForReport(page);
  const text = await panelText(page);
  assert.match(text, /set aside by a parent/);
  assert.match(text, /not used as a measurement/);
});

test('nothing scorer-facing reaches the parent report either', async () => {
  // The report is for an adult, but a model answer would still be a leak: the
  // same page can be open while the child is in the room, and the release's
  // model responses are exemplars for a scorer, not content to publish.
  const { page } = await open(reviewedRun());
  await askForReport(page);
  const rendered = await page.evaluate(G.renderedStrings, '#assess-report-panel');
  const models = C.ITEMS.map(i => i.scoring?.model_response).filter(Boolean);
  assert.deepEqual(G.leakedStrings(rendered, models), [], 'a model answer is in the parent report');
});
