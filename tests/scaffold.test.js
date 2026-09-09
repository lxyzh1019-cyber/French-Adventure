import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('built index.html carries the do-not-edit banner', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html.slice(0, 400), /GENERATED FILE - DO NOT EDIT/);
});

test('no inline handler interpolates content into JavaScript', () => {
  // The apostrophe bug class: onclick="fn('" + text + "')". A French word with
  // an apostrophe then produces invalid inline JS, and a word with a quote or a
  // backslash escapes the attribute entirely.
  //
  // The first version of this guard required the concatenation to follow the
  // escaped quote immediately, as \'+ . The live defect read \''+ — a closing
  // quote in between — so the guard matched nothing while the defect it was
  // written for sat in the file. It passed for two milestones without ever
  // being able to fail. It is checked against the unfixed source now.
  //
  // Widened to the real invariant: inside an inline handler's argument list,
  // no concatenation and no template interpolation, whatever is being spliced
  // in. Every generated button carries its parameters as data-* attributes and
  // goes through the delegated listener instead, numbers and enums included —
  // one rule, so the guard needs no exceptions to reason about.
  const src = readFileSync('src/app.js', 'utf8');
  const bad = [...src.matchAll(/\bon[a-z]+\s*=\s*\\?["'][^"'\n]*?\([^)\n]*?(?:\+|\$\{)/g)];
  assert.deepEqual(bad.map(m => m[0]), [],
    `${bad.length} inline handler(s) build their arguments by interpolation`);
});

test('app.js does not declare its own copy of the schema defaults', () => {
  // src/app.js used to declare a second DEFAULT_STATE that had drifted from
  // state/schema.js: no schemaVersion, no roundLog. Anything built from it —
  // including a restored backup — started life shaped like a v0 profile while
  // the rest of the code assumed v2. Aligning the two copies without fixing
  // restoreFromBackup would have been worse than leaving them apart: a
  // restored v0 profile would then carry the *current* version number, and
  // migrateProfile would skip it for good.
  //
  // One definition, in one place. These names must be imported, never redeclared.
  const src = readFileSync('src/app.js', 'utf8');
  for (const name of ['DEFAULT_STATE', 'defaultParentSettings',
                      'defaultGradeUnlocked', 'defaultGradeParentOpen']) {
    const declared = new RegExp(
      String.raw`^\s*(?:export\s+)?(?:const|let|var|function)\s+${name}\b`, 'm');
    assert.equal(declared.test(src), false,
      `${name} is declared in src/app.js; import it from state/schema.js instead`);
  }
});
