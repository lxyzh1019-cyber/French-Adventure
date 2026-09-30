// The silent first tap, against a double of iPad WebKit's audio rules.
//
// Every test here drives the real built page with trusted taps (page.click),
// and the engine underneath is tests/helpers/fake-webkit-audio.js: speech
// outside a gesture is dropped until the engine is unlocked, the engine can be
// left paused after the screen locks, and <audio>.play() is refused outside a
// gesture. What is asserted is what the child would hear — `heard` and `clips`
// — not whether speak() was called.
//
// What no double can prove is that the iPad behaves like the double. That is
// docs/ipad-test-checklist.md §4.5.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { installFakeWebKitAudio } from '../helpers/fake-webkit-audio.js';
import { administer, storeFor } from '../helpers/administer.js';
import * as R from '../../src/assessment/review.js';
import { clipKey } from '../../src/assessment/audio-store.js';

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

async function open({ assess = null, fake = {} } = {}) {
  const context = await browser.newContext();
  openContexts.push(context);
  await context.route('**://*/**', route =>
    route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await context.addInitScript(installFakeWebKitAudio, fake);
  await context.addInitScript((a) => {
    if (a) localStorage.setItem('french_assessment_local_jenn', JSON.stringify(a));
    window.fbInit = () => {}; window.fbSave = async () => true;
    window.fbAssessInit = () => {}; window.fbAssessSave = async () => true;
    window.fbBackupSave = async () => {}; window.fbBackupList = async () => [];
  }, assess);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!(window.__faDebug?.assessment && window.showParentSummary), null, { timeout: 15000 });
  return { page, errors };
}

const fake = page => page.evaluate(() => ({
  unlocked: window.__audioFake.unlocked,
  heard: [...window.__audioFake.heard],
  dropped: [...window.__audioFake.dropped],
  clips: window.__audioFake.clips.length,
  refusedClips: window.__audioFake.refusedClips.length,
}));

/** A 🔊 button of the kind every game renders, added where a tap can reach it. */
const addSpeakButton = (page, word) => page.evaluate((w) => {
  document.getElementById('__t-speak')?.remove();
  const b = document.createElement('button');
  b.id = '__t-speak';
  b.setAttribute('data-speak', w);
  b.textContent = '🔊';
  b.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99999;width:60px;height:60px;';
  document.body.append(b);
}, word);

async function intoListenRound(page) {
  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(400);
  await page.click('#btn-listen');           // the tap that starts the round
  await page.waitForTimeout(700);
}

test('the first tap anywhere unlocks speech, so a word spoken later is heard', async () => {
  // A child's first tap is rarely a 🔊. When the first sound is one the app
  // plays by itself, WebKit drops it unless some earlier tap unlocked speech.
  const { page, errors } = await open();
  await page.mouse.click(5, 5);
  await page.waitForTimeout(100);
  await page.evaluate(() => new Promise(r => setTimeout(() => { speakFrench('bonjour'); r(); }, 50)));
  await page.waitForTimeout(300);
  const f = await fake(page);
  assert.deepEqual(f.heard, ['bonjour'], 'a word spoken after the first tap was not heard');
  assert.deepEqual(f.dropped, []);
  assert.deepEqual(errors, []);
});

test('Listen & Speak: the first word is heard when the round is started by a tap', async () => {
  const { page, errors } = await open();
  await intoListenRound(page);
  const f = await fake(page);
  assert.equal(f.heard.length, 1, `the first word was not heard (dropped: ${JSON.stringify(f.dropped)})`);
  assert.deepEqual(f.dropped, []);
  assert.deepEqual(errors, []);
});

test('Listen & Speak: a word the device refuses makes 🔊 ask for a tap, never plain silence', async () => {
  const { page, errors } = await open({ fake: {} });
  await page.evaluate(() => { window.__audioFake.refuseAll = true; });
  await intoListenRound(page);
  await page.waitForTimeout(1800);           // past the start watchdog
  const flagged = await page.evaluate(() =>
    document.getElementById('listen-play-btn')?.classList.contains('needs-tap') ?? null);
  assert.equal(flagged, true, 'nothing on screen said the word had not played');

  // And a tap that does start it clears the signal.
  await page.evaluate(() => { window.__audioFake.refuseAll = false; });
  await page.click('#listen-play-btn');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() =>
    document.getElementById('listen-play-btn').classList.contains('needs-tap'));
  assert.equal(after, false, 'the button kept asking for a tap after the word played');
  assert.equal((await fake(page)).heard.length, 1);
  assert.deepEqual(errors, []);
});

