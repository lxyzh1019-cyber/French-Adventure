import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM, SENTENCES, G10_BATCH_C_SENTENCES } from '../src/content/curriculum-map.js';

const allVocab = Object.entries(CURRICULUM).flatMap(([grade, topics]) =>
  Object.entries(topics).flatMap(([topic, t]) =>
    t.vocab.map(w => ({ ...w, grade, topic }))));

test('curriculum covers grades 4-10 and every topic has vocabulary', () => {
  assert.deepEqual(Object.keys(CURRICULUM).map(Number).sort((a,b)=>a-b), [4,5,6,7,8,9,10]);
  for (const [grade, topics] of Object.entries(CURRICULUM)) {
    assert.ok(Object.keys(topics).length > 0, `grade ${grade} has no topics`);
    for (const [key, t] of Object.entries(topics)) {
      assert.ok(t.name, `${grade}/${key} has no name`);
      assert.ok(Array.isArray(t.vocab) && t.vocab.length, `${grade}/${key} has no vocab`);
    }
  }
});

test('every vocabulary entry carries fr, en and zh', () => {
  // Chinese is part of the content contract - a delivered package that
  // omits it must fail, not silently ship half-translated cards.
  const missing = allVocab.filter(w => !w.fr || !w.en || !w.zh);
  assert.deepEqual(missing, [], `${missing.length} entries missing a field`);
});

test('sentence sets exist for every grade and carry parts, target and zh', () => {
  for (const grade of Object.keys(CURRICULUM)) {
    const set = SENTENCES[grade];
    assert.ok(Array.isArray(set) && set.length, `grade ${grade} has no sentences`);
    for (const s of set) {
      assert.ok(Array.isArray(s.parts) && s.parts.length, `empty parts in grade ${grade}`);
      assert.ok(s.target, `missing target in grade ${grade}`);
      assert.ok(s.zh, `missing zh in grade ${grade}`);
    }
  }
});

test('grade 10 sentences are tokenized from the batch-C source', () => {
  assert.equal(SENTENCES[10].length, G10_BATCH_C_SENTENCES.length);
  assert.deepEqual(SENTENCES[10][0].parts,
    ['Je','veux','devenir','ingénieur','dans','le','futur','.']);
  assert.equal(SENTENCES[10][0].target, G10_BATCH_C_SENTENCES[0].en);
});

test('the words that break naive tile-building are present in the content', () => {
  // Regression anchors: these are the entries that expose the scramble defect.
  const fr = new Set(allVocab.map(w => w.fr));
  for (const w of ['sœur', 'œil', 'arc-en-ciel', "aujourd'hui"])
    assert.ok(fr.has(w), `expected ${w} in the curriculum`);
});
