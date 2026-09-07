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
