// The audio owner, driven with a fake engine and a fake clock.
//
// Each rule in src/speech/audio-out.js is here as a transition a test can
// force, rather than something hoped for on the iPad.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioOut, START_WATCHDOG_MS, CLIP_URL_TTL_MS } from '../src/speech/audio-out.js';

function clock() {
  let now = 0, seq = 0;
  const timers = new Map();
  return {
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: id => { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now && timers.has(id)) { timers.delete(id); t.fn(); }
      }
    },
  };
}

/** An engine whose every event the test fires by hand. */
function engine() {
  const log = [];
  const queue = [];
  const e = {
    log, queue, speaking: false, paused: false,
    get pending() { return queue.length > 0; },
    speak(u) { log.push(`speak:${u.text}`); queue.push(u); },
    cancel() {
      log.push('cancel');
      const all = queue.splice(0);
      e.speaking = false;
      for (const u of all) u.onerror?.({ error: 'canceled' });
    },
    resume() { log.push('resume'); e.paused = false; },
    start(u = queue[0]) { queue.splice(queue.indexOf(u), 1); e.speaking = true; e.active = u; u.onstart?.(); },
    end(u = e.active) { e.speaking = false; u.onend?.(); },
  };
  return e;
}

class Utt { constructor(t) { this.text = t; this.volume = 1; } }

function make(overrides = {}) {
  const synth = engine();
  const c = clock();
  const out = createAudioOut({
    synth, makeUtterance: t => new Utt(t),
    pickVoice: () => ({ name: 'Amelie', lang: 'fr-FR' }),
    fallbackLang: 'fr-CA', rate: 0.8,
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout,
    ...overrides,
  });
  return { out, synth, c };
}

test('speaking on an idle engine never cancels, and carries voice, lang and rate', () => {
  const { out, synth } = make();
  out.speak('bonjour');
  assert.deepEqual(synth.log, ['speak:bonjour']);
  const u = synth.queue[0];
  assert.equal(u.voice.name, 'Amelie');
  assert.equal(u.lang, 'fr-FR');
  assert.equal(u.rate, 0.8);
});

test('with no French voice the lang hint is the fallback locale', () => {
  const { out, synth } = make({ pickVoice: () => null });
  out.speak('bonjour');
  assert.equal(synth.queue[0].voice, undefined);
  assert.equal(synth.queue[0].lang, 'fr-CA');
});

test('a word already playing is cut off by the next, and that is not reported as a refusal', () => {
  const { out, synth } = make();
  const refused = [];
  out.speak('bonjour', { onRefused: r => refused.push(r) });
  synth.start();
  out.speak('merci');
  assert.deepEqual(synth.log, ['speak:bonjour', 'cancel', 'speak:merci']);
  assert.deepEqual(refused, []);
});

test('a paused engine is resumed before speaking', () => {
  const { out, synth } = make();
  synth.paused = true;
  out.speak('bonjour');
  assert.deepEqual(synth.log, ['resume', 'speak:bonjour']);
});

test('a line that never starts is reported once, and a late start is still reported', () => {
  const { out, synth, c } = make();
  const events = [];
  out.speak('bonjour', { onStart: () => events.push('start'), onRefused: r => events.push(r) });
  c.advance(START_WATCHDOG_MS - 1);
  assert.deepEqual(events, []);
  c.advance(1);
  assert.deepEqual(events, ['not_started']);
  c.advance(START_WATCHDOG_MS);
  assert.deepEqual(events, ['not_started'], 'reported twice');
  synth.start();
  assert.deepEqual(events, ['not_started', 'start']);
});

test('a line that starts in time is never reported as refused', () => {
  const { out, synth, c } = make();
  const events = [];
  out.speak('bonjour', { onStart: () => events.push('start'), onRefused: r => events.push(r) });
  synth.start();
  c.advance(START_WATCHDOG_MS * 2);
  assert.deepEqual(events, ['start']);
});

test('an error before starting is a refusal', () => {
  const { out, synth } = make();
  const events = [];
  out.speak('bonjour', { onRefused: r => events.push(r) });
  synth.queue[0].onerror({ error: 'not-allowed' });
  assert.deepEqual(events, ['not-allowed']);
});

