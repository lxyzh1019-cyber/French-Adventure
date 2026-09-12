// The Device & Feature Check, in a real page.
//
// The point of this file is the promise the check makes: it touches no record.
// So every check is run for real — voice, playback, microphone, recording,
// storage, delete — with the device already holding a run, a game profile and
// a real recording, and then everything is compared byte for byte with how it
// was before.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { administer, storeFor } from '../helpers/administer.js';
import * as C from '../../src/assessment/content.js';

const APP = 'file://' + path.resolve(process.env.APP_FILE || 'index.html');
const CHROME = process.env.CHROMIUM_PATH || undefined;
const PARENT_PWD = '1234';

const PROFILE = {
  schemaVersion: 3, totalStars: 1240, weekStars: 90, streak: 4,
  topicStars: { '4_colours': 3 }, moons: { grade4: true },
  playedDays: { '2026-09-08': true },
  todayStats: { '2026-09-08': { correct: 10, wrong: 2, rounds: 2, stars: 60 } },
  lastUpdatedAt: 1757000000000,
};

let browser;
const openContexts = [];
test.before(async () => { browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {}); });
test.afterEach(async () => {
  await Promise.all(openContexts.splice(0).map(c => c.close().catch(() => {})));
});
test.after(async () => { await browser?.close(); });

async function open({ micAllowed = true, run = null, viewport = null } = {}) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  openContexts.push(context);
  await context.route('**://*/**', route =>
    route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await context.addInitScript(({ allowed, assess, profile }) => {
    localStorage.setItem('french_game_local_jenn', JSON.stringify(profile));
    if (assess) localStorage.setItem('french_assessment_local_jenn', JSON.stringify(assess));

    // Count every attempt to write anywhere but this device.
    window.__cloudWrites = 0;
    window.fbInit = () => {};
    window.fbSave = async () => { window.__cloudWrites += 1; return true; };
    window.fbAssessInit = () => {};
    window.fbAssessSave = async () => { window.__cloudWrites += 1; return true; };
    window.fbBackupSave = async () => { window.__cloudWrites += 1; };
    window.fbBackupList = async () => [];

    window.__spoken = [];
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = u => { window.__spoken.push(u.text); };
      window.speechSynthesis.cancel = () => {};
      window.speechSynthesis.getVoices = () => [{ name: 'Amelie', lang: 'fr-FR', localService: true }];
    }
    // Headless Chromium ships no voices, so the list above stands in for an
    // iPad's. A plain object is not a SpeechSynthesisVoice, and assigning one to
    // a real utterance throws, so the utterance is a double as well. The app's
    // own voice choice, lang and speak call are untouched.
    window.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = String(text); this.voice = null; this.lang = ''; this.rate = 1; }
    };

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
    // Headless Chromium has no audio device, so a real <audio> play() rejects
    // and would report a working device as broken. Everything else about the
    // playback path is the app's own.
    window.__playedClips = 0;
    window.Audio = class { constructor() {} play() { window.__playedClips += 1; return Promise.resolve(); } };
  }, { allowed: micAllowed, assess: run ? storeFor(run) : null, profile: PROFILE });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!(window.__faDebug?.assessment && window.showParentSummary), null, { timeout: 15000 });
  return { page, errors };
}

/** A recording from a real run, already on this device. */
const REAL_CLIP_KEY = 'run_real_1/SA-F01#0';
const seedRealClip = page => page.evaluate(key => new Promise(resolve => {
  const req = indexedDB.open('french_assessment_audio', 1);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains('clips')) req.result.createObjectStore('clips');
  };
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('clips', 'readwrite');
    tx.objectStore('clips').put({ key, blob: new Blob(['real']), run_id: 'run_real_1' }, key);
    tx.oncomplete = () => { db.close(); resolve(true); };
  };
  req.onerror = () => resolve(false);
}), REAL_CLIP_KEY);