test('after the screen locks and unlocks, the next tap is heard', async () => {
  // iOS can leave the engine paused when the page is backgrounded. Nothing
  // queued behind a paused engine is ever heard.
  const { page, errors } = await open();
  await addSpeakButton(page, 'bonjour');
  await page.click('#__t-speak');
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__audioFake.sleep(); window.__audioFake.wake(); });
  await addSpeakButton(page, 'merci');
  await page.click('#__t-speak');
  await page.waitForTimeout(300);
  assert.deepEqual((await fake(page)).heard, ['bonjour', 'merci'],
    'the word tapped after waking was not heard');
  assert.deepEqual(errors, []);
});

test('the scoring screen plays a recording on the first tap', async () => {
  // The clip lives in IndexedDB. Fetching it after the tap and then calling
  // play() is outside the gesture on WebKit, and the play is refused.
  const run = administer({ learner: 'jenn' });
  const { page, errors } = await open({ assess: storeFor(run) });
  const spoken = R.queue(run).filter(e => e.domain === 'speaking');
  await page.evaluate(async (refs) => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('french_assessment_audio', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('clips')) {
          req.result.createObjectStore('clips', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('clips', 'readwrite');
        for (const key of refs) {
          tx.objectStore('clips').put({ key, blob: new Blob([new Uint8Array([1, 2, 3, 4])],
            { type: 'audio/webm' }), mime_type: 'audio/webm' });
        }
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      req.onerror = () => reject(req.error);
    });
  }, spoken.map(e => clipKey(run.run_id, e.item_id, e.attempt_index)));

  await page.evaluate(async (pwd) => {
    showParentSummary();
    for (let i = 0; i < 100; i++) {
      const b = document.querySelector('[data-action="assess-review"]');
      if (b) { document.getElementById('parent-pwd').value = pwd; b.click(); break; }
      await new Promise(r => setTimeout(r, 50));
    }
  }, PARENT_PWD);
  await page.waitForSelector('[data-action="rev-play"]', { timeout: 5000 });
  await page.waitForTimeout(400);            // the panel has drawn and read its clips

  await page.click('[data-action="rev-play"] >> nth=0');
  await page.waitForTimeout(300);
  const f = await fake(page);
  const msg = await page.evaluate(() =>
    [...document.querySelectorAll('.assess-review-msg')].map(m => m.textContent).join(' '));
  assert.equal(f.refusedClips, 0, `the first tap was refused (said: "${msg}")`);
  assert.equal(f.clips, 1, 'the recording did not play on the first tap');
  assert.deepEqual(errors, []);
});

/** Open a sitting and stop on the first listening item. */
async function firstListeningItem(page) {
  await page.evaluate(async (pwd) => {
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
    await window.__faDebug.assessment.beginSection();
  }, PARENT_PWD);
  await page.waitForSelector('#screen-assessment [data-action="assess-play"]', { timeout: 5000 });
}
const audioNote = page => page.evaluate(() =>
  document.querySelector('#screen-assessment .assess-audio')?.textContent || '');

test('check-in: a play that never makes a sound does not use up a play', async () => {
  // replay.play_count_definition counts a playback that ran. A tap the device
  // swallowed is not one, and the child has only two.
  const { page, errors } = await open();
  await firstListeningItem(page);
  await page.evaluate(() => { window.__audioFake.refuseAll = true; });
  await page.click('[data-action="assess-play"]');
  await page.waitForTimeout(1900);           // past the start watchdog
  const note = await audioNote(page);
  assert.match(note, /2 plays left/, `a silent play was counted (screen: "${note}")`);
  assert.match(note, /tap/i, 'nothing asked her to tap again');

  // Submitting now records no consumed play.
  await page.click('.assess-choice >> nth=0');
  await page.click('[data-action="assess-submit-item"]');
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => window.__faDebug.assessment.runs('jenn')[0]);
  const first = r.sections.listening.plan[0];
  assert.equal(r.responses[`${first}#0`].audio_play_count, 0, 'the silent play was recorded as used');
  assert.deepEqual(errors, []);
});

test('check-in: a play that starts is counted once', async () => {
  const { page, errors } = await open();
  await firstListeningItem(page);
  await page.click('[data-action="assess-play"]');
  await page.waitForTimeout(300);
  assert.match(await audioNote(page), /1 play left/);
  assert.equal((await fake(page)).heard.length, 1);
  assert.deepEqual(errors, []);
});
