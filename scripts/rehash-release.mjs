#!/usr/bin/env node
// Recompute a content release's manifest hashes.
//
// scripts/validate-release-a.mjs hashes each file's raw bytes and compares it
// with manifest.json, so any edit to a released package fails the build until
// the manifest is regenerated. Doing that by hand invites a manifest that
// disagrees with the files it describes, which is the one thing the hashes
// exist to prevent.
//
//   node scripts/rehash-release.mjs <dir> [--release-id <id>] [--version <v>]
//
// With --release-id it also rewrites release_id everywhere it appears: the
// top-level field of every JSON document, the per-item field on every item, and
// the Release line in review_notes.md. validate-release-a cross-checks the
// top-level ids against the manifest, and leaving 90 items stamped with the old
// id under a new manifest is exactly the drift the versioning rule exists to
// stop.
//
// Item `version` fields are never touched. A prose or threshold change is not a
// change to an item.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--'));
const flag = name => {
  const i = args.indexOf('--' + name);
  return i === -1 ? null : args[i + 1];
};

if (!dir) {
  console.error('usage: node scripts/rehash-release.mjs <dir> [--release-id <id>] [--version <v>]');
  process.exit(2);
}

const manifestPath = path.join(dir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const newId = flag('release-id');
const newVersion = flag('version');

if (newId) {
  const oldId = manifest.release_id;
  if (!oldId) { console.error('manifest has no release_id to replace'); process.exit(1); }
  let touched = 0;
  for (const f of manifest.files) {
    const p = path.join(dir, f.name);
    const before = readFileSync(p, 'utf8');
    const after = before.split(oldId).join(newId);
    if (after !== before) {
      writeFileSync(p, after);
      touched += before.split(oldId).length - 1;
      console.log(`  ${f.name}: ${before.split(oldId).length - 1} occurrence(s)`);
    }
  }
  console.log(`release_id ${oldId} -> ${newId} (${touched} occurrences)`);
}

// Re-read: the manifest itself may have carried the old id.
const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (newVersion) m.version = newVersion;

for (const f of m.files) {
  if (f.name === 'manifest.json') continue;   // excluded, to avoid self-hashing
  const h = createHash('sha256').update(readFileSync(path.join(dir, f.name))).digest('hex');
  if (f.sha256 !== h) console.log(`  ${f.name}: ${String(f.sha256).slice(0, 12)}… -> ${h.slice(0, 12)}…`);
  f.sha256 = h;
}

writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n');
console.log(`✓ ${dir}: manifest rewritten for ${m.release_id} (version ${m.version})`);
