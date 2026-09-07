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
