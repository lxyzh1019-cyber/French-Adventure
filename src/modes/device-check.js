// The Device & Feature Check.
//
// A parent-only page that asks this iPad, in this browser, whether the things
// the assessment depends on actually work: can it speak French, is there a
// microphone, does a recording play back, does the device keep a clip and give
// it back, and does it say "nothing there" for a clip that was never stored.
//
// It calls the same modules the assessment calls — the same speak, the same
// capture, the same audio store — because a check written against its own copy
// of the logic proves that copy works. Nothing here re-implements them.
//
// Two rules govern everything below.
//
// It touches no record. No run, no response, no exposure, no score, no report,
// no stars or streaks, and nothing that syncs. The only thing it writes is a
// diagnostic clip in IndexedDB, under its own key prefix, on this device only,
// and it deletes those on the way in and on the way out.
//
// And it is not the iPad QA. It says whether the machinery answers; a child
// hearing the French correctly, and a person hearing the child, is still a
// person's job (docs/ipad-test-checklist.md).

/** Diagnostic clips live under their own prefix, and never under a run id. */
export const DIAGNOSTIC_PREFIX = 'devicecheck_';

export const TEST_MODE_NOTICE = 'Test mode — nothing here affects the learner\'s record.';

/** The phrase the playback check speaks. Not from the item bank. */
export const CHECK_PHRASE = 'Bonjour ! Ceci est un test du son.';

