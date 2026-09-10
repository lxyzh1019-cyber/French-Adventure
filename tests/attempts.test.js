// The commit gate, tested directly.
//
// §1.6 of the plan requires that an answered question never scores twice after
// a resume. The mechanism was written in M1 and shipped, but no test named
// attemptId, committedAnswers or commitAnswerOnce. The only related coverage
// asserted that an answered question is not re-presented — which tests the
// question index advancing, not the gate that stops a second score.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttemptLedger, newAttemptId } from '../src/state/attempts.js';

test('a question can be committed exactly once', () => {
  const l = createAttemptLedger();
  l.begin('att-1');
  assert.equal(l.commitOnce(0), true, 'the first submit must score');
  assert.equal(l.commitOnce(0), false, 'the second must not');
  assert.equal(l.commitOnce(0), false, 'and nor must the third');
});

test('a double tap on Check scores once', () => {
  // The button is live for the whole feedback delay; two fast taps used to be
  // two scores.
  const l = createAttemptLedger();
  l.begin('att-1');
  const results = [l.commitOnce(3), l.commitOnce(3), l.commitOnce(3)];
  assert.deepEqual(results, [true, false, false]);
});

test('different questions in one attempt are independent', () => {
  const l = createAttemptLedger();
  l.begin('att-1');
  assert.equal(l.commitOnce(0), true);
  assert.equal(l.commitOnce(1), true);
  assert.equal(l.commitOnce(2), true);
  assert.equal(l.commitOnce(1), false, 'question 1 was already scored');
  assert.equal(l.size, 3);
});

test('resuming restores what was already scored', () => {
  // The draft carries the attempt id and the committed list. Restoring them is
  // the whole reason a resume cannot re-score: the round is rebuilt, the
  // handlers are rebound, and the gate remembers.
  const before = createAttemptLedger();
  before.begin('att-1');
  before.commitOnce(0);
  before.commitOnce(1);
  const draft = { attemptId: before.attemptId, committed: before.snapshot() };

  const after = createAttemptLedger();
  after.restore(draft.attemptId, draft.committed);

  assert.equal(after.attemptId, 'att-1');
  assert.equal(after.commitOnce(0), false, 'question 0 scored again after resume');
  assert.equal(after.commitOnce(1), false, 'question 1 scored again after resume');
  assert.equal(after.commitOnce(2), true, 'an unanswered question must still score');
});

test('resuming onto an open feedback panel does not re-score that question', () => {
  // The app marks the question committed and advances rather than replaying it.
  const l = createAttemptLedger();
  l.restore('att-1', []);
  l.markCommitted(4);
  assert.equal(l.isCommitted(4), true);
  assert.equal(l.commitOnce(4), false);
});

test('a new attempt does not inherit the previous one', () => {
  // Playing the same format again is a different round; question 0 must score.
  const l = createAttemptLedger();
  l.begin('att-1');
  l.commitOnce(0);
  l.begin('att-2');
  assert.equal(l.commitOnce(0), true);
  assert.equal(l.size, 1, 'the old attempt was carried over');
});

test('a stale committed list from another attempt cannot block a new one', () => {
  // Keys are scoped by attempt id, so a draft restored under a fresh id — the
  // case where the draft has no attemptId at all — starts clean.
  const l = createAttemptLedger();
  l.restore(null, ['att-old:0', 'att-old:1']);
  assert.equal(l.commitOnce(0), true);
  assert.equal(l.commitOnce(1), true);
});

test('Word Match commits per pair, not per question index', () => {
  // A Word Match round is one question index with several scored responses. If
  // the index alone were the key, the first pair would block every other pair
  // in the round.
  const l = createAttemptLedger();
  l.begin('att-1');
  assert.equal(l.commitOnce(0, 'chat|cat'), true);
  assert.equal(l.commitOnce(0, 'chien|dog'), true);
  assert.equal(l.commitOnce(0, 'chat|cat'), false, 'the same pair scored twice');
  assert.equal(l.size, 2);
});

test('matched pairs survive a resume without being recounted', () => {
  const first = createAttemptLedger();
  first.begin('att-1');
  first.commitOnce(0, 'chat|cat');
  first.commitOnce(0, 'chien|dog');

  const resumed = createAttemptLedger();
  resumed.restore(first.attemptId, first.snapshot());

  assert.equal(resumed.commitOnce(0, 'chat|cat'), false);
  assert.equal(resumed.commitOnce(0, 'chien|dog'), false);
  assert.equal(resumed.commitOnce(0, 'oiseau|bird'), true, 'an unmatched pair must still score');
});

test('attempt ids do not collide', () => {
  const ids = new Set();
  for (let i = 0; i < 2000; i++) ids.add(newAttemptId());
  assert.equal(ids.size, 2000);
});
