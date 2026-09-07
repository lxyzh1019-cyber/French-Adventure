// Pure French text helpers. No DOM, no app state — safe to unit test directly.

/**
 * Split a French string into meaningful tokens: words plus each trailing
 * punctuation mark as its own token. Used to build Sentence Builder tiles.
 */
export function frTokenize(s){
  const out = [];
  const str = s.replace(/\s+/g, ' ').trim();
  str.split(/\s+/).forEach(function(tok){
    let t = tok;
    const m = t.match(/^([\s\S]+?)([.!?…,;:«»—–]*)$/);
    if(!m) return;
    if(m[1]) out.push(m[1]);
    if(m[2]) for(let i = 0; i < m[2].length; i++) out.push(m[2][i]);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison
//
// One accent-stripping comparison used to serve every answer check, which meant
// accents were never actually assessed: "ou"/"où", "a"/"à" and "sur"/"sûr" all
// compared equal. These separate the two questions a checker actually has —
// "does this mean the right thing?" and "is it spelled correctly?" — so a
// response can be recorded as meaning-correct but spelling-not-yet, rather than
// silently marked fully right or bluntly wrong.
// ─────────────────────────────────────────────────────────────────────────────

/** Strip diacritics. Note that œ is a distinct letter, not an accented o. */
function stripAccents(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Loose form for meaning / recognition tasks: case, accents, apostrophe style
 * and spacing are all ignored. Use where the question is "did the learner
 * understand?", never to decide whether something is spelled correctly.
 */
export function normalizeForRecognition(text) {
  return stripAccents(String(text))
    .toLowerCase()
    .replace(/[’‘‛]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strict form for spelling tasks: accents, apostrophes, hyphens and œ are all
 * preserved, because in these tasks they are the thing being learned. Only
 * case, curly-quote style and outer whitespace are normalised.
 */
export function normalizeForSpelling(text) {
  return String(text)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘‛]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compare a learner's answer against the target.
 *
 * Returns { meaning, spelling, exact }:
 *   meaning  — right word, ignoring accents and apostrophe style
 *   spelling — right down to every accent, apostrophe and hyphen
 *   exact    — identical apart from case and surrounding whitespace
 *
 * meaning === true with spelling === false is the interesting case: the learner
 * knew the word and missed a diacritic. That deserves partial credit and a
 * targeted correction, not a plain "wrong".
 */
export function compareFrench(answer, target) {
  const a = String(answer ?? ''), t = String(target ?? '');
  return {
    meaning:  normalizeForRecognition(a) === normalizeForRecognition(t),
    spelling: normalizeForSpelling(a)    === normalizeForSpelling(t),
    exact:    a.trim().toLowerCase()     === t.trim().toLowerCase(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scramble item construction
//
// Tiles used to be built by deleting everything outside [a-zàâäéèêëîïôùûüç] and
// then comparing the assembled result against the *unmodified* target. That
// silently dropped apostrophes, hyphens, spaces and œ (which is a distinct
// letter, absent from that class), so any word containing one became literally
// unsolvable. œil and arc-en-ciel ship in the vocabulary.
//
// The fix is to choose an item type from the shape of the target and to emit
// every tile the accepted answer actually needs.
// ─────────────────────────────────────────────────────────────────────────────

export const SCRAMBLE_TYPES = {
  WORD: 'word',        // a single plain word -> letter tiles
  SPELLING: 'spelling',// one word with punctuation/ligature -> letter tiles incl. those marks
  PHRASE: 'phrase',    // several words -> word tiles, order is the task
};

/** Split a string into user-visible characters, keeping œ and accents whole. */
function graphemes(text) {
  return [...String(text).normalize('NFC')];
}

/** Choose the item type that makes a given target solvable and worth solving. */
export function scrambleTypeFor(target) {
  const t = String(target).trim();
  if (/\s/.test(t)) return SCRAMBLE_TYPES.PHRASE;
  // Anything that is not a letter — apostrophe, hyphen, ellipsis — makes this a
  // spelling item, because reproducing that mark is part of the answer.
  if (/[^\p{L}]/u.test(t)) return SCRAMBLE_TYPES.SPELLING;
  return SCRAMBLE_TYPES.WORD;
}

/**
 * Build the tiles for a target. Every tile needed to assemble the answer is
 * present, and nothing else — so the item is always solvable.
 *
 * Phrase targets tokenize into word and punctuation tiles rather than letters:
 * letter-scrambling a multi-word phrase asks a child to rediscover the spaces,
 * which is a different (and much harder) task than the one intended.
 */
export function buildScrambleTiles(target, type = scrambleTypeFor(target)) {
  const t = String(target).trim();
  if (type === SCRAMBLE_TYPES.PHRASE) return frTokenize(t);
  return graphemes(t);
}

/** Join assembled tiles back into a candidate answer for the given item type. */
export function joinScrambleTiles(tiles, type) {
  if (type !== SCRAMBLE_TYPES.PHRASE) return tiles.join('');
  // Punctuation attaches to the preceding word; other tokens are space-separated.
  return tiles.reduce((acc, tok) =>
    !acc ? tok : (/^[.!?…,;:»—–]$/.test(tok) ? acc + tok : acc + ' ' + tok), '');
}

/**
 * True when `tiles` can actually be rearranged into `target`.
 *
 * Every generated item is checked with this before it can be shown, so an
 * unsolvable question can never reach a child again.
 */
export function isScrambleSolvable(tiles, target, type = scrambleTypeFor(target)) {
  const need = buildScrambleTiles(target, type);
  if (tiles.length !== need.length) return false;
  const bag = [...tiles];
  for (const tile of need) {
    const i = bag.indexOf(tile);
    if (i < 0) return false;
    bag.splice(i, 1);
  }
  return normalizeForSpelling(joinScrambleTiles(need, type)) === normalizeForSpelling(target);
}
