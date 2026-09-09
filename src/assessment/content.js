// The Release A content package, as the app sees it.
//
// One module reads the release, so nothing else has to know its file layout or
// which spelling a field uses. The JSON is imported rather than fetched: the
// app deploys as a single file and must keep working with no network, exactly
// as the game does.
//
// Import attributes (`with { type: 'json' }`) are used because both Node's test
// runner and Vite honour them; a bare JSON import works in Vite but not under
// `node --test`, and this module has to be testable outside a browser.

import MANIFEST from '../../content/releases/assessment-v1/manifest.json' with { type: 'json' };
import RULES from '../../content/releases/assessment-v1/assessment_rules.json' with { type: 'json' };
import ITEMS_DOC from '../../content/releases/assessment-v1/assessment_items.json' with { type: 'json' };
import RUBRICS from '../../content/releases/assessment-v1/rubrics.json' with { type: 'json' };
import CURRICULUM from '../../content/releases/assessment-v1/curriculum_map.json' with { type: 'json' };
import { hasAssetFor, assetFor } from './assets.js';

// scoring_fixtures.json is deliberately NOT imported. It is the test contract,
// not child-facing content, and shipping it would put worked examples of the
// scoring rules into the page.

export { MANIFEST, RULES, RUBRICS, CURRICULUM };
export { hasAssetFor, assetFor };

export const RELEASE_ID = MANIFEST.release_id;
export const ITEMS = ITEMS_DOC.items;
export const FORMS = MANIFEST.forms;
export const SECTION_ORDER = RULES.section_order;

/** Every item id, so exposure and routing can be checked against the real bank. */
const BY_ID = new Map(ITEMS.map(i => [i.id, i]));

export function getItem(id) {
  return BY_ID.get(id) || null;
}

/**
 * Items for one form, domain and tier, in the order the bank lists them.
 *
 * objective_routing.invariant requires that order be preserved: "Within a tier,
 * preserve the item order in assessment_items.json." So this filters and never
 * sorts — the array order is the contract.
 */
export function itemsFor({ form, domain, tier } = {}) {
  return ITEMS.filter(i =>
    (form == null || i.form === form) &&
    (domain == null || i.domain === domain) &&
    (tier == null || i.difficulty_tier === tier));
}

/** The sha256 the manifest claims for a file, or null. Used by the parity test. */
export function declaredSha(fileName) {
  return MANIFEST.files.find(f => f.name === fileName)?.sha256 ?? null;
}

/**
 * The secure/emerging cut scores, as numbers.
 *
 * Read from the release rather than coded here — assessment-v1.0.1 states them
 * as fields precisely so two places do not have to agree by hand.
 */
export function thresholds() {
  return {
    secure: RULES.scoring.secure_threshold,
    emerging: RULES.scoring.emerging_threshold,
  };
}

/** Routing rules for an objective domain, or null for the open sections. */
export function routingFor(domain) {
  return RULES.objective_routing?.[domain] ?? null;
}

export function minimumEvidenceFor(domain) {
  return RULES.scoring.minimum_independent_valid_items?.[domain] ?? null;
}

/** replay.listening_max_plays — how many plays a listening item allows. */
export const MAX_LISTENING_PLAYS = RULES.replay.listening_max_plays;

/** True when an item's stimulus is an authoring brief rather than content. */
export function hasAssetBrief(item) {
  const s = item?.stimulus;
  return !!(s && typeof s === 'object' && typeof s.type === 'string' && s.type.endsWith('_brief'));
}

/**
 * Items that cannot be put in front of a learner.
 *
 * A brief describes what a picture must contain; it is authoring instruction,
 * never something to display — printing SA-D02's required_labels would read
 * "school, park, library, bank", which is the vocabulary the prompt asks the
 * child to produce. So an item with a brief is unrenderable *until the artwork
 * for it exists*, and renderable once it does.
 *
 * This is the distinction that decides whether the speaking domain can report a
 * band at all: with none of the four assets built, each form had three
 * presentable prompts against a minimum of four.
 */
export function needsUnbuiltAsset(item) {
  return hasAssetBrief(item) && !hasAssetFor(item?.id);
}
