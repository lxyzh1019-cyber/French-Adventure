// Sit a whole assessment, in Node, without a browser.
//
// The report tests need runs with real responses in them, and building one by
// hand would be building a fixture that agrees with the report by construction.
// This drives the same session state machine the app drives, so what the report
// reads is what an actual sitting produces.

import * as C from '../../src/assessment/content.js';
import * as S from '../../src/assessment/session.js';
import { newReview, responseKey } from '../../src/assessment/run-model.js';

export const FULL_MARKS = { message: 3, vocabulary: 3, structure: 3, conventions: 3, independence: 3 };
export const SPEAKING_MARKS = {
  message: 3, comprehensibility: 3, vocabulary_structure: 3, fluency: 2, pronunciation_observation: 2,
};

/**
 * Administer every section. `answer(item)` decides whether an objective item is
 * answered correctly; open items get a written or spoken response and stay
 * awaiting review until `humanReview` is called for them.
 */
export function administer({
  learner = 'jenn', answer = () => true, open = () => 'Je parle français.', now = Date.now(),
} = {}) {
  const { run } = S.startRun({ runs: {} }, learner, { now });
  for (const domain of C.SECTION_ORDER) {
    S.beginSection(run, domain, { now });
    for (let i = 0; i < 60; i++) {
      const item = S.nextItem(run, domain);
      if (!item) break;
      S.recordExposure(run, item.id, { now });
      const patch = {};
      if (Array.isArray(item.choices)) {
        const key = item.answer_key?.correct_choice_ids || [];
        const wrong = item.choices.map(c => c.id).find(c => !key.includes(c));
        patch.selected_choice_ids = [answer(item) ? key[0] : wrong];
      } else if (item.answer_key?.accepted_answers) {
        patch.raw_response = answer(item) ? item.answer_key.accepted_answers[0] : 'zzzz';
      } else {
        patch.raw_response = open(item);
        if (item.domain === 'speaking') {
          patch.audio_ref = `clip_${item.id}`;
          patch.transcript_observation = 'bonjour je parle';
          patch.voice_requested_locale = 'fr-CA';
          patch.voice_resolved_locale = 'fr-FR';
        }
      }
      S.submitResponse(run, item.id, patch, { now });
      S.applyRoutingIfEntryComplete(run, domain, { now });
    }
    S.completeSection(run, domain, { now });
  }
  S.completeRun(run, { now });
  return run;
}

/** A named human's rubric scoring of one open prompt. */
export function humanReview(run, itemId, scores, { scorerId = 'parent-1', now = Date.now() } = {}) {
  const response = run.responses[responseKey(itemId, 0)];
  if (!response) throw new Error(`${itemId} was never answered`);
  run.review[responseKey(itemId, 0)] = newReview({
    itemId, scorerId, rubricId: response.rubric_id, scores, reviewedAtUtc: now,
  });
  return response;
}

export const idsIn = (run, domain) =>
  Object.values(run.responses).filter(r => r.domain === domain).map(r => r.item_id);

/** The shape the store keeps on the device, for seeding a page. */
export function storeFor(run) {
  return {
    assessmentSchemaVersion: 1,
    learner_id: run.learner_id,
    runs: { [run.run_id]: run },
    lastUpdatedAt: Date.now(),
  };
}
