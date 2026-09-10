// The artwork the speaking prompts depend on.
//
// Four items in Release A carry an asset brief. A brief is authoring
// instruction — printing SA-D02's required_labels would read "school, park,
// library, bank", the vocabulary the prompt asks the child to produce — so an
// item with a brief and no artwork cannot be administered at all.
//
// That was not a rounding error. With none of the four built, each form had
// three presentable speaking prompts against a minimum of four, so speaking
// reported insufficient_evidence however well a learner did. These tests hold
// the artwork to its briefs, and hold the shortfall reporting to the truth.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../src/assessment/content.js';
import { ITEM_ASSETS, assetFor, hasAssetFor } from '../src/assessment/assets.js';
import * as S from '../src/assessment/session.js';

const BRIEF_ITEMS = C.ITEMS.filter(C.hasAssetBrief).map(i => i.id).sort();

/** Visible text inside an SVG: element content and any text-bearing attribute. */
const visibleText = svg => [
  ...[...svg.matchAll(/>([^<>]+)</g)].map(m => m[1]),
  ...[...svg.matchAll(/\b(?:aria-label|title|alt)\s*=\s*"([^"]*)"/g)].map(m => m[1]),
].map(t => t.trim()).filter(Boolean);

test('every item carrying a brief now has artwork', () => {
  assert.deepEqual(BRIEF_ITEMS, ['SA-D02', 'SA-F02', 'SB-D02', 'SB-F02']);
  for (const id of BRIEF_ITEMS) {
    assert.equal(hasAssetFor(id), true, `${id} still has no artwork`);
  }
  assert.deepEqual(C.ITEMS.filter(C.needsUnbuiltAsset).map(i => i.id), [],
    'an item is still unrenderable');
});

// ── each form can administer at least four presentable speaking prompts ─────

test('each form can administer at least four presentable speaking prompts', () => {
  const minimum = C.minimumEvidenceFor('speaking');
  assert.equal(minimum, 4, 'the release changed its speaking minimum');
  for (const form of C.FORMS) {
    const presentable = C.itemsFor({ form, domain: 'speaking' })
      .filter(i => !C.needsUnbuiltAsset(i));
    assert.ok(presentable.length >= minimum,
      `${form}/speaking can present only ${presentable.length} of a required ${minimum}`);
  }
});

// ── required routing tiers have sufficient presentable content ──────────────

test('every domain can reach its minimum on an untouched form', () => {
  // freshEvidenceByDomain judges the WORST routing path, so this is a floor,
  // not a best case.
  for (const form of C.FORMS) {
    const fresh = S.freshEvidenceByDomain(form, new Set());
    for (const [domain, v] of Object.entries(fresh)) {
      assert.equal(v.sufficient, true,
        `${form}/${domain}: ${v.available} presentable against a minimum of ${v.minimum}`);
    }
  }
});

test('no routing tier is left empty of presentable items', () => {
  for (const form of C.FORMS) {
    for (const domain of ['listening', 'reading', 'vocabulary_grammar']) {
      const routing = C.routingFor(domain);
      for (const tier of [routing.entry_tier, 'foundation', 'stretch']) {
        const presentable = C.itemsFor({ form, domain, tier })
          .filter(i => !C.needsUnbuiltAsset(i));
        assert.ok(presentable.length > 0, `${form}/${domain}/${tier} has nothing to administer`);
      }
    }
  }
});

// ── a missing asset is a content gap, never an exposure problem ─────────────

