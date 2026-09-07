import test from 'node:test';
import assert from 'node:assert/strict';
import { frTokenize } from '../src/util/fr-text.js';

test('frTokenize splits words and separates trailing punctuation', () => {
  assert.deepEqual(frTokenize('Je suis content .'), ['Je','suis','content','.']);
  assert.deepEqual(frTokenize('Il y a un chat.'), ['Il','y','a','un','chat','.']);
  assert.deepEqual(frTokenize('Pourquoi ?'), ['Pourquoi','?']);
});

test('frTokenize keeps elisions and hyphens inside one token', () => {
  // These are single words in French; splitting them would make the
  // Sentence Builder unsolvable.
  assert.deepEqual(frTokenize("J'ai dix ans."), ["J'ai",'dix','ans','.']);
  assert.deepEqual(frTokenize("aujourd'hui"), ["aujourd'hui"]);
  assert.deepEqual(frTokenize('arc-en-ciel'), ['arc-en-ciel']);
  assert.deepEqual(frTokenize("Est-ce que c'est vrai ?"), ['Est-ce','que',"c'est",'vrai','?']);
});

test('frTokenize preserves accents and the oe ligature', () => {
  assert.deepEqual(frTokenize("J'ai une sœur."), ["J'ai",'une','sœur','.']);
  assert.deepEqual(frTokenize('Où est la bibliothèque ?'), ['Où','est','la','bibliothèque','?']);
});

test('frTokenize emits each trailing punctuation mark separately', () => {
  assert.deepEqual(frTokenize('Vraiment?!'), ['Vraiment','?','!']);
});

test('frTokenize collapses runs of whitespace', () => {
  assert.deepEqual(frTokenize('  Je    suis   là  '), ['Je','suis','là']);
});

test('frTokenize returns an empty list for empty input', () => {
  assert.deepEqual(frTokenize(''), []);
  assert.deepEqual(frTokenize('   '), []);
});
