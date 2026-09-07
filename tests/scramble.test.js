import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCRAMBLE_TYPES, scrambleTypeFor, buildScrambleTiles,
  joinScrambleTiles, isScrambleSolvable, compareFrench,
  normalizeForRecognition, normalizeForSpelling,
} from '../src/util/fr-text.js';
import { CURRICULUM } from '../src/content/curriculum-map.js';

// The eight cases the plan requires, plus the two live failures found in the
// shipped vocabulary. Every one of these was unsolvable before.
const REQUIRED = ['sœur','œil','grand-mère','arc-en-ciel',
                  "aujourd'hui","j'ai mangé",'ne...pas',"je t'en prie"];

test('every required regression case is solvable from its own tiles', () => {
  for (const word of REQUIRED) {
    const type = scrambleTypeFor(word);
    const tiles = buildScrambleTiles(word, type);
    assert.ok(isScrambleSolvable(tiles, word, type), `${word} is not solvable`);
    assert.equal(joinScrambleTiles(tiles, type), word, `${word} does not reassemble`);
  }
});

test('the old tile-building rule really did break these', () => {
  // Guards against anyone reintroducing the narrow letter class.
  const OLD = /[^a-zàâäéèêëîïôùûüç]/gi;
  for (const word of REQUIRED)
    assert.notEqual(word.replace(OLD, ''), word,
      `${word} would survive the old rule - pick a better regression case`);
});

test('item type follows the shape of the target', () => {
  assert.equal(scrambleTypeFor('chien'), SCRAMBLE_TYPES.WORD);
  assert.equal(scrambleTypeFor('sœur'), SCRAMBLE_TYPES.WORD);      // œ is a letter
  assert.equal(scrambleTypeFor('bibliothèque'), SCRAMBLE_TYPES.WORD);
  assert.equal(scrambleTypeFor('grand-mère'), SCRAMBLE_TYPES.SPELLING);
  assert.equal(scrambleTypeFor("aujourd'hui"), SCRAMBLE_TYPES.SPELLING);
  assert.equal(scrambleTypeFor("j'ai mangé"), SCRAMBLE_TYPES.PHRASE);
});

test('a multi-word phrase never becomes a letter scramble', () => {
  // Letter-scrambling a phrase asks the child to rediscover the spaces, which
  // is a different and much harder task than the one intended.
  const tiles = buildScrambleTiles("je t'en prie");
  assert.deepEqual(tiles, ['je', "t'en", 'prie']);
  assert.ok(tiles.every(t => !t.includes(' ')));
});

test('œ survives as one tile and is never dropped', () => {
  assert.deepEqual(buildScrambleTiles('sœur'), ['s','œ','u','r']);
  assert.deepEqual(buildScrambleTiles('œil'), ['œ','i','l']);
});

test('accents ride along with their letter', () => {
  assert.deepEqual(buildScrambleTiles('mère'), ['m','è','r','e']);
  assert.deepEqual(buildScrambleTiles('français'), ['f','r','a','n','ç','a','i','s']);
});

test('solvability rejects tiles that cannot produce the target', () => {
  assert.equal(isScrambleSolvable(['s','u','r'], 'sœur'), false);      // the old bug
  assert.equal(isScrambleSolvable(['i','l'], 'œil'), false);           // the old bug
  assert.equal(isScrambleSolvable(['c','h','i','e'], 'chien'), false); // missing tile
  assert.equal(isScrambleSolvable(['c','h','i','e','n','s'], 'chien'), false); // extra
});

test('every scramble-eligible word in the curriculum is solvable', () => {
  // The real guarantee: no child can be handed an impossible question.
  const words = Object.values(CURRICULUM)
    .flatMap(topics => Object.values(topics).flatMap(t => t.vocab.map(w => w.fr)));
  const broken = words.filter(w => {
    const type = scrambleTypeFor(w);
    return !isScrambleSolvable(buildScrambleTiles(w, type), w, type);
  });
  assert.deepEqual(broken, [], `${broken.length} unsolvable words`);
  assert.ok(words.length > 400, 'expected the full vocabulary to be checked');
});

test('phrase tiles rejoin with punctuation attached to the preceding word', () => {
  assert.equal(joinScrambleTiles(['Il','y','a','un','chat','.'], SCRAMBLE_TYPES.PHRASE),
               'Il y a un chat.');
  assert.equal(joinScrambleTiles(['Pourquoi','?'], SCRAMBLE_TYPES.PHRASE), 'Pourquoi?');
});

test('accents are assessed, not silently ignored', () => {
  // The old single comparison treated all of these as fully correct.
  for (const [wrong, right] of [['ou','où'], ['a','à'], ['sur','sûr'], ['mere','mère']]) {
    const cmp = compareFrench(wrong, right);
    assert.equal(cmp.meaning, true,  `${wrong} should match ${right} on meaning`);
    assert.equal(cmp.spelling, false, `${wrong} must NOT count as spelling ${right}`);
  }
});

test('a correct answer is correct on every axis', () => {
  const cmp = compareFrench('où', 'où');
  assert.deepEqual(cmp, { meaning: true, spelling: true, exact: true });
});

test('spelling comparison tolerates case, curly quotes and stray spacing', () => {
  assert.equal(compareFrench("Aujourd'hui", "aujourd'hui").spelling, true);
  assert.equal(compareFrench("aujourd’hui", "aujourd'hui").spelling, true);  // curly
  assert.equal(compareFrench('  sœur  ', 'sœur').spelling, true);
});

test('recognition ignores accents, spelling does not', () => {
  assert.equal(normalizeForRecognition('Où Est'), 'ou est');
  assert.equal(normalizeForSpelling('Où Est'), 'où est');
  assert.equal(normalizeForSpelling('sœur'), 'sœur');   // œ is never decomposed
  assert.equal(normalizeForRecognition('sœur'), 'sœur');
});