test('a content gap and an exhausted bank are reported separately', () => {
  // Before the artwork existed, speaking was short for a reason no amount of
  // fresh items could fix. Now it is satisfiable — and when it does fall short,
  // it must be because of exposure, reported as exposure.
  assert.equal(S.freshEvidenceByDomain('A', new Set()).speaking.sufficient, true,
    'speaking should now be satisfiable on an untouched form');

  // Exhaust speaking on BOTH forms — exhausting only one would correctly send
  // the next attempt to the other, which is the behaviour, not the shortfall.
  const exposed = new Set(C.FORMS.flatMap(f =>
    C.itemsFor({ form: f, domain: 'speaking' }).map(i => i.id)));
  assert.equal(S.freshEvidenceByDomain('A', exposed).speaking.sufficient, false);

  const plan = S.planNextAttempt('jenn', [{
    run_id: 'r1', learner_id: 'jenn', form: 'A', status: 'complete',
    started_at_utc: Date.now() - 86400000, responses: {},
    exposure: Object.fromEntries([...exposed].map(id => [id, { shown_count: 1 }])),
  }], { now: Date.now() });

  assert.deepEqual(plan.blockedByContent, [], 'exposure was reported as a content gap');
  assert.ok(plan.insufficientDomains.includes('speaking'),
    'an exhausted domain was not reported as exhausted');
  assert.equal(plan.reason, 'insufficient_fresh_evidence');
});

test('a domain with no presentable content reports blocked_by_content_domains', () => {
  // The state the speaking domain was actually in, reconstructed by hiding the
  // artwork. It must read as a content gap on BOTH forms, and must not make an
  // untouched bank look exhausted.
  const built = { ...ITEM_ASSETS };
  for (const id of BRIEF_ITEMS) delete ITEM_ASSETS[id];
  try {
    for (const form of C.FORMS) {
      const fresh = S.freshEvidenceByDomain(form, new Set());
      assert.equal(fresh.speaking.sufficient, false,
        `${form}/speaking should be short without artwork`);
      assert.equal(fresh.speaking.available, 3);
    }
    const plan = S.planNextAttempt('jenn', [], { now: Date.now() });
    assert.deepEqual(plan.blockedByContent, ['speaking'],
      'a missing asset was not reported as a content gap');
    assert.deepEqual(plan.insufficientDomains, [],
      'a content gap was reported as exposure');
    assert.equal(plan.sufficient, true, 'an untouched bank was called exhausted');
  } finally {
    Object.assign(ITEM_ASSETS, built);
  }
});

// ── a missing asset never becomes an exhausted or exposed item ──────────────

test('an unrenderable item is never shown, never exposed and never answered', () => {
  // An item that cannot be rendered must not be quietly marked administered:
  // that would let a section complete on evidence never collected.
  const built = { ...ITEM_ASSETS };
  for (const id of BRIEF_ITEMS) delete ITEM_ASSETS[id];
  try {
    const { run } = S.startRun({ runs: {} }, 'jenn', { now: Date.now() });
    S.beginSection(run, 'speaking', { now: Date.now() });

    for (let i = 0; i < 20; i++) {
      const item = S.nextItem(run, 'speaking');
      if (!item) break;
      assert.equal(C.needsUnbuiltAsset(item), false, `${item.id} was offered without artwork`);
      S.recordExposure(run, item.id, { now: Date.now() });
      S.submitResponse(run, item.id, {}, { now: Date.now() });
    }

    for (const id of BRIEF_ITEMS) {
      assert.equal(id in run.exposure, false, `${id} was recorded as exposed without artwork`);
      assert.equal(`${id}#0` in run.responses, false, `${id} was answered without artwork`);
    }
    // And the section is not pretended complete on what could not be asked.
    assert.equal(S.freshEvidenceByDomain(run.form, new Set()).speaking.sufficient, false);
  } finally {
    Object.assign(ITEM_ASSETS, built);
  }
});

test('with the artwork in place every speaking prompt is administered', () => {
  const { run } = S.startRun({ runs: {} }, 'jenn', { now: Date.now() });
  S.beginSection(run, 'speaking', { now: Date.now() });

  const shown = [];
  for (let i = 0; i < 20; i++) {
    const item = S.nextItem(run, 'speaking');
    if (!item) break;
    shown.push(item.id);
    S.recordExposure(run, item.id, { now: Date.now() });
    S.submitResponse(run, item.id, {}, { now: Date.now() });
  }
  assert.equal(shown.length, 5, 'not every speaking prompt was administered');
  for (const id of BRIEF_ITEMS.filter(x => x.startsWith('SA'))) {
    assert.ok(shown.includes(id), `${id} has artwork but was skipped`);
  }
});

