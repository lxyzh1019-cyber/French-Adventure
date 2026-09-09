// The content guards, run against the content that once broke them.
//
// Three times a guard flagged legitimate content, and three times the cheap fix
// was to switch the guard off. tests/fixtures/guard-regressions/false-positives.json
// keeps each case. This file runs the guards over it: a guard must accept every
// recorded example, and must still catch the thing it exists to catch.
//
// Both halves matter. A guard that accepts everything is not a guard, so each
// case below is paired with the true positive it must still find.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from './helpers/content-guards.js';

const FIXTURE = JSON.parse(
  readFileSync('tests/fixtures/guard-regressions/false-positives.json', 'utf8'));
const ITEMS = JSON.parse(
  readFileSync('content/releases/assessment-v1/assessment_items.json', 'utf8')).items;
const item = id => ITEMS.find(i => i.id === id);

test('every recorded false positive is covered by a test in this file', () => {
  // A case recorded and then not exercised is a comment, not a regression test.
  const covered = new Set([
    'prompts_containing_verdict_words',
    'prompt_naming_places_that_are_also_brief_labels',
    'model_answers_in_the_bundled_release',
    'brief_words_that_are_another_items_answer_choices',
  ]);
  const recorded = Object.keys(FIXTURE).filter(k => !k.startsWith('_'));
  assert.deepEqual(recorded.filter(k => !covered.has(k)), [],
    'a false positive was recorded without a test that exercises it');
});

// -- no-feedback guard ------------------------------------------------------

/** A minimal snapshot, shaped like the one the page produces. */
const node = (text, extra = {}) => ({
  tag: 'DIV', classes: [], attrs: [], style: ['a', 'b', 'c', 'd', 'e'],
  text, children: [], ...extra,
});

test('the no-feedback guard does not read the words a prompt uses', () => {
  // "Listen and choose the correct schedule." A word scan flagged the bank's
  // own English. The guard now asks a different question: does the screen
  // change according to whether the answer was right?
  for (const prompt of FIXTURE.prompts_containing_verdict_words.examples) {
    const screen = node('', { children: [node(prompt)] });
    assert.deepEqual(G.differences(screen, structuredClone(screen)), [],
      `a legitimate prompt was flagged as feedback: "${prompt}"`);
  }
  // And those prompts really are in the shipped bank, so this is not a
  // hypothetical the guard is being excused from.
  const live = ITEMS.filter(i => /\bcorrect\b/i.test(i.prompt_en || ''));
  assert.ok(live.length > 0, 'the bank no longer contains the prompts this case is about');
});

test('the no-feedback guard still catches a verdict', () => {
  const right = node('', { children: [node('Listen and choose the correct schedule.')] });

  const withVerdict = structuredClone(right);
  withVerdict.children.push(node('Bien joue!'));
  assert.ok(G.differences(right, withVerdict).length > 0, 'an added verdict line was not caught');

  const wordless = structuredClone(right);
  wordless.children[0].style = ['rgb(0, 200, 0)', 'b', 'c', 'd', 'e'];
  assert.ok(G.differences(right, wordless).length > 0,
    'a verdict shown only as colour was not caught');

  const marked = structuredClone(right);
  marked.children[0].classes = ['is-right'];
  assert.ok(G.differences(right, marked).length > 0, 'a verdict class was not caught');
});

test('the guard allows the screen to show which option was chosen', () => {
  // Chosenness is not a verdict, and the child has to be able to see it. The
  // guard drops those marks and compares everything else.
  const chosen = i => node('option', {
    tag: 'BUTTON', classes: i ? ['assess-choice', 'chosen'] : ['assess-choice'],
    attrs: [['aria-pressed', String(!!i)], ['data-choice', 'a']],
  });
  const ignore = { ignoreClasses: ['chosen'], ignoreAttrs: ['aria-pressed'] };
  assert.deepEqual(G.differences(chosen(true), chosen(false), ignore), []);
  assert.ok(G.differences(chosen(true), chosen(false)).length > 0,
    'the ignore list is doing nothing, so it proves nothing');
});

// -- model-answer guard -----------------------------------------------------

test('a model answer in the bundled release is not a model answer on screen', () => {
  const models = FIXTURE.model_answers_in_the_bundled_release.examples;
  const page = readFileSync('index.html', 'utf8');

  for (const m of models) {
    // The release is inlined on purpose, so the file does contain it. That is
    // the documented risk in known-risks.md, not a bug the guard can find.
    assert.ok(G.occurs(page, m), `the fixture no longer matches the bundle: "${m}"`);
  }

  // What the guard reads is what the container rendered.
  const rendered = ['Write one complete French sentence to introduce yourself.', 'Next', 'assess-submit-item'];
  assert.deepEqual(G.leakedStrings(rendered, models), [],
    'the bundled release was reported as being on screen');
});

