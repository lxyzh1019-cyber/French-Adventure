// The Device & Feature Check, on screen.
//
// Every check is started by the parent pressing something: audio needs a
// gesture on iOS, and a microphone prompt that appears unasked is a microphone
// prompt that gets refused. Nothing here runs on its own.
//
// The panel says what it is at the top and keeps saying it: this is test mode,
// and none of it reaches the learner's record.

import { CHECKS, TEST_MODE_NOTICE } from './device-check.js';

const STATUS_TEXT = {
  not_run: 'Not run',
  pass: 'Working',
  fail: 'Not working',
  needs_you: 'Waiting for you',
  recording: 'Recording…',
};

const div = (className, text) => {
  const d = document.createElement('div');
  if (className) d.className = className;
  if (text != null) d.textContent = String(text);
  return d;
};

function button(label, action) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn-secondary';
  b.setAttribute('data-action', action);
  b.textContent = label;
  return b;
}

/** The buttons each check offers, given where it has got to. */
function controlsFor(id, result, controller) {
  const row = div('device-check-actions');
  if (id === 'speech_locale') row.append(button('Check the voice', 'dc-locale'));
  if (id === 'audio_playback') {
    row.append(button('Play a French phrase', 'dc-play'));
    if (result.status === 'needs_you') {
      row.append(button('I heard it', 'dc-heard-yes'), button('I heard nothing', 'dc-heard-no'));
    }
  }
  if (id === 'microphone_permission') row.append(button('Ask for the microphone', 'dc-mic'));
  if (id === 'record_replay') {
    row.append(result.status === 'recording'
      ? button('Stop recording', 'dc-rec-stop')
      : button('Record two seconds', 'dc-rec-start'));
    if (controller.hasRecording()) row.append(button('Play it back', 'dc-rec-play'));
    if (result.status === 'needs_you') {
      row.append(button('I heard it', 'dc-replay-yes'), button('I heard nothing', 'dc-replay-no'));
    }
  }
  if (id === 'storage_roundtrip') row.append(button('Keep and read back a clip', 'dc-storage'));
  if (id === 'clip_delete') row.append(button('Delete the test clip', 'dc-delete'));
  return row;
}

/**
 * Render the panel and wire its own buttons.
 *
 * The listener is on the container rather than the document: this panel is
 * parent-only and short-lived, and its actions have nothing to do with the
 * app's own delegate.
 */
export function mountDeviceCheck(container, controller, { onDone = () => {} } = {}) {
  if (!container) return () => {};
  let done = false;

  const draw = () => {
    if (done) return;
    const results = controller.results();
    container.textContent = '';
    container.append(div('device-check-notice', TEST_MODE_NOTICE));
    container.append(div('device-check-note',
      'This asks whether this iPad can do what the check-in needs. It is not the check-in, and it '
      + 'does not replace listening to it yourself on the day.'));

    for (const check of CHECKS) {
      const result = results[check.id];
      const box = div('device-check-item');
      const head = div('device-check-head');
      head.append(div('device-check-label', check.label));
      const status = div('device-check-status', STATUS_TEXT[result.status] ?? result.status);
      status.setAttribute('data-status', result.status);
      head.append(status);
      box.append(head);
      if (result.detail) box.append(div('device-check-detail', result.detail));
      box.append(controlsFor(check.id, result, controller));
      container.append(box);
    }
    const foot = div('device-check-actions');
    foot.append(button('Done — clear the test clips', 'dc-exit'));
    container.append(foot);
  };

  const handlers = {
    'dc-locale': () => controller.checkSpeechLocale(),
    'dc-play': () => controller.playSample(),
    'dc-heard-yes': () => controller.confirm('audio_playback', true),
    'dc-heard-no': () => controller.confirm('audio_playback', false),
    'dc-mic': () => controller.checkMicrophone(),
    'dc-rec-start': () => controller.startRecording(),
    'dc-rec-stop': () => controller.stopRecording(),
    'dc-rec-play': () => controller.playRecording(),
    'dc-replay-yes': () => controller.confirm('record_replay', true),
    'dc-replay-no': () => controller.confirm('record_replay', false),
    'dc-storage': () => controller.checkStorage(),
    'dc-delete': () => controller.checkDelete(),
  };

  const onClick = async (event) => {
    const el = event.target.closest?.('[data-action]');
    if (!el || !container.contains(el)) return;
    const action = el.getAttribute('data-action');
    if (action === 'dc-exit') {
      done = true;
      container.removeEventListener('click', onClick);
      await controller.exit();
      container.textContent = '';
      onDone();
      return;
    }
    const fn = handlers[action];
    if (!fn) return;
    el.disabled = true;
    try { await fn(); } finally { draw(); }
  };

  container.addEventListener('click', onClick);
  // Anything a previous visit left behind goes now, not when the parent leaves.
  void Promise.resolve(controller.purge()).then(draw);
  draw();
  return () => { container.removeEventListener('click', onClick); };
}
