// M1 repair round — acceptance evidence the audit asked for.
//
//   • rapid wrong match, then a new selection: no page error, new highlight kept
//   • Word Match resumes in every state: no selection, one selection, several
//     pairs, interruption, completed board
//   • the mic is a toggle that never sticks
//   • every speak/mic control is a real touch target on an iPad
//   • no learner-facing "G4" / "Grade N" label remains
//
// Run with:  npm run test:browser
// APP_FILE=path/to/other/index.html runs the same checks against another build
// (used once to confirm these fail on the audited commit).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';

const APP = 'file://' + path.resolve(process.env.APP_FILE || 'index.html');
const CHROME = process.env.CHROMIUM_PATH || undefined;

let browser;
const openContexts = [];
test.before(async () => { browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {}); });
test.afterEach(async () => {
  await Promise.all(openContexts.splice(0).map(c => c.close().catch(() => {})));
});
test.after(async () => { await browser?.close(); });

// A fake SpeechRecognition installed before the app boots, so the mic path
// runs in headless Chromium and its transitions can be driven from the test.
const FAKE_SR = () => {
  class FakeSR {
    constructor() { this.started = 0; this.aborted = 0; this.running = false; FakeSR.last = this; }
    start() {
      if (this.running) { const e = new Error('already started'); e.name = 'InvalidStateError'; throw e; }
      this.running = true; this.started++;
    }
    abort() { this.running = false; this.aborted++; this.onend && this.onend(); }
    stop() { this.abort(); }
    emitResult(text) { this.running = false; this.onresult && this.onresult({ results: [[{ transcript: text }]] }); }
    emitEnd() { this.running = false; this.onend && this.onend(); }
  }
  // Chromium has a real SpeechRecognition; the app prefers it, so replace both.
  Object.defineProperty(window, 'SpeechRecognition', { value: FakeSR, configurable: true, writable: true });
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeSR, configurable: true, writable: true });
  window.__FakeSR = FakeSR;
};

// Board helpers, installed on window inside the page. `window.__faDebug` is
// the app's read-only window into its module-private round state.
const installHelpers = () => {
  const D = window.__faDebug;
  const chips = side => [...document.querySelectorAll('#' + side + '-col .word-chip')];
  const pairFor = fr => D.matchPairs.find(p => p.fr === fr);
  const chipByText = (side, text) => chips(side).find(b => b.textContent === text);
  const clickPair = fr => { chipByText('fr', fr).click(); chipByText('en', pairFor(fr).en).click(); };
  const wrongEnFor = fr => chips('en').find(b => !b.classList.contains('used') && b.textContent !== pairFor(fr).en);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const snap = () => ({
    order: chips('fr').map(b => b.textContent),
    matched: D.matchMatched.length,
    points: D.roundBasePoints,
    selected: D.matchSelected ? D.matchSelected.word : null,
    selectedHasBtn: !!(D.matchSelected && D.matchSelected.btn),
    highlighted: chips('fr').concat(chips('en')).filter(b => b.style.borderColor === 'var(--french)').map(b => b.textContent),
    used: chips('fr').concat(chips('en')).filter(b => b.classList.contains('used')).length,
  });
  window.__mh = { chips, pairFor, chipByText, clickPair, wrongEnFor, sleep, snap, D };
};