test('the model-answer guard still catches one that is rendered', () => {
  const models = ITEMS.map(i => i.scoring?.model_response).filter(Boolean);
  assert.ok(models.length > 0, 'the release no longer carries model responses');
  assert.deepEqual(G.leakedStrings(['Write a sentence.', models[0]], models), [models[0]],
    'a model answer put on screen was not caught');
  // Including as an attribute value, which is where a placeholder would put it.
  assert.deepEqual(G.leakedStrings([`placeholder=${models[0]}`], models), [models[0]],
    'a model answer used as a placeholder was not caught');
});

// -- asset-brief guard ------------------------------------------------------

test('a place the prompt itself names is not a leaked brief label', () => {
  const cases = FIXTURE.prompt_naming_places_that_are_also_brief_labels.examples;
  for (const c of cases) {
    const it = item(c.item);
    assert.ok(it, `${c.item} is no longer in the bank`);
    assert.equal(it.prompt_en, c.prompt, `${c.item}'s prompt has changed since this was recorded`);
    assert.deepEqual([...(it.stimulus.required_labels || [])].sort(), [...c.brief_labels].sort(),
      `${c.item}'s brief labels have changed since this was recorded`);

    // The prompt is the only thing on screen besides the picture, and none of
    // what it says counts as a leak.
    const leaked = G.leakedStrings([c.prompt], G.briefOnlyPhrases(it).map(p => p.phrase));
    assert.deepEqual(leaked, [], `${c.item}'s own prompt was reported as a leaked brief`);

    for (const named of ['school', 'library', 'park'].filter(w => G.occurs(c.prompt, w))) {
      assert.equal(G.briefOnlyPhrases(it).some(p => G.occurs(named, p.phrase)), false,
        `${c.item}: "${named}" is in its own prompt and must not be guarded against`);
    }
  }
});

test('the asset-brief guard still catches the rest of the brief', () => {
  for (const id of ['SA-D02', 'SB-D02', 'SA-F02', 'SB-F02']) {
    const it = item(id);
    const phrases = G.briefOnlyPhrases(it);
    assert.ok(phrases.length > 0, `${id}: nothing at all is guarded against`);

    // Every brief-only phrase must be caught when it is actually rendered.
    for (const { field, phrase } of phrases) {
      assert.deepEqual(G.leakedStrings([it.prompt_en, phrase], [phrase]), [phrase],
        `${id}: ${field} "${phrase}" would not be caught on screen`);
    }
    // And the parts of the brief that never reach a learner are the parts that
    // describe the drawing, not the parts the prompt already says.
    assert.ok(phrases.some(p => p.field !== 'required_labels'),
      `${id}: only labels are guarded, so the drawing instructions are not`);
  }
});

test('a brief word another item legitimately shows is not a leak', () => {
  // "chair" and "table" are SA-F02's brief and are also the English choice
  // labels of items answered earlier in the same sitting. The guard reads the
  // item on screen, so the earlier items are not its business.
  const c = FIXTURE.brief_words_that_are_another_items_answer_choices.examples;
  const brief = item(c[0].item);
  assert.deepEqual([...brief.stimulus.required_elements].sort(), [...c[0].brief_elements].sort(),
    'SA-F02 brief has changed since this was recorded');

  const elsewhere = ITEMS.filter(i => (i.choices || []).some(ch =>
    G.occurs(ch.label, 'chair') || G.occurs(ch.label, 'table')));
  assert.ok(elsewhere.length >= 4, 'the bank no longer shows these words elsewhere');

  const guarded = G.briefOnlyPhrases(brief).map(p => p.phrase);
  // What SA-F02's own screen renders: its prompt and its wordless picture.
  assert.deepEqual(G.leakedStrings([brief.prompt_en], guarded), [],
    'the speaking item was flagged for words it does not show');
  // The words really are guarded against - on that item's own screen.
  assert.deepEqual(G.leakedStrings([brief.prompt_en, 'chair'], guarded), ['chair'],
    'the guard would not catch the brief on the item that carries it');
});

test('a whole-word match, so a longer word is not a leak', () => {
  assert.equal(G.occurs('She left the banknote on the desk.', 'bank'), false);
  assert.equal(G.occurs('Go past the bank.', 'bank'), true);
  assert.equal(G.occurs("Je m'appelle Alex.", 'Je m’appelle Alex.'), true,
    'a typographic apostrophe hid a leak');
});
