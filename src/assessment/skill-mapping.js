// Which rubric dimensions carry which skill.
//
// The content owner's rule, supplied on 2026-09-09: a rubric score is not one
// number per skill. The conventions dimension is what W_ENCODING is about; the
// message dimension is not. Every dimension named here exists in rubrics.json
// and is scored 0-3, which is what makes the /3 in report.js a normalisation
// rather than a guess.
//
// This table is deliberately its own module, with no imports, because
// scripts/validate-release-a.mjs reads it too: a rubric-scored item that names
// a skill with no mapping here fails the release build. That check exists
// because of a real one. Four writing prompts used to carry VG_NEGATION,
// VG_LOCATION and VG_GENDER_NUMBER, and the generic writing rubric cannot
// evidence any of them — a child who writes "Je déteste le fromage" scores well
// on message and structure while demonstrating no negation at all. Release
// v1.0.2 removed those tags. Nothing may quietly re-introduce the situation.

export const RUBRIC_SKILL_DIMENSIONS = {
  W_ENCODING: ['conventions'],
  W_SENTENCE: ['message', 'structure'],
  W_QUESTION: ['message', 'structure'],
  W_CONNECTED: ['message', 'structure'],
  W_DESCRIPTION: ['message', 'vocabulary', 'structure'],
  W_REASON: ['message', 'vocabulary', 'structure'],
  S_INTRO: ['message', 'comprehensibility', 'vocabulary_structure'],
  S_DESCRIPTION: ['message', 'comprehensibility', 'vocabulary_structure'],
  S_RESPONSE: ['message', 'comprehensibility', 'vocabulary_structure'],
  S_DIRECTIONS: ['message', 'comprehensibility', 'vocabulary_structure'],
  S_CONNECTED: ['message', 'comprehensibility', 'vocabulary_structure', 'fluency'],
  P_COMPREHENSIBILITY: ['comprehensibility'],
  P_SOUND_SYMBOL: ['pronunciation_observation'],
  P_RHYTHM_LINKING: ['pronunciation_observation', 'fluency'],
};

/** Rubric dimensions are 0-3 in both rubrics, so a skill value normalises by 3. */
export const RUBRIC_MAX = 3;

/**
 * Skills a rubric-scored item names that have no mapping.
 *
 * Empty is the only acceptable answer: a rubric-scored item may only claim a
 * skill the rule says how to read. Used by the release validator and by tests.
 */
export function unmappedRubricSkills(items = []) {
  const out = new Set();
  for (const item of items) {
    if (item?.scoring?.method !== 'analytic_rubric') continue;
    for (const id of item.skill_ids || []) if (!RUBRIC_SKILL_DIMENSIONS[id]) out.add(id);
  }
  return [...out].sort();
}