// ── neither a brief nor an answer key reaches the learner ───────────────────

test('an illustration carries no text at all', () => {
  // Both illustration briefs list prohibited_text: French labels, English
  // object labels. A label would hand over the noun the child must retrieve.
  for (const id of ['SA-F02', 'SB-F02']) {
    assert.deepEqual(visibleText(assetFor(id).svg), [], `${id} has text on it`);
  }
});

test('a map carries its French place labels and no route', () => {
  // learner_view: "map with French place labels; no route arrows". The place
  // names are the reference points for giving directions; an arrow would give
  // the directions themselves.
  const expected = {
    'SA-D02': ['banque', 'bibliothèque', 'parc', 'école'],
    'SB-D02': ['boulangerie', 'bibliothèque', 'parc', 'piscine', 'école'],
  };
  for (const [id, labels] of Object.entries(expected)) {
    assert.deepEqual(visibleText(assetFor(id).svg).sort(), [...labels].sort(),
      `${id} shows something other than its place labels`);
    assert.equal(/marker-end|marker-start|<polyline|<polygon/i.test(assetFor(id).svg), false,
      `${id} draws a route`);
  }
});

test('no asset repeats its own brief back to the learner', () => {
  for (const id of BRIEF_ITEMS) {
    const brief = C.getItem(id).stimulus;
    const svg = assetFor(id).svg.toLowerCase();
    for (const key of ['required_elements', 'required_labels', 'required_route', 'prohibited_text']) {
      for (const phrase of brief[key] || []) {
        assert.equal(svg.includes(String(phrase).toLowerCase()), false,
          `${id} prints its brief: "${phrase}"`);
      }
    }
    if (brief.learner_view) {
      assert.equal(svg.includes(String(brief.learner_view).toLowerCase()), false,
        `${id} prints its learner_view note`);
    }
  }
});

test('no asset displays an accepted answer from anywhere in the bank', () => {
  const answers = C.ITEMS.flatMap(i => i.answer_key?.accepted_answers || [])
    .filter(a => String(a).length > 2);
  assert.ok(answers.length > 0, 'no accepted answers were found to check against');
  for (const [id, asset] of Object.entries(ITEM_ASSETS)) {
    const text = visibleText(asset.svg).join(' ').toLowerCase();
    for (const a of answers) {
      assert.equal(text.includes(String(a).toLowerCase()), false,
        `${id} displays an accepted answer: "${a}"`);
    }
  }
});

test('every required element of a brief is accounted for in its artwork', () => {
  // A drawing cannot be inspected for a chair, so each asset declares what it
  // depicts and the declaration is checked against the release. This is the
  // honest limit of an automated check: it proves nothing was dropped from the
  // list, not that the picture is any good. A person still has to look.
  const drawn = JSON.parse(readFileSync('src/assessment/assets-manifest.json', 'utf8'));
  for (const id of BRIEF_ITEMS) {
    const brief = C.getItem(id).stimulus;
    const required = brief.required_elements || brief.required_labels || [];
    assert.deepEqual([...(drawn[id]?.depicts || [])].sort(), [...required].sort(),
      `${id}'s artwork does not account for its brief`);
  }
});

test('the artwork is inert — no script, no network, no external reference', () => {
  for (const [id, asset] of Object.entries(ITEM_ASSETS)) {
    assert.equal(/<script|onload=|onclick=|xlink:href|<image|<foreignObject/i.test(asset.svg), false,
      `${id} is not a static drawing`);
    assert.equal(/https?:/i.test(asset.svg.replace(/xmlns="[^"]*"/g, '')), false,
      `${id} references something off the page`);
  }
});
