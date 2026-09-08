// Microphone control for the speech-recognition buttons.
//
// The mic used to be a one-way button: tapping it called recognition.start()
// and nothing could stop it. A second tap while listening threw
// InvalidStateError in Safari, and since no `onend` handler existed the button
// stayed stuck in its pulsing "listening" state. This turns it into a proper
// toggle with a single state machine that every exit path resets.
//
// Kept free of DOM so the state transitions can be unit-tested with a fake
// recogniser; the app supplies `onState` to update the button.

/** How long a single listen may run before it is abandoned. */
export const LISTEN_TIMEOUT_MS = 10000;

/**
 * @param {object} opts
 * @param {object} opts.recognition  a SpeechRecognition-like object
 * @param {(transcript:string)=>void} opts.onTranscript
 * @param {(state:'idle'|'listening', reason?:string)=>void} [opts.onState]
 * @param {number} [opts.timeoutMs]
 * @param {Function} [opts.setTimeout]  injectable for tests
 * @param {Function} [opts.clearTimeout]
 */
export function createMicController({
  recognition, onTranscript, onState = () => {}, timeoutMs = LISTEN_TIMEOUT_MS,
  setTimeout: setT = globalThis.setTimeout.bind(globalThis),
  clearTimeout: clearT = globalThis.clearTimeout.bind(globalThis),
}) {
  let state = 'idle';
  let timer = null;

  function settle(reason) {
    if (timer) { clearT(timer); timer = null; }
    if (state === 'idle') return;
    state = 'idle';
    onState('idle', reason);
  }

  function stopHard(reason) {
    // Settle first: abort() fires onend (synchronously in some engines), and
    // the reason recorded should be why we stopped, not that we stopped.
    settle(reason);
    try { if (typeof recognition.abort === 'function') recognition.abort(); else recognition.stop?.(); }
    catch (_) { /* already stopped */ }
  }

  function start() {
    // Handlers are (re)bound on every start so a recogniser shared between two
    // buttons always reports to the one that is actually listening.
    recognition.onresult = e => {
      let said = '';
      try { said = e.results[0][0].transcript; } catch (_) { said = ''; }
      settle('result');
      onTranscript(String(said || '').trim());
    };
    recognition.onerror = e => settle('error:' + (e && e.error ? e.error : 'unknown'));
    recognition.onend = () => settle('end');       // Safari ends on silence, backgrounding, permission dismissal
    recognition.onnomatch = () => settle('nomatch');

    try {
      recognition.start();
    } catch (err) {
      // Already running (InvalidStateError) or not permitted: reset rather than
      // leave the button stuck.
      stopHard('start-failed');
      return false;
    }
    state = 'listening';
    onState('listening');
    timer = setT(() => stopHard('timeout'), timeoutMs);
    return true;
  }

  return {
    /** Tap: start if idle, stop if listening. Returns the new state. */
    toggle() {
      if (state === 'listening') stopHard('tap');
      else start();
      return state;
    },
    stop(reason = 'stop') { stopHard(reason); },
    get state() { return state; },
  };
}
