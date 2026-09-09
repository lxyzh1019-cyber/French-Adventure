// Recording a spoken answer, and the two ways it fails.
//
// Neither failure is a wrong answer. invalidity.rule excludes a technically
// invalid response from the numerator and the denominator, so a refused
// microphone must cost a child nothing — and an interruption must keep whatever
// was captured rather than throwing it away.
//
// The controller takes its stream and its recorder as arguments precisely so
// these paths can be driven here instead of hoped for on a device.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioCapture, DENIED, INTERRUPTED, MAX_CLIP_MS } from '../src/speech/capture.js';

/** A MediaRecorder that does what it is told, and nothing on its own. */
class FakeRecorder {
  constructor(stream, opts = {}) {
    this.stream = stream;
    this.mimeType = opts.mimeType || 'audio/webm';
    this.state = 'inactive';
    FakeRecorder.last = this;
  }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: 'chunk' });
    this.onstop?.();
  }
  fail() { this.onerror?.(new Error('device lost')); }
}

const track = () => { let stopped = false; return { stop() { stopped = true; }, get stopped() { return stopped; } }; };
const fakeStream = () => { const t = track(); return { getTracks: () => [t], _track: t }; };

const capture = (over = {}) => {
  const stream = fakeStream();
  return {
    stream,
    ctl: createAudioCapture({
      getStream: async () => stream,
      Recorder: FakeRecorder,
      ...over,
    }),
  };
};

test('a recording starts, stops, and hands back the clip', async () => {
  const states = [];
  const { ctl } = capture({ onState: s => states.push(s) });

  assert.equal(ctl.state, 'idle');
  const started = await ctl.start();
  assert.equal(started.ok, true);
  assert.equal(ctl.state, 'recording');

  const result = await ctl.stop();
  assert.equal(result.ok, true);
  assert.ok(result.blob, 'no clip came back');
  assert.equal(typeof result.durationMs, 'number');
  assert.deepEqual(states, ['recording', 'stopped']);
});

test('a refused microphone is reported, never thrown', async () => {
  // The child is mid-assessment. A rejection that escapes would end the section.
  const { ctl } = capture({
    getStream: async () => { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; },
  });

  const started = await ctl.start();
  assert.equal(started.ok, false);
  assert.equal(started.reason, DENIED, 'a denial must map to the release\'s own reason');
  assert.equal(ctl.state, 'failed');
});

test('a refused microphone leaves no stream open', async () => {
  const { ctl } = capture({ getStream: async () => { throw new Error('nope'); } });
  await ctl.start();
  // Nothing to release, and nothing left holding the device.
  assert.equal(ctl.state, 'failed');
  const again = await ctl.stop();
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'not_recording');
});

test('stopping releases the microphone', async () => {
  const { ctl, stream } = capture();
  await ctl.start();
  await ctl.stop();
  assert.equal(stream._track.stopped, true, 'the microphone was left open after stopping');
});

test('an interruption keeps what was captured and marks it invalid', async () => {
  // Screen lock or app switch mid-answer. It is still what she said, and a
  // parent may want to hear it — but she was interrupted, not finished.
  const { ctl, stream } = capture();
  await ctl.start();
  const out = ctl.abandon();

  assert.equal(out.ok, false);
  assert.equal(out.reason, INTERRUPTED);
  assert.ok(out.blob, 'the partial recording was discarded');
  assert.equal(ctl.state, 'idle');
  assert.equal(stream._track.stopped, true, 'the microphone was left open after an interruption');
});

test('abandoning when nothing is recording does nothing', async () => {
  const { ctl } = capture();
  assert.deepEqual(ctl.abandon(), { ok: false, reason: 'not_recording' });
});

test('a device error during recording fails and releases the microphone', async () => {
  // The microphone is lost mid-answer — unplugged headset, a call taking the
  // input. Nothing is waiting on stop(), so the controller has to settle
  // itself rather than sit in 'recording' for ever.
  const states = [];
  const { ctl, stream } = capture({ onState: (s, why) => states.push([s, why]) });
  await ctl.start();

  FakeRecorder.last.fail();

  assert.equal(ctl.state, 'failed');
  assert.deepEqual(states.at(-1), ['failed', DENIED]);
  assert.equal(stream._track.stopped, true, 'the microphone was left open after a device error');
  assert.deepEqual(await ctl.stop(), { ok: false, reason: 'not_recording' });
});

test('a forgotten stop is cut off rather than holding the microphone open', async () => {
  // A child will not always press stop.
  let fired = null;
  const { ctl, stream } = capture({
    setTimeout: (fn, ms) => { fired = { fn, ms }; return 1; },
    clearTimeout: () => {},
  });
  await ctl.start();
  assert.equal(fired.ms, MAX_CLIP_MS, 'no safety timeout was armed');

  fired.fn();
  await new Promise(r => setImmediate(r));
  assert.equal(stream._track.stopped, true, 'the safety timeout did not release the microphone');
});

test('starting twice does not open a second recorder', async () => {
  const { ctl } = capture();
  await ctl.start();
  const first = FakeRecorder.last;
  const again = await ctl.start();
  assert.equal(again.alreadyRecording, true);
  assert.equal(FakeRecorder.last, first, 'a second recorder was created');
});

test('a recorder that rejects its mime type is retried without one', async () => {
  // Safari and Chromium disagree about what they will accept.
  let attempts = 0;
  class Picky extends FakeRecorder {
    constructor(stream, opts) {
      attempts++;
      if (opts?.mimeType) throw new Error('unsupported');
      super(stream, {});
    }
  }
  const stream = fakeStream();
  const ctl = createAudioCapture({ getStream: async () => stream, Recorder: Picky });
  const started = await ctl.start();
  assert.equal(started.ok, true, 'a picky recorder was treated as a denial');
  assert.equal(attempts, 2);
});
