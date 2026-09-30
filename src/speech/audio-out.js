// Every sound the app makes: spoken French and recorded clips.
//
// Kept in one place because the rules that decide whether a child hears
// anything on an iPad are the same for every caller, and each caller getting
// them slightly wrong in its own way is how the first tap came to be silent.
// WebKit (Safari, and Chrome on iOS, which is WebKit underneath):
//
//   - Speech that starts outside a tap can be dropped without any error until
//     something spoken inside a tap has unlocked the engine. So the first
//     trusted tap anywhere on the page speaks an empty, silent utterance.
//   - The engine can be left paused after the screen locks or the tab is put
//     away. Nothing queued behind a paused engine is heard, so a speak resumes
//     it first, and so does coming back to the page.
//   - A dropped utterance says nothing: no start, no end, no error. The only
//     way to know is to notice that it never started, so every speak has a
//     watchdog and tells its caller, who can put a signal on screen.
//   - <audio>.play() is refused outside a tap. A clip must reach play() in the
//     same task as the tap — never after an await — and the refusal is
//     reported, not swallowed.
//
// Kept free of DOM lookups and globals the caller does not hand in, so each of
// those rules is driven from a test with fakes (tests/audio-out.test.js).

/** How long a spoken line may take to start before it is treated as not started. */
export const START_WATCHDOG_MS = 1500;

/** How long an object URL for a clip is kept once playback has been asked for. */
export const CLIP_URL_TTL_MS = 30_000;

/**
 * @param {object} opts
 * @param {SpeechSynthesis} [opts.synth]         the platform's speech engine
 * @param {(text: string) => object} [opts.makeUtterance]
 * @param {(url: string) => object} [opts.makeAudio]
 * @param {() => object|null} [opts.pickVoice]  the voice to speak with, if any
 * @param {string} [opts.fallbackLang]          the lang hint when there is no voice
 * @param {number} [opts.rate]
 */
