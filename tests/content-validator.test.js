import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, rmSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A guard that never fires is worthless, so every check below breaks a package
// deliberately and asserts the validator catches it.

function run(dir) {
  try {
    execFileSync('node', ['scripts/check-content.mjs', dir], { encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, output: '' };
  } catch (e) {
    return { ok: false, output: (e.stdout || '') + (e.stderr || '') };
  }
}

/** Copy a fixture package, mutate one file, and validate the result. */
function withPackage(fixture, mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'content-'));
  cpSync(fixture, dir, { recursive: true });
  try {
    if (mutate) mutate({
      dir,
      read: f => JSON.parse(readFileSync(join(dir, f), 'utf8')),
      write: (f, v) => writeFileSync(join(dir, f), JSON.stringify(v, null, 1)),
      remove: f => unlinkSync(join(dir, f)),
    });
    return run(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const A = 'tests/fixtures/content-a';
const B = 'tests/fixtures/content-b';

test('a well-formed package passes', () => {
  assert.equal(withPackage(A).ok, true, 'valid Release A was rejected');
  assert.equal(withPackage(B).ok, true, 'valid Release B was rejected');
});

test('a missing contract file is caught', () => {
  const r = withPackage(A, ({ remove }) => remove('rubrics.json'));
  assert.equal(r.ok, false);
  assert.match(r.output, /rubrics\.json.*missing/);
});

test('placeholder text in child-facing content is caught', () => {
  // The plan is explicit that placeholders must never be promoted into content.
  const r = withPackage(A, ({ read, write }) => {
    const d = read('assessment_items.json');
    d.forms[0].items[0].prompt = 'TODO: write this prompt';
    write('assessment_items.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /placeholder text/i);
});

test('a missing zh is caught — amendment 1', () => {
  // All 461 existing vocabulary entries carry Chinese; the contracts never
  // mention it, so without this check it would silently disappear.
  const r = withPackage(A, ({ read, write }) => {
    const d = read('assessment_items.json');
    delete d.forms[0].items[0].zh;
    write('assessment_items.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /missing `zh`/);
});

test('an assessment item exposing zh is caught — amendment 2', () => {
  // A translation is support, which the plan's Level 0 rule forbids in assessment.
  const r = withPackage(A, ({ read, write }) => {
    const d = read('assessment_items.json');
    d.forms[0].items[0].showZh = true;
    write('assessment_items.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /exposes `zh` during an assessment/);
});

test('an item with no accepted answer is caught', () => {
  const r = withPackage(A, ({ read, write }) => {
    const d = read('assessment_items.json');
    delete d.forms[0].items[1].accepted;
    write('assessment_items.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /no accepted answer/);
});

test('a listening item with no audio script is caught', () => {
  const r = withPackage(A, ({ read, write }) => {
    const d = read('assessment_items.json');
    delete d.forms[0].items[0].audioScript;
    write('assessment_items.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /no audio script/);
});

test('forms sharing an item id are caught', () => {
  // Two forms exist so a child can be retested without having seen the items.
  const r = withPackage(A, ({ read, write }) => {
    const d = read('assessment_items.json');
    d.forms[1].items[0].id = d.forms[0].items[0].id;
    write('assessment_items.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /share \d+ item id|duplicate id/);
});

test('a prompt reused across forms is caught', () => {
  const r = withPackage(A, ({ read, write }) => {
    const d = read('assessment_items.json');
    d.forms[1].items[0].prompt = d.forms[0].items[0].prompt;
    write('assessment_items.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /prompt reused across forms/);
});

test('a single-form package is caught', () => {
  const r = withPackage(A, ({ read, write }) => {
    const d = read('assessment_items.json');
    d.forms = [d.forms[0]];
    write('assessment_items.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /at least two are required/);
});

test('manifest counts that disagree with the files are caught', () => {
  const r = withPackage(A, ({ read, write }) => {
    const m = read('manifest.json');
    m.counts.items = 99;
    write('manifest.json', m);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /declares 99 items but the files contain 4/);
});

test('a curriculum outcome with no source or date is caught', () => {
  const r = withPackage(A, ({ read, write }) => {
    const d = read('curriculum_map.json');
    delete d.outcomes[0].source;
    delete d.outcomes[0].retrievedAt;
    write('curriculum_map.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /cites no source|no date the source was checked/);
});

test('missing scoring-fixture cases are caught', () => {
  // Fixtures are what let the implementation be checked against the author's
  // intent rather than the implementer's reading of the rules.
  const r = withPackage(A, ({ read, write }) => {
    const d = read('scoring_fixtures.json');
    d.cases = d.cases.filter(c => c.kind !== 'invalid');
    write('scoring_fixtures.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /no "invalid" case/);
});

test('the wrong number of chapters is caught', () => {
  const r = withPackage(B, ({ read, write }) => {
    const d = read('chapters.json');
    d.chapters.pop();
    write('chapters.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /contains 3 chapters; the pilot scope is 4/);
});

test('a chapter with no safe stopping point is caught', () => {
  // A 20-minute session has to be able to end somewhere.
  const r = withPackage(B, ({ read, write }) => {
    const d = read('chapters.json');
    delete d.chapters[0].session_bookmarks;
    write('chapters.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /no safe stopping point/);
});

test('an item referencing an undefined skill is caught', () => {
  const r = withPackage(B, ({ read, write }) => {
    const d = read('learning_items.json');
    d.items[0].skillIds = ['s.does.not.exist'];
    write('learning_items.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /references unknown skill/);
});

test('a delayed check reusing the teaching item is caught', () => {
  // Re-asking the same item measures recall of that item, not retention.
  const r = withPackage(B, ({ read, write }) => {
    const d = read('review_items.json');
    d.items[0].id = 'l-1';
    write('review_items.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /same item taught in learning_items/);
});

test('a history claim with no source is caught', () => {
  const r = withPackage(B, ({ read, write }) => {
    const d = read('history_sources.json');
    delete d.claims[0].source;
    write('history_sources.json', d);
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /has no source/);
});

test('a directory that is not a content package is rejected clearly', () => {
  const r = run('docs');
  assert.equal(r.ok, false);
  assert.match(r.output, /does not look like Release A or Release B/);
});
