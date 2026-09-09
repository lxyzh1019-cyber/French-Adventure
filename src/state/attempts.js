// Scoring an answer exactly once.
//
// A round can be left and resumed, a button can be double-tapped, and a handler
// can be rebound after a redraw. Any of those could previously score the same
// response twice, awarding the points and the evidence again.
//
// The rule is that a *question instance* — this attempt, this question, and for
// Word Match this pair — may be committed once. The committed set travels in
// the round draft, so it survives leaving the app entirely, and it is restored
// before anything else on resume.
//
// This lived inside app.js as two module-private variables and could not be
// imported, so the only coverage was indirect: a browser test asserted that an
// answered question is not re-presented, which tests the question index, not
// the commit gate. It is a module so it can be tested for what it claims.

/** Ids only need to be unique among a learner's own concurrent attempts. */
export function newAttemptId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * The set of responses already scored in the current attempt.
 *
 * `part` distinguishes several scored responses within one question index —
 * Word Match scores per pair, so the question index alone would let the first
 * pair block the rest.
 */
export function createAttemptLedger() {
  let attemptId = null;
  const committed = new Set();

  const key = (index, part) =>
    attemptId + ':' + index + (part == null ? '' : '#' + part);

  return {
    get attemptId() { return attemptId; },

    /** Start a fresh attempt, discarding anything committed under the old one. */
    begin(id = newAttemptId()) {
      attemptId = id;
      committed.clear();
      return attemptId;
    },

    /** Resume an attempt from a draft: its id, and what it had already scored. */
    restore(id, ids = []) {
      attemptId = id || newAttemptId();
      committed.clear();
      for (const k of ids) committed.add(k);
      return attemptId;
    },

    instanceId: key,

    /**
     * Claim the right to score one response. False means it is already scored,
     * and the caller must not award points or evidence for it again.
     */
    commitOnce(index, part) {
      const k = key(index, part);
      if (committed.has(k)) return false;
      committed.add(k);
      return true;
    },

    /** Record a response as scored without claiming it — used when resuming
     *  onto a question whose feedback was already showing. */
    markCommitted(index, part) { committed.add(key(index, part)); },

    isCommitted(index, part) { return committed.has(key(index, part)); },

    /** For the round draft. */
    snapshot() { return [...committed]; },

    get size() { return committed.size; },
  };
}