test('the unlock speaks one silent, empty line, and the real word queues behind it', () => {
  const { out, synth } = make();
  out.unlock();
  assert.deepEqual(synth.log, ['speak:']);
  assert.equal(synth.queue[0].volume, 0);
  out.unlock();
  assert.deepEqual(synth.log, ['speak:'], 'a second unlock was queued behind the first');
  out.speak('bonjour');
  assert.deepEqual(synth.log, ['speak:', 'speak:bonjour'],
    'the unlock line was cancelled, and the real word with it');
  synth.start(synth.queue[0]);
  assert.equal(out.isUnlocked, true);
});

test('only a trusted tap unlocks, the listeners go once it has, and coming back resumes', () => {
  const { out, synth } = make();
  const listeners = {};
  const win = {
    addEventListener: (t, fn) => { (listeners[t] ||= new Set()).add(fn); },
    removeEventListener: (t, fn) => { listeners[t]?.delete(fn); },
  };
  const doc = { visibilityState: 'visible', addEventListener: win.addEventListener };
  out.install({ win, doc });
  const fire = (t, e = {}) => [...(listeners[t] || [])].forEach(fn => fn(e));

  fire('click', { isTrusted: false });
  assert.deepEqual(synth.log, [], 'a scripted click tried to unlock');
  fire('touchend', { isTrusted: true });
  assert.deepEqual(synth.log, ['speak:']);
  synth.start();
  synth.end();
  assert.equal(out.isUnlocked, true);
  assert.equal(listeners.click.size + listeners.touchend.size, 0, 'the tap listeners stayed');

  synth.paused = true;
  doc.visibilityState = 'hidden';
  fire('visibilitychange');
  assert.equal(synth.paused, true, 'resumed while hidden');
  doc.visibilityState = 'visible';
  fire('visibilitychange');
  assert.equal(synth.paused, false, 'not resumed on coming back');
  synth.paused = true;
  fire('pageshow');
  assert.equal(synth.paused, false, 'not resumed on pageshow');
});

function clipDeps(play) {
  const made = [], revoked = [];
  return {
    made, revoked,
    urls: { createObjectURL: () => `blob:${made.length + 1}`, revokeObjectURL: u => revoked.push(u) },
    makeAudio: url => { const a = { url, play: () => play(a) }; made.push(a); return a; },
  };
}

test('a clip plays, and its URL is released afterwards', async () => {
  const d = clipDeps(() => Promise.resolve());
  const { out, c } = make({ urls: d.urls, makeAudio: d.makeAudio });
  assert.deepEqual(await out.playClip(new Blob(['x'])), { ok: true });
  assert.equal(d.made[0].preload, 'auto');
  assert.deepEqual(d.revoked, []);
  c.advance(CLIP_URL_TTL_MS);
  assert.deepEqual(d.revoked, ['blob:1']);
});

test('a refused clip is reported, never thrown', async () => {
  const d = clipDeps(() => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })));
  const { out } = make({ urls: d.urls, makeAudio: d.makeAudio });
  assert.deepEqual(await out.playClip(new Blob(['x'])), { ok: false, reason: 'NotAllowedError' });
});

test('a clip that cannot even be built is reported, and its URL released at once', async () => {
  const d = clipDeps(() => { throw Object.assign(new Error('bad'), { name: 'NotSupportedError' }); });
  const { out } = make({ urls: d.urls, makeAudio: d.makeAudio });
  assert.deepEqual(await out.playClip(new Blob(['x'])), { ok: false, reason: 'NotSupportedError' });
  assert.deepEqual(d.revoked, ['blob:1']);
});

test('play() is reached in the same task as the call, with nothing awaited first', () => {
  let reached = false;
  const d = clipDeps(() => { reached = true; return Promise.resolve(); });
  const { out } = make({ urls: d.urls, makeAudio: d.makeAudio });
  void out.playClip(new Blob(['x']));
  assert.equal(reached, true, 'play() was deferred past the tap');
});

test('no engine at all is a quiet no-op, not a crash', () => {
  const out = createAudioOut({ synth: null });
  assert.equal(out.speak('bonjour'), false);
  out.unlock();
});