const clipKeys = page => page.evaluate(() => new Promise(resolve => {
  const req = indexedDB.open('french_assessment_audio', 1);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains('clips')) req.result.createObjectStore('clips');
  };
  req.onsuccess = () => {
    const db = req.result;
    const get = db.transaction('clips', 'readonly').objectStore('clips').getAllKeys();
    get.onsuccess = () => { db.close(); resolve([...get.result].sort()); };
    get.onerror = () => { db.close(); resolve([]); };
  };
  req.onerror = () => resolve([]);
}));

/** Everything this device holds that is a record of anything. */
const deviceState = page => page.evaluate(() => ({
  storage: Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])),
  assessment: JSON.stringify(window.__faDebug.assessment.store('jenn')),
  cloudWrites: window.__cloudWrites,
}));

/** Open the parent overlay, unlock it and show the check. */
const openCheck = (page, { password = PARENT_PWD } = {}) => page.evaluate(async (pwd) => {
  showParentSummary();
  for (let i = 0; i < 100; i++) {
    const b = document.querySelector('[data-action="assess-device-check"]');
    if (b) {
      if (pwd !== null) document.getElementById('parent-pwd').value = pwd;
      b.click();
      break;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  await new Promise(r => setTimeout(r, 200));
  return document.getElementById('assess-device-check-panel').textContent;
}, password);

/** Press one of the check's buttons and wait for it to redraw. */
async function press(page, action) {
  const found = await page.evaluate(async (a) => {
    const b = document.querySelector(`#assess-device-check-panel [data-action="${a}"]`);
    if (!b) return false;
    b.click();
    return true;
  }, action);
  await page.waitForTimeout(180);
  return found;
}

const statuses = page => page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('#assess-device-check-panel .device-check-item')].map(el => [
    el.querySelector('.device-check-label').textContent,
    el.querySelector('.device-check-status').getAttribute('data-status'),
  ])));

/** Every check, in the order a parent would press them. */
async function runEverything(page) {
  await press(page, 'dc-locale');
  await press(page, 'dc-play');
  await press(page, 'dc-heard-yes');
  await press(page, 'dc-mic');
  await press(page, 'dc-rec-start');
  await press(page, 'dc-rec-stop');
  await press(page, 'dc-rec-play');
  await press(page, 'dc-replay-yes');
  await press(page, 'dc-storage');
  await press(page, 'dc-delete');
  await press(page, 'dc-pictures');
  await press(page, 'dc-pictures-yes');
}