export function createAudioOut({
  synth = globalThis.speechSynthesis,
  makeUtterance = text => new globalThis.SpeechSynthesisUtterance(text),
  makeAudio = url => new globalThis.Audio(url),
  urls = globalThis.URL,
  pickVoice = () => null,
  fallbackLang = '',
  rate = 1,
  watchdogMs = START_WATCHDOG_MS,
  setTimeout: setT = globalThis.setTimeout.bind(globalThis),
  clearTimeout: clearT = globalThis.clearTimeout.bind(globalThis),
} = {}) {
  let unlocked = false;       // something has actually started on this engine
  let unlockUtt = null;       // the silent utterance, while it is in the queue
  let current = null;         // the line in flight: { utt, superseded, timer }
  let removeGestureListeners = () => {};

  function markUnlocked() {
    if (unlocked) return;
    unlocked = true;
    removeGestureListeners();
  }

  function resumeIfPaused() {
    try { if (synth?.paused) synth.resume(); } catch { /* nothing to resume */ }
  }

  /**
   * Speak a French line.
   *
   * onStart fires once, when the line actually starts — even if that is after
   * the watchdog gave up on it. onRefused fires once if it has not started
   * within the watchdog, or errors before starting. Neither fires for a line
   * cut off by the next one.
   */
  function speak(text, { onStart, onRefused } = {}) {
    if (!synth || !text) return false;
    resumeIfPaused();

    // Stop what is playing, but only if something is: moving to the next word
    // cuts the previous one off rather than queueing behind it. cancel() on an
    // idle engine is the documented way WebKit loses the next utterance, so it
    // is never called when nothing is playing — and the silent unlock line is
    // left alone, since it ends at once and cancelling it would take the real
    // line down with it.
    if (current) { current.superseded = true; clearT(current.timer); }
    const onlyUnlockQueued = !current && unlockUtt;
    if ((synth.speaking || synth.pending) && !onlyUnlockQueued) synth.cancel();

    const utt = makeUtterance(text);
    const voice = pickVoice();
    if (voice) utt.voice = voice;
    // Set lang even when a voice is chosen: it is the hint the platform uses
    // when no French voice is installed at all.
    utt.lang = voice ? voice.lang : fallbackLang;
    utt.rate = rate;

    // A strong reference until the line ends: an utterance nothing points at
    // can be collected before it speaks, and then nothing is heard.
    const line = { utt, superseded: false, started: false, refused: false, timer: null };
    current = line;
    const refuse = (why) => {
      if (line.started || line.refused || line.superseded) return;
      line.refused = true;
      try { onRefused?.(why); } catch { /* the caller's own fault */ }
    };
    const settle = () => { clearT(line.timer); if (current === line) current = null; };
    utt.onstart = () => {
      if (line.superseded || line.started) return;
      line.started = true;
      clearT(line.timer);
      markUnlocked();
      try { onStart?.(); } catch { /* as above */ }
    };
    utt.onend = settle;
    utt.onerror = (e) => { settle(); refuse(e?.error || 'error'); };
    line.timer = setT(() => {
      // Given up on, so the next line does not treat it as playing. If it
      // does start late, onStart still reports it.
      if (current === line && !line.started) current = null;
      refuse('not_started');
    }, watchdogMs);

    try {
      synth.speak(utt);
    } catch (e) {
      settle();
      refuse(e?.name || 'error');
      return false;
    }
    return true;
  }

  /**
   * Speak nothing, silently, inside a tap, so that later speech outside a tap
   * is not dropped. Also a chance to warm the voice list, which loads late.
   */
  function unlock() {
    if (unlocked || unlockUtt || !synth) return;
    try { pickVoice(); } catch { /* the voice list may not be ready */ }
    try {
      const u = makeUtterance('');
      u.volume = 0;
      const clear = () => { if (unlockUtt === u) unlockUtt = null; };
      u.onstart = markUnlocked;
      u.onend = () => { markUnlocked(); clear(); };
      u.onerror = clear;
      unlockUtt = u;
      synth.speak(u);
      // An engine that reports nothing for an empty line must not leave the
      // real one waiting behind it forever.
      setT(clear, watchdogMs);
    } catch { unlockUtt = null; }
  }

  /**
   * Listen for the first trusted tap, and for the page coming back.
   * Untrusted (scripted) events never unlock anything on a real device, so they
   * are ignored here too.
   */
  function install({ win, doc }) {
    const events = ['touchend', 'pointerup', 'click', 'keydown'];
    const onGesture = (e) => { if (e && e.isTrusted === false) return; unlock(); };
    for (const t of events) win.addEventListener(t, onGesture, true);
    removeGestureListeners = () => {
      for (const t of events) win.removeEventListener(t, onGesture, true);
      removeGestureListeners = () => {};
    };
    if (unlocked) removeGestureListeners();
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState !== 'hidden') resumeIfPaused();
    });
    win.addEventListener('pageshow', resumeIfPaused);
  }

  /**
   * Play a recorded clip. Call it synchronously from the tap handler — no await
   * before it — or WebKit refuses. Resolves { ok: true } once playback starts,
   * or { ok: false, reason } if it was refused; it never rejects.
   */
  function playClip(blob) {
    let url = null;
    let started;
    try {
      url = urls.createObjectURL(blob);
      const audio = makeAudio(url);
      audio.preload = 'auto';
      started = audio.play();
    } catch (e) {
      if (url) { try { urls.revokeObjectURL(url); } catch { /* already gone */ } }
      return Promise.resolve({ ok: false, reason: e?.name || 'error' });
    }
    setT(() => { try { urls.revokeObjectURL(url); } catch { /* already gone */ } }, CLIP_URL_TTL_MS);
    return Promise.resolve(started).then(
      () => ({ ok: true }),
      e => ({ ok: false, reason: e?.name || 'error' }));
  }

  return {
    speak,
    unlock,
    install,
    playClip,
    resumeIfPaused,
    get isUnlocked() { return unlocked; },
  };
}
