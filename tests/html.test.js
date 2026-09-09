// escapeAttr, tested by importing it.
//
// Its previous coverage was tests/browser/regression.test.js, which defined its
// own escaper inside the page and asserted against that — a test of the test.
// The real function could have regressed without failing anything.

import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeAttr } from '../src/util/html.js';

test('the five HTML-significant characters are escaped', () => {
  assert.equal(escapeAttr('&'), '&amp;');
  assert.equal(escapeAttr('"'), '&quot;');
  assert.equal(escapeAttr("'"), '&#39;');
  assert.equal(escapeAttr('<'), '&lt;');
  assert.equal(escapeAttr('>'), '&gt;');
});

test('& is escaped before the entities the other replacements introduce', () => {
  // Replacing " before & would yield &amp;quot; — the classic double-escape.
  assert.equal(escapeAttr('a & "b"'), 'a &amp; &quot;b&quot;');
  assert.equal(escapeAttr('&amp;'), '&amp;amp;');
});

test('French apostrophes survive as an escaped entity, not raw', () => {
  // The reason this function is hardened at all: apostrophes are ordinary
  // content in this app, and they used to pass through untouched.
  for (const w of ["aujourd'hui", "j'ai mangé", "l'école", "s'il vous plaît", "je t'en prie"]) {
    const out = escapeAttr(w);
    assert.ok(!out.includes("'"), `${w} still contains a raw apostrophe`);
    assert.ok(out.includes('&#39;'), `${w} lost its apostrophe entirely`);
  }
});

test('accents, œ and other letters are left alone', () => {
  assert.equal(escapeAttr('sœur'), 'sœur');
  assert.equal(escapeAttr('grand-mère'), 'grand-mère');
  assert.equal(escapeAttr('arc-en-ciel'), 'arc-en-ciel');
  assert.equal(escapeAttr('où'), 'où');
});

test('a single-quoted attribute cannot be broken out of', () => {
  // Every attribute this app writes is double-quoted, so the apostrophe was
  // survivable. That is a property of the call sites, not of the escaper.
  const evil = "x' onmouseover='alert(1)";
  const html = `<div title='${escapeAttr(evil)}'>`;
  assert.ok(!/title='x'\s/.test(html), 'the attribute was closed early');
  assert.ok(!html.includes("onmouseover='"), 'an attribute was injected');
});

test('non-string input is coerced rather than thrown on', () => {
  assert.equal(escapeAttr(3), '3');
  assert.equal(escapeAttr(null), 'null');
  assert.equal(escapeAttr(undefined), 'undefined');
});
