import test from 'node:test';
import assert from 'node:assert/strict';
import { pickFrenchVoice, describeVoice, PREFERRED_LOCALE, FALLBACK_LOCALE }
  from '../src/speech/playback.js';

const v = (lang, name) => ({ lang, name });

test('the product decision is Canadian French', () => {
  assert.equal(PREFERRED_LOCALE, 'fr-CA');
});

test('Canadian French wins when the device has it', () => {
  const picked = pickFrenchVoice([v('en-US','Alex'), v('fr-FR','Thomas'), v('fr-CA','Amelie')]);
  assert.equal(picked.name, 'Amelie');
  assert.equal(describeVoice(picked).isPreferred, true);
});

test('falls back to another French voice rather than an English one', () => {
  // Most iPads ship fr-FR only. A French voice with the wrong region beats an
  // English voice reading French, which is what a bare lang hint can produce.
  const picked = pickFrenchVoice([v('en-US','Alex'), v('fr-FR','Thomas')]);
  assert.equal(picked.name, 'Thomas');
  const info = describeVoice(picked);
  assert.equal(info.isPreferred, false);
  assert.equal(info.isFrench, true);
  assert.equal(info.resolved, FALLBACK_LOCALE);
});

test('any French locale beats no French at all', () => {
  const picked = pickFrenchVoice([v('en-GB','Daniel'), v('fr-BE','Sofie')]);
  assert.equal(picked.name, 'Sofie');
  assert.equal(describeVoice(picked).isFrench, true);
});

test('no French voice installed resolves to null, not to English', () => {
  assert.equal(pickFrenchVoice([v('en-US','Alex'), v('es-ES','Monica')]), null);
  assert.equal(pickFrenchVoice([]), null);
  assert.equal(pickFrenchVoice(null), null);
  const info = describeVoice(null);
  assert.equal(info.isFrench, false);
  assert.equal(info.resolved, null);
});

test('language tags are matched regardless of case or separator', () => {
  assert.equal(pickFrenchVoice([v('fr_CA','A')]).name, 'A');
  assert.equal(pickFrenchVoice([v('fr-ca','B')]).name, 'B');
  assert.equal(describeVoice(v('fr_ca','C')).resolved, 'fr-CA');
  assert.equal(describeVoice(v('fr_ca','C')).isPreferred, true);
});

test('describeVoice records what was asked for and what was got', () => {
  const info = describeVoice(v('fr-FR','Thomas'));
  assert.equal(info.requested, 'fr-CA');
  assert.equal(info.resolved, 'fr-FR');
  assert.equal(info.name, 'Thomas');
});

// ── Mic controller ──────────────────────────────────────────────────────────
import { createMicController } from '../src/speech/recorder.js';

function fakeRecognition() {
  const r = {
    started: 0, aborted: 0, running: false,
    start() { if (r.running) { const e = new Error('x'); e.name = 'InvalidStateError'; throw e; } r.running = true; r.started++; },
    abort() { r.running = false; r.aborted++; r.onend && r.onend(); },
    result(text) { r.running = false; r.onresult({ results: [[{ transcript: text }]] }); },
    end() { r.running = false; r.onend(); },
    error(kind) { r.running = false; r.onerror({ error: kind }); },
  };
  return r;
}
function harness(over = {}) {
  const rec = fakeRecognition();
  const states = [], heard = [];
  const timers = [];
  const mic = createMicController({
    recognition: rec,
    onTranscript: t => heard.push(t),
    onState: (s, why) => states.push(s + (why ? ':' + why : '')),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    ...over,
  });
  return { rec, mic, states, heard, timers };
}

test('mic: tap starts, tap again stops — no InvalidStateError, no stuck state', () => {
  const { rec, mic, states } = harness();
  assert.equal(mic.toggle(), 'listening');
  assert.equal(rec.started, 1);
  assert.equal(mic.toggle(), 'idle');
  assert.equal(rec.aborted, 1);
  assert.deepEqual(states, ['listening', 'idle:tap']);
});

test('mic: the recogniser ending on its own (silence, backgrounding) resets the button', () => {
  const { rec, mic, states } = harness();
  mic.toggle(); rec.end();
  assert.equal(mic.state, 'idle');
  assert.deepEqual(states, ['listening', 'idle:end']);
  // and it can start again afterwards
  assert.equal(mic.toggle(), 'listening');
});

test('mic: a result is delivered after the state resets, so the button never shows listening with a transcript', () => {
  const { rec, mic, states, heard } = harness();
  mic.toggle(); rec.result('  bonjour ');
  assert.deepEqual(heard, ['bonjour']);
  assert.equal(mic.state, 'idle');
  assert.deepEqual(states, ['listening', 'idle:result']);
});

test('mic: an error resets the state and reports the reason', () => {
  const { rec, mic, states } = harness();
  mic.toggle(); rec.error('not-allowed');
  assert.deepEqual(states, ['listening', 'idle:error:not-allowed']);
});

test('mic: a listen that never ends is abandoned by the safety timeout', () => {
  const { rec, mic, timers } = harness({ timeoutMs: 1234 });
  mic.toggle();
  assert.equal(timers[0].ms, 1234);
  timers[0].fn();
  assert.equal(mic.state, 'idle');
  assert.equal(rec.aborted, 1);
});

test('mic: start() throwing (already running / not permitted) leaves the button idle rather than stuck', () => {
  const { rec, mic, states } = harness();
  rec.running = true;                                  // someone else started it
  assert.equal(mic.toggle(), 'idle');
  assert.equal(rec.aborted, 1, 'the runaway recogniser was not aborted');
  assert.deepEqual(states, []);
});
