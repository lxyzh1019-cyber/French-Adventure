// Recording a short spoken answer.
//
// Separate from speech/recorder.js, which drives speech *recognition* for the
// games. This captures audio, which is a different thing with different rules:
// scoring.speaking says a transcript cannot score comprehensibility, fluency or
// pronunciation, so what an assessment needs is the recording itself, for a
// person to listen to.
//
// Kept free of DOM and of any global, so every transition — including the two
// that matter most, a refused microphone and an interruption mid-answer — can be
// driven from a test with fakes rather than hoped for on a device.

/** A recording longer than this is almost certainly a forgotten stop. */
export const MAX_CLIP_MS = 90_000;

/**
 * invalidity.reasons, for the two ways capture fails. Neither is a wrong
 * answer: invalidity.rule excludes them from the numerator and the denominator.
 */
export const DENIED = 'microphone_failed';
export const INTERRUPTED = 'app_interrupted_before_submit';

/**
 * @param {object} opts
 * @param {() => Promise<MediaStream>} opts.getStream       usually a getUserMedia wrapper
 * @param {new (s: MediaStream, o?: object) => object} opts.Recorder  MediaRecorder or a fake
 * @param {(state, detail?) => void} [opts.onState]  'idle'|'recording'|'stopped'|'failed'
 * @param {number} [opts.maxMs]
 */
export function createAudioCapture({
  getStream, Recorder, onState = () => {}, maxMs = MAX_CLIP_MS,
  setTimeout: setT = globalThis.setTimeout.bind(globalThis),
  clearTimeout: clearT = globalThis.clearTimeout.bind(globalThis),
}) {
  let state = 'idle';
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let timer = null;
  let settled = null;             // resolves the promise returned by stop()

  function releaseStream() {
    try { for (const t of stream?.getTracks?.() || []) t.stop(); } catch { /* nothing to release */ }
    stream = null;
  }

  function finish(result) {
    if (timer) { clearT(timer); timer = null; }
    releaseStream();
    recorder = null;
    const done = settled;
    settled = null;
    if (done) done(result);
  }

  return {
    get state() { return state; },

    /**
     * Ask for the microphone and start.
     *
     * A refusal is reported, never thrown: the child is mid-assessment, and the
     * answer is that this item is invalid and the section continues.
     */
    async start() {
      if (state === 'recording') return { ok: true, alreadyRecording: true };
      chunks = [];
      try {
        stream = await getStream();
      } catch (e) {
        state = 'failed';
        onState('failed', DENIED);
        return { ok: false, reason: DENIED, error: String(e?.name || e) };
      }
      try {
        recorder = new Recorder(stream, { mimeType: 'audio/webm' });
      } catch {
        try { recorder = new Recorder(stream); }        // let the platform choose
        catch (e2) {
          state = 'failed';
          releaseStream();
          onState('failed', DENIED);
          return { ok: false, reason: DENIED, error: String(e2?.name || e2) };
        }
      }

      recorder.ondataavailable = e => { if (e?.data) chunks.push(e.data); };
      recorder.onstop = () => {
        const ms = Date.now() - startedAt;
        const type = recorder?.mimeType || 'audio/webm';
        let blob = null;
        try { blob = new Blob(chunks, { type }); } catch { blob = null; }
        state = 'stopped';
        onState('stopped');
        finish({ ok: true, blob, durationMs: ms, mimeType: type });
      };
      recorder.onerror = () => {
        state = 'failed';
        onState('failed', DENIED);
        finish({ ok: false, reason: DENIED });
      };

      startedAt = Date.now();
      state = 'recording';
      recorder.start();
      onState('recording');
      // A child will not always press stop. Without this the tab keeps the mic
      // open until the page goes away.
      timer = setT(() => { void this.stop(); }, maxMs);
      return { ok: true };
    },

    /** Stop and hand back the clip. */
    stop() {
      if (state !== 'recording') return Promise.resolve({ ok: false, reason: 'not_recording' });
      return new Promise(resolve => {
        settled = resolve;
        try { recorder.stop(); }
        catch { state = 'failed'; onState('failed', DENIED); finish({ ok: false, reason: DENIED }); }
      });
    },

    /**
     * The page is going away mid-answer — screen lock, app switch, tab eviction.
     *
     * Whatever was captured is kept: it is still what she said, and a parent
     * may want to hear it. But the response is marked invalid, because she was
     * interrupted rather than finished.
     */
    abandon() {
      if (state !== 'recording') return { ok: false, reason: 'not_recording' };
      let blob = null;
      try { recorder?.stop(); } catch { /* already gone */ }
      try { blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }); } catch { blob = null; }
      const ms = Date.now() - startedAt;
      state = 'idle';
      onState('idle', INTERRUPTED);
      finish({ ok: false, reason: INTERRUPTED, blob, durationMs: ms });
      return { ok: false, reason: INTERRUPTED, blob, durationMs: ms };
    },
  };
}
