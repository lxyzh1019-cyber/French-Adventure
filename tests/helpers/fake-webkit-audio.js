// A stand-in for iPad WebKit's speech engine and <audio> element.
//
// Headless Chromium is not an iPad: it has no voices, no audio device, and a
// far more forgiving idea of when a page may make a sound. A guard that runs
// against it can only prove that speak() was called, which is how the first-tap
// defect stayed invisible to the suite. This double models the parts of WebKit
// that decide whether a child hears anything:
//
//   - Until the engine has been unlocked, speak() called outside a user gesture
//     is dropped silently: no start, no end, no error. A speak() inside a
//     gesture works and unlocks the engine for the rest of the page's life.
//   - The engine can be left paused after the page is backgrounded; nothing is
//     heard until resume() is called.
//   - <audio>.play() rejects with NotAllowedError when it is called outside a
//     user gesture — for example after an await on IndexedDB.
//
// "Inside a gesture" is the task of a trusted pointer, touch, click or key
// event. The flag is set in a capture listener installed before the app's own
// and cleared by a timer queued behind the event, so anything that runs after
// an await on storage, or from a setTimeout, runs outside it — as on the iPad.
//
// Passed to page.addInitScript, so it must be self-contained.
export function installFakeWebKitAudio(opts = {}) {
  const startDelayMs = opts.startDelayMs ?? 5;
  const durationMs = opts.durationMs ?? 400;

  let inGesture = false;
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchend', 'keydown']) {
    window.addEventListener(type, (e) => {
      if (!e.isTrusted) return;
      inGesture = true;
      setTimeout(() => { inGesture = false; }, 0);
    }, true);
  }

  const fake = {
    unlocked: false,
    refuseAll: false,        // an engine that never starts anything, gesture or not
    heard: [],               // text that actually started, audibly
    dropped: [],             // text the engine swallowed without a word
    calls: [],               // 'speak' | 'cancel' | 'resume' | 'pause', in order
    clips: [],               // clip sources that actually started
    refusedClips: [],        // clip sources play() rejected
    get inGesture() { return inGesture; },
  };

  let queue = [];
  let current = null;
  let paused = false;

  function finish(u, type) {
    if (current === u) current = null;
    try { (type === 'end' ? u.onend : u.onerror)?.({ type, error: type === 'error' ? 'canceled' : undefined }); }
    catch { /* a handler's own fault is not the engine's */ }
    pump();
  }
  function pump() {
    if (current || paused || !queue.length) return;
    const u = queue.shift();
    current = u;
    setTimeout(() => {
      if (current !== u || paused) return;
      if (u.text && u.volume !== 0) fake.heard.push(u.text);
      try { u.onstart?.({ type: 'start' }); } catch { /* as above */ }
      // An empty utterance has nothing to say and ends at once.
      setTimeout(() => { if (current === u) finish(u, 'end'); }, u.text ? durationMs : 1);
    }, startDelayMs);
  }

  const synth = {
    get speaking() { return !!current; },
    get pending() { return queue.length > 0; },
    get paused() { return paused; },
    getVoices: () => [{ name: 'Amelie', lang: 'fr-FR', localService: true }],
    addEventListener() {}, removeEventListener() {},
    speak(u) {
      fake.calls.push('speak');
      if (fake.refuseAll || (!fake.unlocked && !inGesture)) {
        if (u.text) fake.dropped.push(u.text);
        return;
      }
      fake.unlocked = true;
      queue.push(u);
      pump();
    },
    cancel() {
      fake.calls.push('cancel');
      const was = current;
      queue = [];
      current = null;
      if (was) finish(was, 'error');
    },
    pause() { fake.calls.push('pause'); paused = true; },
    resume() { fake.calls.push('resume'); paused = false; pump(); },
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth });

  // A plain object is not a SpeechSynthesisVoice and cannot be assigned to a
  // real utterance, so the utterance is a double too.
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = String(text ?? ''); this.voice = null; this.lang = '';
      this.rate = 1; this.volume = 1;
    }
  };

  window.Audio = class {
    constructor(src) { this.src = src; this.preload = ''; this.currentTime = 0; }
    load() {}
    pause() {}
    play() {
      if (!inGesture) {
        fake.refusedClips.push(this.src);
        const e = new Error('The request is not allowed by the user agent.');
        e.name = 'NotAllowedError';
        return Promise.reject(e);
      }
      fake.clips.push(this.src);
      return Promise.resolve();
    }
  };

  /** The screen locks: the page is hidden and iOS leaves the engine paused. */
  fake.sleep = () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    paused = true;
  };
  /** She unlocks the iPad and comes back to the tab. */
  fake.wake = () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));
  };

  window.__audioFake = fake;
}