export function newDiagnosticRunId() {
  return DIAGNOSTIC_PREFIX + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

export function isDiagnosticKey(key) {
  return String(key ?? '').startsWith(DIAGNOSTIC_PREFIX);
}

export const CHECKS = [
  { id: 'speech_locale', label: 'French voice', needsPerson: false },
  { id: 'audio_playback', label: 'French audio plays', needsPerson: true },
  { id: 'microphone_permission', label: 'Microphone permission', needsPerson: false },
  { id: 'record_replay', label: 'Recording and playing it back', needsPerson: true },
  { id: 'storage_roundtrip', label: 'This device keeps a clip', needsPerson: false },
  { id: 'clip_delete', label: 'A clip can be deleted', needsPerson: false },
  { id: 'pictures', label: 'Pictures and map labels', needsPerson: true },
];

/** How each status reads to a person, on screen and in the saved results. */
export const STATUS_TEXT = {
  not_run: 'Not run',
  pass: 'Working',
  fail: 'Not working',
  needs_you: 'Waiting for you',
  recording: 'Recording…',
};

/** The adult's answer to each judged check, in the words of its buttons. */
const ANSWER_TEXT = {
  audio_playback: { yes: 'I heard it', no: 'I heard nothing' },
  record_replay: { yes: 'I heard it', no: 'I heard nothing' },
  pictures: { yes: 'I can read them', no: 'Too small to read' },
};

const blank = () => Object.fromEntries(CHECKS.map(c =>
  [c.id, { id: c.id, label: c.label, status: 'not_run', detail: '', answer: null, at: 0 }]));

const twoDigits = n => String(n).padStart(2, '0');

/** The local calendar day of a timestamp, as YYYY-MM-DD. */
export function localDay(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${twoDigits(d.getMonth() + 1)}-${twoDigits(d.getDate())}`;
}

/**
 * The results as a plain-text file a parent can send back.
 *
 * Only what the check found about this device: no learner, no run, no score.
 * `standalone` says whether the app was opened from the Home Screen icon,
 * because audio and storage behave differently there than in a Safari tab.
 */
export function formatDeviceCheckReport(results, { now = Date.now(), userAgent = '', standalone = false } = {}) {
  const d = new Date(now);
  const offset = -d.getTimezoneOffset();
  const zone = `UTC${offset >= 0 ? '+' : '-'}${twoDigits(Math.floor(Math.abs(offset) / 60))}:${twoDigits(Math.abs(offset) % 60)}`;
  const lines = [
    'French Adventure — Device & feature check',
    TEST_MODE_NOTICE,
    '',
    `Date: ${localDay(now)} ${twoDigits(d.getHours())}:${twoDigits(d.getMinutes())} (${zone})`,
    `Browser: ${userAgent || 'unknown'}`,
    `Opened from: ${standalone ? 'Home Screen icon' : 'Safari tab'}`,
  ];
  CHECKS.forEach((check, i) => {
    const r = results?.[check.id] || {};
    const status = r.status || 'not_run';
    lines.push('', `${i + 1}. ${check.label} (${check.id})`,
      `   Status: ${STATUS_TEXT[status] ?? status}`,
      `   Detail: ${r.detail || '—'}`);
    if (check.needsPerson) {
      lines.push(`   Your answer: ${ANSWER_TEXT[check.id]?.[r.answer] ?? 'Not answered'}`);
    }
  });
  return lines.join('\n') + '\n';
}

/**
 * @param speak         the app's own speakFrench
 * @param voiceInfo     the app's own voice resolver: { resolvedLocale, name }
 * @param makeCapture   the app's own audio capture factory
 * @param audioStore    the app's own IndexedDB clip store
 * @param playClip      the app's own clip player: call inside the tap; resolves
 *                      { ok: true } once playback starts, { ok: false, reason } if refused
 */
export function createDeviceCheck({
  speak, voiceInfo, makeCapture, audioStore, playClip,
  requestedLocale = 'fr-CA', now = () => Date.now(), onChange = () => {},
} = {}) {
  let results = blank();
  let capture = null;
  let recorded = null;                 // { blob, durationMs, mimeType }
  let storedKey = null;                // the diagnostic clip currently on disk
  const diagnosticRunId = newDiagnosticRunId();

  const set = (id, status, detail, answer = null) => {
    results[id] = { ...results[id], status, detail: String(detail ?? ''), answer, at: now() };
    onChange(results);
    return results[id];
  };

  /** Delete every diagnostic clip this device holds, whoever left it there. */
  async function purge() {
    const keys = await audioStore.listKeys();
    const mine = keys.filter(isDiagnosticKey);
    for (const key of mine) {
      const [runId, rest] = String(key).split('/');
      const [itemId] = String(rest ?? '').split('#');
      await audioStore.remove(runId, itemId);
    }
    storedKey = null;
    return { removed: mine.length };
  }

  return {
    diagnosticRunId,
    results: () => results,
    notice: TEST_MODE_NOTICE,

    /** What voice the device will actually use, and what was asked for. */
    checkSpeechLocale() {
      const info = voiceInfo?.() || {};
      const resolved = info.resolvedLocale || null;
      if (!resolved) {
        return set('speech_locale', 'fail',
          `Asked for ${requestedLocale}. This device offers no French voice at all, so the `
          + 'listening section cannot be administered here.');
      }
      const detail = `Asked for ${requestedLocale}, this device will use ${resolved}`
        + `${info.name ? ` (${info.name})` : ''}.`
        + (resolved.toLowerCase() === requestedLocale.toLowerCase() ? ''
          : ' That is a different French, which is expected on most iPads and is recorded'
            + ' against every listening answer.');
      return set('speech_locale', 'pass', detail);
    },

    /** Speak a phrase. Only the person in the room can say whether it was heard. */
    playSample() {
      try {
        speak(CHECK_PHRASE);
      } catch (e) {
        return set('audio_playback', 'fail', `The device refused to speak: ${e?.message || e}`);
      }
      return set('audio_playback', 'needs_you',
        `Said: "${CHECK_PHRASE}". Did you hear it?`);
    },

    /**
     * Show the four speaking pictures at the size a child sees them.
     *
     * The maps carry French place names, and whether those are readable at
     * arm's length on this iPad is not something any test can answer — the
     * artwork was approved on a desktop screen. The alternative was reaching
     * the speaking section of a real sitting, which spends most of a form on a
     * question about type size, so the pictures are shown here instead. They
     * are drawn by the same code the learner's screen uses, at the same width,
     * and nothing is recorded.
     */
    showPictures() {
      return set('pictures', 'needs_you',
        'Shown at the size a child sees. Can you read the French place names on the maps '
        + 'without leaning in?');
    },

    /** The person answers for the checks no code can judge. */
    confirm(id, heard) {
      const check = CHECKS.find(c => c.id === id);
      if (!check?.needsPerson) return results[id];
      if (results[id]?.status !== 'needs_you') return results[id];
      return heard
        ? set(id, 'pass', 'Confirmed by the adult in the room.', 'yes')
        : set(id, 'fail', 'The adult in the room heard nothing.', 'no');
    },

    /**
     * Ask for the microphone and let it go again.
     *
     * The same capture module the speaking section uses, so a refusal here is
     * the refusal a child would meet.
     */
    async checkMicrophone() {
      capture = capture || makeCapture();
      const started = await capture.start();
      if (!started.ok) {
        return set('microphone_permission', 'fail',
          started.reason === 'microphone_failed'
            ? 'The microphone was refused. Safari asks once per site; check Settings › Safari › '
              + 'Microphone, and the padlock in the address bar.'
            : `The microphone did not start: ${started.reason || 'unknown'}.`);
      }
      capture.abandon();
      return set('microphone_permission', 'pass', 'The microphone opened and was released again.');
    },

    async startRecording() {
      capture = capture || makeCapture();
      recorded = null;
      const started = await capture.start();
      if (!started.ok) {
        return set('record_replay', 'fail', `Recording did not start: ${started.reason || 'unknown'}.`);
      }
      return set('record_replay', 'recording', 'Recording. Say something, then stop.');
    },

    async stopRecording() {
      if (!capture) return set('record_replay', 'fail', 'Nothing was recording.');
      const out = await capture.stop();
      if (!out.ok || !out.blob) {
        return set('record_replay', 'fail', `No audio was captured: ${out.reason || 'unknown'}.`);
      }
      recorded = { blob: out.blob, durationMs: out.durationMs, mimeType: out.mimeType };
      return set('record_replay', 'needs_you',
        `Captured ${Math.round((out.durationMs || 0) / 100) / 10}s. Play it back — do you hear it?`);
    },

    hasRecording: () => !!recorded,

    // The clip is already in memory, so play() is reached inside the tap. A
    // refusal is not yet a verdict — on an iPad a first play can be refused and
    // a second tap works — so it asks for another tap, and the person's own
    // "I heard nothing" is still what fails the check.
    async playRecording() {
      if (!recorded) return set('record_replay', 'fail', 'There is nothing recorded to play.');
      const played = await playClip(recorded.blob);
      if (!played?.ok) {
        return set('record_replay', 'needs_you',
          `Playback did not start (${played?.reason || 'refused'}). Tap Play it back again.`);
      }
      return results.record_replay;
    },

    /**
     * Write a clip, read it back, and ask for one that was never written.
     *
     * The last part is the one worth having. A missing clip must come back
     * absent; an earlier version of the store returned the IDBRequest object
     * instead, which is truthy, so a clip that was never saved read as saved.
     */
    async checkStorage() {
      const blob = recorded?.blob ?? new Blob(['device-check'], { type: 'text/plain' });
      const put = await audioStore.put(diagnosticRunId, 'sample', blob, { mimeType: recorded?.mimeType });
      if (!put.ok) {
        return set('storage_roundtrip', 'fail',
          `This device would not keep a clip: ${put.error}. A private window or a browser set to `
          + 'block site data does this.');
      }
      storedKey = put.key;

      const back = await audioStore.get(diagnosticRunId, 'sample');
      if (!back || !back.blob) {
        return set('storage_roundtrip', 'fail', 'The clip was written but did not come back.');
      }

      const missing = await audioStore.get(diagnosticRunId, 'never-written');
      if (missing !== null && missing !== undefined) {
        return set('storage_roundtrip', 'fail',
          `A clip that was never stored came back as ${typeof missing}. It must come back absent.`);
      }
      return set('storage_roundtrip', 'pass',
        'Written, read back, and a clip that was never stored correctly came back as nothing.');
    },

    /** Delete the diagnostic clip and prove it is gone. */
    async checkDelete() {
      if (!storedKey) {
        return set('clip_delete', 'not_run', 'Run the storage check first, so there is one to delete.');
      }
      const removed = await audioStore.remove(diagnosticRunId, 'sample');
      if (!removed.ok) return set('clip_delete', 'fail', `The clip would not delete: ${removed.error}`);
      const still = await audioStore.has(diagnosticRunId, 'sample');
      if (still) return set('clip_delete', 'fail', 'The clip is still there after being deleted.');
      storedKey = null;
      return set('clip_delete', 'pass', 'Deleted, and confirmed gone.');
    },

    /** On the way in and on the way out: leave no diagnostic audio behind. */
    purge,

    async exit() {
      try { capture?.abandon(); } catch { /* it may not be recording */ }
      capture = null;
      recorded = null;
      const out = await purge();
      results = blank();
      onChange(results);
      return out;
    },
  };
}