async function open({ seed, ipad = false, fakeMic = false } = {}) {
  const context = await browser.newContext(ipad
    ? { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
    : {});
  openContexts.push(context);
  await context.route('**://*/**', route =>
    route.request().url().startsWith('file://') ? route.continue() : route.abort());
  if (fakeMic) await context.addInitScript(FAKE_SR);
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
  await page.evaluate(() => selectPlayer('jenn'));
  await page.waitForTimeout(400);
  await page.evaluate(installHelpers);
  return { page, errors };
}

// ── Word Match ──────────────────────────────────────────────────────────────

test('a wrong match followed at once by a new selection keeps the new highlight and throws nothing', async () => {
  // Blocker 2 from the audit. The 600 ms reset used to read matchSelected.btn
  // after matchSelected had been nulled: a TypeError if the child waited, the
  // wrong tile cleared if she had already tapped again.
  const { page, errors } = await open();
  const r = await page.evaluate(async () => {
    const { chips, chipByText, wrongEnFor, sleep, D } = window.__mh;
    startGame('match');
    await sleep(400);
    const first = chips('fr')[0].textContent;
    const second = chips('fr')[1].textContent;
    chipByText('fr', first).click();
    wrongEnFor(first).click();                 // wrong pair
    chipByText('fr', second).click();          // immediately, a new selection
    const before = chipByText('fr', second).style.borderColor;
    await sleep(900);                          // past the 600 ms timer
    return {
      before, second,
      after: chipByText('fr', second).style.borderColor,
      selected: D.matchSelected && D.matchSelected.word,
      wrongCleared: chipByText('fr', first).style.borderColor,
    };
  });
  assert.ok(r.before, 'the new tile was not highlighted');
  assert.equal(r.after, r.before, 'the delayed reset cleared the newer selection');
  assert.equal(r.selected, r.second, 'the newer selection was dropped');
  assert.equal(r.wrongCleared, '', 'the wrong tile from the earlier pair was not reset');
  assert.deepEqual(errors, [], 'page errors after a rapid wrong match');
});

test('a wrong match left alone resets both tiles and throws nothing', async () => {
  const { page, errors } = await open();
  const r = await page.evaluate(async () => {
    const { chips, chipByText, wrongEnFor, sleep } = window.__mh;
    startGame('match');
    await sleep(400);
    const first = chips('fr')[0].textContent;
    chipByText('fr', first).click();
    const en = wrongEnFor(first); en.click();
    await sleep(900);
    return { fr: chipByText('fr', first).style.borderColor, en: en.style.borderColor };
  });
  assert.equal(r.fr, ''); assert.equal(r.en, '');
  assert.deepEqual(errors, []);
});

// Play a Word Match round to a given state (a snippet run inside the page with
// the helpers in scope), leave, and resume it.
async function matchResume(page, setup) {
  return page.evaluate(async (setup) => {
    const h = window.__mh;
    startGame('match');
    await h.sleep(400);
    await (new Function('h', `return (async () => { const {chips, chipByText, clickPair, wrongEnFor, pairFor, sleep} = h; ${setup} })()`))(h);
    await h.sleep(700);            // draft debounce
    const before = h.snap();
    exitGame();
    await h.sleep(300);
    startGame('match');
    await h.sleep(500);
    return { before, after: h.snap() };
  }, setup);
}

test('Word Match resumes before any selection', async () => {
  const { page, errors } = await open();
  const { before, after } = await matchResume(page, '');
  assert.deepEqual(after.order, before.order);
  assert.equal(after.selected, null);
  assert.equal(after.matched, 0);
  assert.deepEqual(errors, []);
});

test('Word Match resumes after one selection, with the highlight restored and the tile rebound', async () => {
  const { page, errors } = await open();
  const { before, after } = await matchResume(page, 'chips("fr")[2].click();');
  assert.deepEqual(after.order, before.order);
  assert.ok(before.selected);
  assert.equal(after.selected, before.selected, 'the selection was lost');
  assert.equal(after.selectedHasBtn, true, 'the restored selection has no tile bound');
  assert.deepEqual(after.highlighted, [before.selected]);
  // The restored selection is usable: matching its pair scores once.
  const scored = await page.evaluate(async () => {
    const { chipByText, pairFor, sleep, D } = window.__mh;
    const fr = D.matchSelected.word;
    const p0 = D.roundBasePoints;
    chipByText('en', pairFor(fr).en).click();
    await sleep(100);
    return { gained: D.roundBasePoints - p0, matched: D.matchMatched.length };
  });
  assert.equal(scored.gained, 5); assert.equal(scored.matched, 1);
  assert.deepEqual(errors, []);
});

test('Word Match resumes after several pairs without counting them twice', async () => {
  const { page, errors } = await open();
  const { before, after } = await matchResume(page,
    'clickPair(chips("fr")[0].textContent); await sleep(50); clickPair(chips("fr")[1].textContent); await sleep(50);');
  assert.equal(before.matched, 2);
  assert.equal(after.matched, 2, 'matched pairs were lost or duplicated');
  assert.equal(after.points, before.points, 'resume re-scored the matched pairs');
  assert.equal(after.used, 4, 'matched tiles are not shown as used');
  assert.deepEqual(after.order, before.order);
  assert.deepEqual(errors, []);
});

test('Word Match resumes after an interruption right after a wrong pair', async () => {
  // Screen lock straight after a wrong pair: the 600 ms timer fires after the
  // board has been torn down and rebuilt. Nothing may throw.
  const { page, errors } = await open();
  const { before, after } = await matchResume(page,
    'const f = chips("fr")[0].textContent; chipByText("fr", f).click(); wrongEnFor(f).click(); chips("fr")[3].click();');
  assert.equal(after.matched, 0);
  assert.equal(after.selected, before.selected, 'the selection made after the wrong pair was lost');
  assert.ok(after.selected);
  assert.deepEqual(errors, []);
});

test('a completed Word Match board is not resumed', async () => {
  const { page, errors } = await open();
  const r = await page.evaluate(async () => {
    const { clickPair, sleep, D } = window.__mh;
    startGame('match');
    await sleep(400);
    const total = D.matchPairs.length;
    for (const p of [...D.matchPairs]) { clickPair(p.fr); await sleep(30); }
    await sleep(700);
    return { total, matched: D.matchMatched.length,
             feedbackShown: document.getElementById('feedback-overlay').classList.contains('show') };
  });
  assert.equal(r.matched, r.total);
  assert.ok(r.feedbackShown, 'completing the board did not show feedback');
  const r2 = await page.evaluate(async () => {
    const { chips, sleep, D } = window.__mh;
    exitGame();
    await sleep(300);
    startGame('match');
    await sleep(500);
    return { used: chips('fr').filter(b => b.classList.contains('used')).length,
             matched: D.matchMatched.length, total: D.matchPairs.length };
  });
  assert.ok(r2.matched < r2.total, 'a fully matched board was resumed');
  assert.equal(r2.used, r2.matched);
  assert.deepEqual(errors, []);
});

// ── Microphone ──────────────────────────────────────────────────────────────

test('the mic is a toggle: tap starts, tap stops, and Safari ending on its own resets it', async () => {
  const { page, errors } = await open({ fakeMic: true });
  const r = await page.evaluate(async () => {
    startGame('quiz');
    await new Promise(r => setTimeout(r, 400));
    const btn = document.getElementById('btn-stt');
    const sr = () => window.__FakeSR.last;
    const out = { visible: btn.style.display !== 'none', isFake: !!sr() };
    btn.click();                                      // start
    out.afterStart = { listening: btn.classList.contains('listening'), text: btn.textContent, started: sr().started };
    btn.click();                                      // stop — used to throw InvalidStateError
    out.afterStop = { listening: btn.classList.contains('listening'), text: btn.textContent, aborted: sr().aborted };
    btn.click();                                      // start again
    sr().emitEnd();                                   // silence timeout / backgrounding
    out.afterEnd = { listening: btn.classList.contains('listening'), text: btn.textContent };
    btn.click();
    sr().emitResult('bonjour');
    out.afterResult = { listening: btn.classList.contains('listening'), text: btn.textContent };
    return out;
  });
  assert.ok(r.isFake, 'the fake recogniser was not the one the app used');
  assert.ok(r.visible);
  assert.deepEqual(r.afterStart, { listening: true, text: '⏹ Stop', started: 1 });
  assert.deepEqual(r.afterStop, { listening: false, text: '🎤', aborted: 1 });
  assert.deepEqual(r.afterEnd, { listening: false, text: '🎤' });
  assert.deepEqual(r.afterResult, { listening: false, text: '🎤' });
  assert.deepEqual(errors, [], 'tapping the mic twice raised an error');
});

test('Listen & Speak shows what the device heard instead of submitting it', async () => {
  const { page, errors } = await open({ fakeMic: true });
  const r = await page.evaluate(async () => {
    const D = window.__faDebug;
    startGame('listen');
    await new Promise(r => setTimeout(r, 500));
    const btn = document.getElementById('btn-stt-listen');
    const livesBefore = D.lives;
    btn.click();
    const listening = btn.classList.contains('listening');
    window.__FakeSR.last.emitResult('zzz-not-the-word');
    await new Promise(r => setTimeout(r, 200));
    return {
      listening,
      input: document.getElementById('listen-input').value,
      lives: D.lives, livesBefore,
      feedbackOpen: document.getElementById('feedback-overlay').classList.contains('show'),
      text: btn.textContent,
    };
  });
  assert.equal(r.listening, true);
  assert.equal(r.input, 'zzz-not-the-word', 'the transcript was not placed in the input');
  assert.equal(r.feedbackOpen, false, 'the transcript was auto-submitted');
  assert.equal(r.lives, r.livesBefore, 'a mishearing cost a life before the child could check it');
  assert.equal(r.text, '🎤 Speak');
  assert.deepEqual(errors, []);
});

// ── Touch targets ───────────────────────────────────────────────────────────

test('every speak and mic control is at least 44px on an iPad', async () => {
  const { page, errors } = await open({ ipad: true, fakeMic: true });
  const small = await page.evaluate(async () => {
    const out = [];
    const check = where => {
      for (const el of document.querySelectorAll('[data-speak], .btn-speak, .question-speak-inline, .speak-inline, .listen-play-btn')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;         // hidden
        if (r.width < 44 || r.height < 44) out.push(`${where}: ${el.className || el.id} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    };
    for (const t of ['quiz', 'scramble', 'builder', 'listen']) {
      startGame(t); await new Promise(r => setTimeout(r, 400)); check(t); exitGame(); await new Promise(r => setTimeout(r, 150));
    }
    showMyWords(); await new Promise(r => setTimeout(r, 300)); check('mywords');
    showStudy();   await new Promise(r => setTimeout(r, 300)); check('study');
    return out;
  });
  assert.deepEqual(small, [], 'controls below 44px');
  assert.deepEqual(errors, []);
});

// ── Labels ──────────────────────────────────────────────────────────────────

test('no learner-facing screen shows a G4-style or "Grade N" label', async () => {
  const seed = {
    totalStars: 500, weekStars: 50, streak: 2, lastPlayed: '2026-09-05', weekStart: '2026-08-31',
    topicStars: {}, moons: { grade4: true, grade5: true, grade6: false, grade7: false, grade8: false, grade9: false, grade10: false, super: true },
    gradeUnlocked: { 4: true, 5: true, 6: true, 7: false, 8: false, 9: false, 10: false },
    failedWords: {}, playedDays: { '2026-09-05': true },
    todayStats: { '2026-09-05': { correct: 20, wrong: 3, rounds: 2, stars: 50 } },
    gradeStats: { '2026-09-05': { 4: { correct: 20, wrong: 3 } } },
    lastUpdatedAt: Date.now(),
  };
  const { page, errors } = await open({ seed });
  const GRADE = '\\bG(?:[4-9]|10)\\b|\\bGrade\\s*\\d';
  const hits = await page.evaluate(async (src) => {
    const found = [];
    const scan = where => {
      const t = document.body.innerText.replace(/\s+/g, ' ');
      const m = t.match(new RegExp('.{0,30}(?:' + src + ').{0,30}'));
      if (m) found.push(where + ': ' + m[0]);
    };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    scan('hub');
    document.getElementById('hub-daily-summary-btn')?.click(); await sleep(200); scan('hub-details');
    startGame('quiz'); await sleep(400); scan('game'); exitGame(); await sleep(150);
    showStudy(); await sleep(200); scan('study');
    showMyWords(); await sleep(200); scan('mywords');
    startGame('quiz'); await sleep(400);
    window.__faDebug.endRound(); await sleep(300); scan('round-complete');
    exitGame(); await sleep(150);
    try { showParentSummary(); await sleep(300); scan('parent'); } catch (_) {}
    return found;
  }, GRADE);
  assert.deepEqual(hits, [], 'grade labels still shown');
  assert.deepEqual(errors, []);
});

// ── The two buttons that stopped interpolating into inline JS ───────────────
//
// Both were converted from onclick="fn('…')" to data-action + data-* and the
// delegated listener. Neither had a browser test before, which is why the
// conversion could have silently broken them: the suite renders My Words and
// Sentence Builder but never pressed anything in either.

test('My Words: the drill Check button scores a word with an apostrophe', async () => {
  // aujourd'hui is the case that produced invalid inline JS under the old
  // escaping: onclick="checkDrill('aujourd\'hui')". Seed it as a failed word
  // so the drill has something to ask.
  const { page, errors } = await open({
    seed: {
      // hydrateStateFromLocalMirror only adopts a mirror newer than what is in
      // memory, so a seed without lastUpdatedAt is silently ignored.
      lastUpdatedAt: Date.now(),
      totalStars: 10,
      failedWords: {
        "aujourd'hui": {
          fr: "aujourd'hui", en: 'today', zh: '今天', topic: 'time',
          grade: 4, failCount: 3, successCount: 0, lastFailed: null,
        },
      },
    },
  });

  const r = await page.evaluate(async () => {
    showMyWordsTab('drill');
    await new Promise(res => setTimeout(res, 200));
    const btn = document.querySelector('[data-action="check-drill"]');
    if (!btn) return { error: 'no check-drill button rendered' };
    const word = btn.getAttribute('data-word');
    const inlineJs = btn.getAttribute('onclick');
    document.getElementById('train-input').value = word;
    btn.click();
    await new Promise(res => setTimeout(res, 200));
    return { word, inlineJs, correct: document.body.textContent.includes('Correct') };
  });

  assert.equal(r.error, undefined, r.error);
  assert.equal(r.inlineJs, null, 'the drill Check button carries no inline JS');
  assert.equal(r.word, "aujourd'hui", 'the apostrophe survives the data attribute intact');
  assert.ok(r.correct, 'typing the drilled word scored as correct');
  assert.deepEqual(errors, [], 'no page errors');
});

test('Sentence Builder: tapping a built word removes it', async () => {
  const { page, errors } = await open();

  const r = await page.evaluate(async () => {
    startGame('builder');
    await new Promise(res => setTimeout(res, 300));
    const bank = [...document.querySelectorAll('.bank-word, .word-chip')]
      .filter(b => !b.classList.contains('used'));
    if (!bank.length) return { error: 'no word bank rendered' };
    bank[0].click(); bank[1] && bank[1].click();
    await new Promise(res => setTimeout(res, 100));
    const built = [...document.querySelectorAll('.built-word')];
    const before = built.length;
    const inlineJs = built[0] ? built[0].getAttribute('onclick') : 'no built word';
    built[0] && built[0].click();
    await new Promise(res => setTimeout(res, 100));
    return { before, after: document.querySelectorAll('.built-word').length, inlineJs };
  });

  assert.equal(r.error, undefined, r.error);
  assert.ok(r.before > 0, 'words were placed into the sentence');
  assert.equal(r.inlineJs, null, 'a built word carries no inline JS');
  assert.equal(r.after, r.before - 1, 'tapping a built word removed exactly one');
  assert.deepEqual(errors, [], 'no page errors');
});

// ── The three round outcomes that were declared but never produced ──────────
//
// abandoned, interrupted and timedOut were in ROUND_OUTCOME from M1 onward but
// nothing ever passed them to endRound and nothing stored them, so Rollup
// dropped all three from the build as unreachable: the shipped index.html
// contained only completed and challengeFailed. Walking out of a round left no
// record that it had happened.
//
// A marker carries no stars, no correct and no wrong. Every day counter is
// rebuilt from this ledger, so a marker holding a partial score would inflate
// the day, and would be counted twice if she resumed the attempt and finished.

const startQuiz = async (page) => {
  await page.evaluate(async () => {
    startGame('quiz');
    await new Promise(r => setTimeout(r, 400));
  });
};

test('leaving a round records it as abandoned, with no score attached', async () => {
  const { page, errors } = await open();
  await startQuiz(page);

  const r = await page.evaluate(async () => {
    const attempt = window.__faDebug.roundAttemptId;
    exitGame();
    await new Promise(res => setTimeout(res, 200));
    const e = window.__faDebug.roundLog[attempt];
    return { attempt, entry: e || null, outcome: window.__faDebug.lastRoundOutcome };
  });

  assert.ok(r.attempt, 'the round had an attempt id');
  assert.ok(r.entry, 'walking out of a round left no record at all');
  assert.equal(r.entry.outcome, 'abandoned');
  assert.equal(r.entry.completed, 0, 'an abandoned round must not read as completed');
  assert.equal(r.entry.stars, 0, 'a marker carries no score');
  assert.equal(r.entry.correct, 0);
  assert.equal(r.entry.wrong, 0);
  assert.deepEqual(errors, [], 'no page errors');
});

test('the screen going away records the round as interrupted', async () => {
  const { page, errors } = await open();
  await startQuiz(page);

  const attempt = await page.evaluate(() => window.__faDebug.roundAttemptId);
  // Screen lock / app switch, as the page actually sees it.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);

  const entry = await page.evaluate(a => window.__faDebug.roundLog[a] || null, attempt);
  assert.ok(entry, 'an interrupted round left no record');
  assert.equal(entry.outcome, 'interrupted');
  assert.equal(entry.completed, 0);
  assert.equal(entry.stars, 0);
  assert.deepEqual(errors, [], 'no page errors');
});

test('finishing a resumed round supersedes its unfinished marker', async () => {
  // The case the marker must not break: she leaves mid-round, comes back and
  // finishes the same attempt. One entry, and it says completed.
  const { page, errors } = await open();
  await startQuiz(page);

  const r = await page.evaluate(async () => {
    const attempt = window.__faDebug.roundAttemptId;
    exitGame();
    await new Promise(res => setTimeout(res, 150));
    const marker = { ...window.__faDebug.roundLog[attempt] };

    // Resume the same attempt and let it end properly.
    startGame('quiz');
    await new Promise(res => setTimeout(res, 400));
    const resumed = window.__faDebug.roundAttemptId;
    await window.__faDebug.endRound('completed');
    await new Promise(res => setTimeout(res, 400));

    const log = window.__faDebug.roundLog;
    return { attempt, resumed, marker, entry: log[resumed] || null,
             ids: Object.keys(log).length };
  });

  assert.equal(r.marker.outcome, 'abandoned', 'the marker was written on the way out');
  assert.ok(r.entry, 'the finished round left no entry');
  assert.equal(r.entry.outcome, 'completed', 'the marker was not superseded');
  assert.equal(r.entry.completed, 1);
  if (r.attempt === r.resumed) {
    assert.equal(r.ids, 1, 'one attempt must leave exactly one ledger entry');
  }
  assert.deepEqual(errors, [], 'no page errors');
});
