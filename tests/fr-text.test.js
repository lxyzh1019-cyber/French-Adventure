import test from 'node:test';
import assert from 'node:assert/strict';
import { frTokenize, joinFrenchParts, joinScrambleTiles, SCRAMBLE_TYPES } from '../src/util/fr-text.js';

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

test('joinFrenchParts attaches punctuation to the word before it', () => {
  assert.equal(joinFrenchParts(['Le', 'crayon', 'est', 'rouge', '.']), 'Le crayon est rouge.');
  assert.equal(joinFrenchParts(['Comment', 'tu', "t'appelles", '?']), "Comment tu t'appelles?");
  assert.equal(joinFrenchParts(['Oui', ',', 'merci', '!']), 'Oui, merci!');
  assert.equal(joinFrenchParts(['Vraiment', '?', '!']), 'Vraiment?!');
});

test('joinFrenchParts keeps elisions and hyphens as one word', () => {
  assert.equal(joinFrenchParts(["J'ai", 'dix', 'ans', '.']), "J'ai dix ans.");
  assert.equal(joinFrenchParts(['Est-ce', 'que', "c'est", 'vrai', '?']), "Est-ce que c'est vrai?");
});

test('joinFrenchParts handles a blank, one word and no parts', () => {
  assert.equal(joinFrenchParts(['Le', '______', 'est', 'rouge', '.']), 'Le ______ est rouge.');
  assert.equal(joinFrenchParts(['bonjour']), 'bonjour');
  assert.equal(joinFrenchParts([]), '');
});

test('joinFrenchParts round-trips frTokenize and matches the phrase-scramble join', () => {
  for (const s of ['Je suis content.', "J'ai une sœur.", 'Où est la bibliothèque?']) {
    assert.equal(joinFrenchParts(frTokenize(s)), s);
    assert.equal(joinScrambleTiles(frTokenize(s), SCRAMBLE_TYPES.PHRASE), joinFrenchParts(frTokenize(s)));
  }
});
