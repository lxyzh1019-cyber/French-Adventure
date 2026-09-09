import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('built index.html carries the do-not-edit banner', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html.slice(0, 400), /GENERATED FILE - DO NOT EDIT/);
});

test('no inline handler interpolates content into JavaScript', () => {
  // The apostrophe bug class: onclick="fn('" + text + "')". Any reappearance
  // means a French word with an apostrophe will produce invalid inline JS.
  const src = readFileSync('src/app.js', 'utf8');
  const bad = [...src.matchAll(/\bon[a-z]+\s*=\s*\\?["'][^"']*?\(\\?'\s*(?:\+|\$\{)/g)];
  assert.equal(bad.length, 0, `found ${bad.length} interpolated inline handler(s)`);
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
