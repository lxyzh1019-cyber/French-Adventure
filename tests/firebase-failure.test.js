// Naming what is wrong with the cloud.
//
// Every Firestore failure used to land in console.warn and become a generic
// 'error', so "we are offline", "the security rules refuse this" and "that
// project does not exist" were indistinguishable from the screen. The one a
// parent can act on is the configuration failure, and it was the hardest to
// see. These pin the distinction rather than the wording.

import test from 'node:test';
import assert from 'node:assert/strict';
import { describeCloudFailure } from '../src/state/firebase-bootstrap.js';

const PROJECT = 'chore-tracker-a461b';

test('a refusal by the security rules is named as a setting, not a network blip', () => {
  const d = describeCloudFailure({ code: 'permission-denied', message: 'Missing permissions' });
  assert.equal(d.code, 'permission-denied');
  assert.equal(d.configuration, true, 'a rules refusal was not marked as a configuration problem');
  assert.match(d.text, /permission-denied/);
  assert.match(d.text, new RegExp(PROJECT), 'the message does not say which project');
  assert.match(d.text, /rules/i);
});

test('being unreachable is not called a configuration problem', () => {
  // The distinction that matters: this one needs no action, and telling a
  // parent to go and change settings because the wifi dropped is worse than
  // saying nothing.
  const d = describeCloudFailure({ code: 'unavailable', message: 'backend unavailable' });
  assert.equal(d.configuration, false, 'a network failure was blamed on the settings');
  assert.match(d.text, /could not be reached/i);
  assert.match(d.text, /saved on this iPad/i);
});

test('each configuration failure says something different and actionable', () => {
  const cases = {
    'permission-denied': /rules/i,
    unauthenticated: /sign-in/i,
    'not-found': /right one/i,
    'failed-precondition': /not ready|index/i,
  };
  const seen = new Set();
  for (const [code, pattern] of Object.entries(cases)) {
    const d = describeCloudFailure({ code });
    assert.equal(d.configuration, true, `${code} is not marked as a configuration problem`);
    assert.match(d.text, pattern, `${code} does not say what to do`);
    assert.equal(seen.has(d.text), false, `${code} repeats another failure's wording`);
    seen.add(d.text);
  }
});

test('a quota failure names the project that is over it', () => {
  const d = describeCloudFailure({ code: 'resource-exhausted' });
  assert.match(d.text, new RegExp(PROJECT));
  assert.equal(d.configuration, false, 'a quota is not something the rules can fix');
});

test('an unrecognised failure carries the real error rather than a shrug', () => {
  const d = describeCloudFailure({ code: 'aborted', message: 'transaction too contended' });
  assert.equal(d.code, 'aborted');
  assert.match(d.text, /aborted/);
  assert.match(d.text, /transaction too contended/, 'the real message was thrown away');
});

test('an error with no code at all still produces something a person can read', () => {
  const d = describeCloudFailure(new TypeError('db is undefined'));
  assert.equal(d.code, null);
  assert.equal(d.configuration, false);
  assert.match(d.text, /db is undefined/);
});

test('the project the app actually points at is the one named in the message', () => {
  // chore-tracker-a461b is deliberate - the project is shared with the owner's
  // other repositories (docs/known-risks.md SS1). The message must name it, so
  // that whoever opens the Firebase console opens the right one.
  const d = describeCloudFailure({ code: 'permission-denied' });
  assert.ok(d.text.includes(PROJECT),
    'the failure message does not name the project, which is the one fact needed to fix it');
});