test('the check is behind the parent password, and says it is test mode', async () => {
  const { page } = await open();
  const locked = await openCheck(page, { password: '' });
  assert.equal(locked.trim(), '', 'the device check opened without the password');

  const text = await openCheck(page);
  assert.match(text, /Test mode/);
  assert.match(text, /nothing here affects the learner's record/i);
  assert.match(text, /does not replace listening to it yourself/i);
});

test('every check runs, and reports what this device can do', async () => {
  const { page, errors } = await open();
  await openCheck(page);
  await runEverything(page);

  assert.deepEqual(await statuses(page), {
    'French voice': 'pass',
    'French audio plays': 'pass',
    'Microphone permission': 'pass',
    'Recording and playing it back': 'pass',
    'This device keeps a clip': 'pass',
    'A clip can be deleted': 'pass',
    'Pictures and map labels': 'pass',
  });

  // The voice check names both locales, and the playback check spoke its own
  // phrase rather than anything from the item bank.
  const text = await page.evaluate(() =>
    document.getElementById('assess-device-check-panel').textContent);
  assert.match(text, /fr-CA/);
  assert.match(text, /fr-FR/);
  const spoken = await page.evaluate(() => window.__spoken);
  assert.deepEqual(spoken, ['Bonjour ! Ceci est un test du son.']);
  assert.ok(await page.evaluate(() => window.__playedClips) > 0, 'the recording was never played back');
  assert.deepEqual(errors, []);
});

test('running every check changes no record at all', async () => {
  // The device already holds a finished run, a game profile and a real
  // recording. None of it may move.
  const run = administer({ answer: () => true });
  const { page, errors } = await open({ run });
  assert.equal(await seedRealClip(page), true);

  const before = await deviceState(page);
  const clipsBefore = await clipKeys(page);
  assert.ok(clipsBefore.includes(REAL_CLIP_KEY), 'the real recording was not seeded');
  assert.ok(before.assessment.includes(run.run_id), 'the run was not seeded');

  await openCheck(page);
  await runEverything(page);
  await press(page, 'dc-exit');

  const after = await deviceState(page);
  assert.deepEqual(after.storage, before.storage, 'the device check wrote to storage');
  assert.equal(after.assessment, before.assessment, 'the assessment record changed');
  assert.equal(after.cloudWrites, before.cloudWrites, 'the device check wrote to the cloud');

  // Specifically: no response, no exposure, no review, no report.
  const untouched = await page.evaluate(id => {
    const r = window.__faDebug.assessment.runs('jenn').find(x => x.run_id === id);
    return r ? { responses: Object.keys(r.responses).length, exposure: Object.keys(r.exposure).length,
                 review: Object.keys(r.review).length, status: r.status } : null;
  }, run.run_id);
  assert.deepEqual(untouched, {
    responses: Object.keys(run.responses).length,
    exposure: Object.keys(run.exposure).length,
    review: Object.keys(run.review).length,
    status: run.status,
  });
  assert.deepEqual(errors, []);
});

test('the test clip is deleted, and the real recording is not', async () => {
  const { page } = await open();
  assert.equal(await seedRealClip(page), true);

  await openCheck(page);
  await press(page, 'dc-storage');
  const during = await clipKeys(page);
  assert.equal(during.some(k => k.startsWith('devicecheck_')), true,
    'the storage check stored nothing, so it proved nothing');
  assert.equal(during.includes(REAL_CLIP_KEY), true);

  await press(page, 'dc-exit');
  const after = await clipKeys(page);
  assert.deepEqual(after, [REAL_CLIP_KEY],
    'the check left a diagnostic clip behind, or took the real one with it');
});

test('a diagnostic clip from a previous visit is cleared on the way in', async () => {
  const { page } = await open();
  assert.equal(await seedRealClip(page), true);
  await page.evaluate(() => new Promise(resolve => {
    const req = indexedDB.open('french_assessment_audio', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('clips')) req.result.createObjectStore('clips');
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('clips', 'readwrite');
      tx.objectStore('clips').put({ key: 'devicecheck_stale/sample#0' }, 'devicecheck_stale/sample#0');
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));

  await openCheck(page);
  await page.waitForTimeout(300);
  assert.deepEqual(await clipKeys(page), [REAL_CLIP_KEY],
    'a diagnostic clip survived the way in');
});

test('a refused microphone is reported as this device not working, not as a crash', async () => {
  const { page, errors } = await open({ micAllowed: false });
  await openCheck(page);
  await press(page, 'dc-mic');

  const status = (await statuses(page))['Microphone permission'];
  assert.equal(status, 'fail');
  const text = await page.evaluate(() =>
    document.getElementById('assess-device-check-panel').textContent);
  assert.match(text, /Settings/);
  assert.deepEqual(errors, []);
});

// -- the pictures, at the size a child sees them -----------------------------

/** The width the artwork is actually drawn at, wherever it is on screen. */
const figureWidth = (page, scope) => page.evaluate(sel => {
  const svg = document.querySelector(sel);
  return svg ? Math.round(svg.getBoundingClientRect().width) : null;
}, scope);

test('the preview shows all four pictures, and none of their briefs', async () => {
  const { page, errors } = await open();
  await openCheck(page);
  await press(page, 'dc-pictures');

  const shown = await page.evaluate(() =>
    [...document.querySelectorAll('.device-check-preview .assess-figure svg')].length);
  const briefed = C.ITEMS.filter(i => C.hasAssetFor(i.id));
  assert.equal(briefed.length, 4, 'the release no longer has four built pictures');
  assert.equal(shown, 4, 'the preview did not show every picture');

  // The same rule as the learner's screen: the brief is the illustrator's
  // instruction and is not shown to anyone as a caption.
  const text = await page.evaluate(() =>
    document.querySelector('.device-check-preview').textContent);
  for (const item of briefed) {
    for (const key of ['required_elements', 'required_labels', 'required_route', 'prohibited_text']) {
      for (const phrase of item.stimulus?.[key] || []) {
        assert.equal(text.toLowerCase().includes(String(phrase).toLowerCase()), false,
          `${item.id}'s brief is printed under its picture: "${phrase}"`);
      }
    }
    assert.ok(text.includes(item.id), `${item.id} is not named, so a report cannot say which`);
  }
  assert.deepEqual(errors, []);
});

test('a picture in the preview is the same size as on the learner screen', async () => {
  // The whole point of the preview. If it were drawn in the parent panel it
  // would be that panel's width — the overlay card is 480px, the learner screen
  // is 720px — and the answer to "can you read this" would be about the wrong
  // thing. Both are measured here at one iPad-sized viewport.
  const viewport = { width: 820, height: 1180 };
  const run = administer({ sections: C.SECTION_ORDER.filter(d => d !== 'speaking') });
  const { page, errors } = await open({ run, viewport });

  // Into the speaking section of the seeded run, the way the app gets there.
  await page.evaluate(async (pwd) => {
    showParentSummary();
    for (let i = 0; i < 100; i++) {
      const b = document.querySelector('[data-action="assess-open"][data-player="jenn"]');
      if (b) { document.getElementById('parent-pwd').value = pwd; b.click(); break; }
      await new Promise(r => setTimeout(r, 50));
    }
    for (let i = 0; i < 100; i++) {
      if (document.getElementById('screen-assessment').style.display === 'block') break;
      await new Promise(r => setTimeout(r, 50));
    }
    await window.__faDebug.assessment.beginSection();
  }, PARENT_PWD);

  // Walk to the first prompt that has a picture.
  let learnerWidth = null, learnerItem = null;
  for (let n = 0; n < 8; n++) {
    const current = await page.evaluate(() => {
      const r = window.__faDebug.assessment.runs('jenn')[0];
      return r.sections.speaking.plan.find(id => !r.responses[`${id}#0`]) || null;
    });
    if (!current) break;
    if (await page.$('#screen-assessment .assess-figure svg')) {
      learnerItem = current;
      learnerWidth = await figureWidth(page, '#screen-assessment .assess-figure svg');
      break;
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
  assert.ok(learnerItem, 'never reached a speaking prompt with a picture');
  assert.ok(learnerWidth > 0, 'the learner picture has no width');

  // Now the same picture in the parent's preview, at the same viewport.
  await page.evaluate(() => window.__faDebug.assessment.pause?.());
  await openCheck(page);
  await press(page, 'dc-pictures');
  const previewWidth = await page.evaluate(id => {
    const cards = [...document.querySelectorAll('.device-check-preview .assess-card')];
    const card = cards.find(c => c.textContent.includes(id));
    const svg = card?.querySelector('.assess-figure svg');
    return svg ? Math.round(svg.getBoundingClientRect().width) : null;
  }, learnerItem);

  assert.equal(previewWidth, learnerWidth,
    `the preview draws ${learnerItem} at ${previewWidth}px and the learner sees ${learnerWidth}px`);
  assert.deepEqual(errors, []);
});

test('the preview closes, and leaving the check takes it away', async () => {
  const { page } = await open();
  await openCheck(page);
  await press(page, 'dc-pictures');
  assert.ok(await page.$('.device-check-preview'));

  await page.click('.device-check-preview [data-action="dc-pictures-close"]');
  await page.waitForTimeout(120);
  assert.equal(await page.$('.device-check-preview'), null, 'the preview would not close');

  await press(page, 'dc-pictures');
  assert.ok(await page.$('.device-check-preview'));
  await press(page, 'dc-exit');
  assert.equal(await page.$('.device-check-preview'), null, 'the preview outlived the check');
});
