// The bundled release must be the release on disk.
//
// content.js imports the JSON so the app keeps working offline. That creates a
// second copy of the package inside the built page, and two copies can drift:
// someone edits a file and forgets the manifest, or edits the manifest and
// forgets the file. The hashes exist to catch exactly that, so the test checks
// the imported objects against the bytes AND the bytes against the manifest.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as C from '../src/assessment/content.js';

const DIR = 'content/releases/assessment-v1/';
const raw = f => readFileSync(DIR + f);
const json = f => JSON.parse(raw(f).toString('utf8'));

test('every file the manifest lists still hashes to what it claims', () => {
  for (const f of C.MANIFEST.files) {
    if (!f.sha256) continue;                    // manifest.json excludes its own
    const actual = createHash('sha256').update(raw(f.name)).digest('hex');
    assert.equal(actual, f.sha256, `${f.name} does not match its manifest hash`);
  }
});

test('what the app imports is what is on disk', () => {
  assert.deepEqual(C.RULES, json('assessment_rules.json'));
  assert.deepEqual(C.RUBRICS, json('rubrics.json'));
  assert.deepEqual(C.CURRICULUM, json('curriculum_map.json'));
  assert.deepEqual(C.ITEMS, json('assessment_items.json').items);
});

test('every document agrees on the release id', () => {
  for (const f of ['assessment_rules.json', 'rubrics.json', 'curriculum_map.json',
                   'assessment_items.json', 'scoring_fixtures.json']) {
    assert.equal(json(f).release_id, C.RELEASE_ID, `${f} names a different release`);
  }
});

test('the bank is the size the manifest declares', () => {
  assert.equal(C.ITEMS.length, C.MANIFEST.total_items);
  for (const form of C.FORMS) {
    for (const [domain, spec] of Object.entries(C.MANIFEST.item_counts[form])) {
      assert.equal(C.itemsFor({ form, domain }).length, spec.total,
        `${form}/${domain} count disagrees with the manifest`);
      for (const [tier, n] of Object.entries(spec.by_difficulty)) {
        assert.equal(C.itemsFor({ form, domain, tier }).length, n,
          `${form}/${domain}/${tier} count disagrees with the manifest`);
      }
    }
  }
});

test('the scoring fixtures are not bundled into the page', () => {
  // They are the test contract, and shipping them would put worked examples of
  // the scoring rules where a curious child could read them.
  const src = readFileSync('src/assessment/content.js', 'utf8');
  assert.equal(/scoring_fixtures/.test(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')), false,
    'content.js imports the fixtures');
});

test('itemsFor preserves the bank order, which routing depends on', () => {
  // objective_routing.invariant: "Within a tier, preserve the item order in
  // assessment_items.json."
  const picked = C.itemsFor({ form: 'A', domain: 'listening', tier: 'foundation' }).map(i => i.id);
  const expected = C.ITEMS.filter(i => i.form === 'A' && i.domain === 'listening'
    && i.difficulty_tier === 'foundation').map(i => i.id);
  assert.deepEqual(picked, expected);
});

test('getItem finds every item, and nothing else', () => {
  for (const i of C.ITEMS) assert.equal(C.getItem(i.id), i);
  assert.equal(C.getItem('NOT-AN-ITEM'), null);
});

test('the thresholds and replay allowance come from the release', () => {
  assert.deepEqual(C.thresholds(), { secure: 0.75, emerging: 0.5 });
  assert.equal(C.MAX_LISTENING_PLAYS, C.RULES.replay.listening_max_plays);
});

test('the four items carrying an asset brief are identified, and all have artwork', () => {
  // A brief is authoring instruction: printing SA-D02's required_labels would
  // read "school, park, library, bank", the vocabulary the prompt asks for. So
  // an item with a brief is unrenderable until its artwork exists — and all
  // four now have it, which is what lets speaking reach its minimum at all.
  const briefed = C.ITEMS.filter(C.hasAssetBrief).map(i => i.id).sort();
  assert.deepEqual(briefed, ['SA-D02', 'SA-F02', 'SB-D02', 'SB-F02']);
  for (const id of briefed) {
    assert.equal(C.getItem(id).domain, 'speaking');
    assert.equal(C.hasAssetFor(id), true, `${id} has no artwork`);
  }
  assert.deepEqual(C.ITEMS.filter(C.needsUnbuiltAsset).map(i => i.id), [],
    'an item is still unrenderable');
});

test('no item outside those four carries a stimulus that cannot be rendered', () => {
  for (const i of C.ITEMS) {
    if (C.hasAssetBrief(i)) continue;
    const s = i.stimulus;
    if (s && typeof s === 'object') {
      assert.equal(/_brief$/.test(String(s.type)), false,
        `${i.id} carries an asset brief but was not flagged`);
    }
  }
});
