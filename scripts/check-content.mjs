// Validate a delivered content package against the contracts in the master plan
// (Release A, §5.4; Release B, §5.5).
//
//   npm run check:content -- <path-to-package-directory>
//
// The point is to catch a broken package the day it arrives, rather than three
// days into implementing against it. It checks structure, internal consistency,
// and the two amendments this project added to the contracts:
//
//   - every LEARNING item carries `zh`, because all 461 existing vocabulary
//     entries do and the contracts never mention it;
//   - no ASSESSMENT item exposes `zh`, because a translation is support and the
//     plan's own Level 0 rule forbids support during assessment.
//
// Amendment 1 was originally written to cover assessment items too. The
// delivered Release A carries no `zh` at all, deliberately and for exactly the
// reason behind amendment 2: a translation is support, and support is barred
// during assessment. Requiring it there contradicted the rule beside it, so it
// now applies to learning content only.
//
// Content packages have been delivered in more than one shape — a flat `items`
// array with a `form` field per item, or a `forms` array each holding its own
// items; `answer_key.accepted_answers` or a top-level `accepted`. Each check
// below accepts either, because a contract is about what a package must say,
// not which spelling it says it in. A check that silently matches nothing is
// worse than no check, so where a shape is not recognised the item is reported
// rather than skipped.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RELEASE_A = {
  name: 'Release A — Assessment Content',
  files: ['manifest.json', 'assessment_items.json', 'assessment_rules.json',
          'rubrics.json', 'curriculum_map.json', 'scoring_fixtures.json',
          'review_notes.md'],
};
const RELEASE_B = {
  name: 'Release B — Learning/Story Content',
  files: ['manifest.json', 'chapters.json', 'learning_items.json',
          'review_items.json', 'skills.json', 'pronunciation_tasks.json',
          'history_sources.json', 'learning_fixtures.json', 'review_notes.md'],
};

const PLACEHOLDER = /\b(TODO|TBD|FIXME|XXX|PLACEHOLDER|LOREM IPSUM|COMING SOON)\b/i;

const problems = [];
const notes = [];
const fail = (file, msg) => problems.push(`${file}: ${msg}`);

function readJSON(dir, file) {
  try { return JSON.parse(readFileSync(join(dir, file), 'utf8')); }
  catch (e) { fail(file, `could not be read as JSON — ${e.message}`); return null; }
}

/** Walk every string in a structure, so placeholder text cannot hide in nesting. */
function* strings(node, path = '') {
  if (typeof node === 'string') { yield [path, node]; return; }
  if (Array.isArray(node)) {
    for (const [i, v] of node.entries()) yield* strings(v, `${path}[${i}]`);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) yield* strings(v, path ? `${path}.${k}` : k);
  }
}

const itemsOf = doc => Array.isArray(doc) ? doc
  : Array.isArray(doc?.items) ? doc.items
  : Array.isArray(doc?.forms) ? doc.forms.flatMap(f => f.items || [])
  : [];

/**
 * Group items into forms, however the package expresses them: an explicit
 * `forms` array, or a flat item list where each item names its own `form`.
 * Returns null when the package declares no forms at all, which for an
 * assessment package is itself a failure.
 */
function formsOf(doc) {
  if (Array.isArray(doc?.forms) && doc.forms.length) {
    return doc.forms.map((f, i) => ({ name: f.form ?? f.name ?? String(i), items: f.items || [] }));
  }
  const byForm = new Map();
  for (const item of itemsOf(doc)) {
    if (!item?.form) continue;
    if (!byForm.has(item.form)) byForm.set(item.form, []);
    byForm.get(item.form).push(item);
  }
  return byForm.size ? [...byForm].map(([name, items]) => ({ name, items })) : null;
}

/** The learner-facing prompt, whichever field carries it. */
const promptOf = item => item.prompt ?? item.prompt_en ?? '';

/** Does this item state an accepted answer, in any of the shapes in use? */
function hasAcceptedAnswer(item) {
  // A rubric-scored open response has no key by design: a human scores it
  // against the rubric, and validate-release-a.mjs checks the rubric link.
  if (item.scoring?.method === 'analytic_rubric' || item.rubric_id || item.scoring?.rubric_id) return true;
  const key = item.answer_key ?? {};
  const candidates = [item.accepted, item.acceptedAnswers, item.answer, item.correct,
                      key.accepted_answers, key.correct_choice_ids, key.correct_order];
  return candidates.some(v => v !== undefined && (!Array.isArray(v) || v.length > 0));
}

/** Is this a listening item, and does it carry a script to read aloud? */
const isListening = item => item.type === 'listening' || item.domain === 'listening';
const audioScriptOf = item => item.audioScript ?? item.audio?.script_fr_ca;

function detectRelease(dir) {
  const present = new Set(readdirSync(dir));
  if (present.has('assessment_items.json')) return RELEASE_A;
  if (present.has('chapters.json') || present.has('learning_items.json')) return RELEASE_B;
  return null;
}

function checkRequiredFiles(dir, spec) {
  for (const f of spec.files) {
    if (!existsSync(join(dir, f))) fail(f, 'required by the contract but missing');
  }
}

function checkNoPlaceholders(dir, spec) {
  for (const f of spec.files) {
    if (!existsSync(join(dir, f))) continue;
    if (f.endsWith('.md')) continue;                 // notes may discuss TODOs
    const doc = readJSON(dir, f);
    if (!doc) continue;
    for (const [path, value] of strings(doc)) {
      if (PLACEHOLDER.test(value)) {
        fail(f, `placeholder text at ${path}: ${JSON.stringify(value.slice(0, 60))}`);
      }
    }
  }
}

function checkManifestCounts(dir, actualCounts) {
  const manifest = readJSON(dir, 'manifest.json');
  if (!manifest) return;
  if (!manifest.version) fail('manifest.json', 'no version');
  // `counts: {items: n}` or a top-level `total_items` — both are a declared
  // total to hold the files to.
  const declaredCounts = manifest.counts
    ?? (manifest.total_items !== undefined ? { items: manifest.total_items } : null);
  if (!declaredCounts) { notes.push('manifest.json declares no counts to cross-check'); return; }
  for (const [key, declared] of Object.entries(declaredCounts)) {
    const actual = actualCounts[key];
    if (actual === undefined) { notes.push(`manifest counts "${key}", which this check does not know how to verify`); continue; }
    if (Number(declared) !== actual) {
      fail('manifest.json', `declares ${declared} ${key} but the files contain ${actual}`);
    }
  }
}

function checkItemsCommon(file, items, { isAssessment }) {
  const seen = new Map();
  items.forEach((item, i) => {
    const where = `${file}[${item?.id ?? i}]`;
    if (!item || typeof item !== 'object') { fail(where, 'is not an object'); return; }
    if (!item.id) fail(where, 'has no stable id');
    else if (seen.has(item.id)) fail(where, `duplicate id, also at index ${seen.get(item.id)}`);
    else seen.set(item.id, i);

    if (!hasAcceptedAnswer(item)) fail(where, 'has no accepted answer');

    // Amendment 1: Chinese is part of this project's content contract — for
    // learning content. Assessment items carry no translation on purpose; see
    // amendment 2 and the note at the top of this file.
    if (!isAssessment && (item.zh === undefined || item.zh === '')) {
      fail(where, 'is missing `zh`');
    }

    // Amendment 2: an assessment item must not hand the learner a translation.
    if (isAssessment && item.zh !== undefined && item.showZh) {
      fail(where, 'exposes `zh` during an assessment item — a translation is support');
    }

    if (isListening(item) && !audioScriptOf(item)) {
      fail(where, 'is a listening item with no audio script');
    }
  });
  return seen;
}

function checkReleaseA(dir) {
  const doc = readJSON(dir, 'assessment_items.json');
  if (!doc) return {};
  const forms = formsOf(doc);
  const items = itemsOf(doc);
  if (!items.length) fail('assessment_items.json', 'contains no items');

  checkItemsCommon('assessment_items.json', items, { isAssessment: true });

  if (!forms) {
    fail('assessment_items.json', 'declares no A/B forms — a repeat assessment needs an alternate form');
  } else {
    if (forms.length < 2) fail('assessment_items.json', `has ${forms.length} form(s); at least two are required`);
    const byForm = forms.map(f => new Set(f.items.map(i => i.id)));
    for (let a = 0; a < byForm.length; a++) {
      for (let b = a + 1; b < byForm.length; b++) {
        const shared = [...byForm[a]].filter(id => byForm[b].has(id));
        if (shared.length) {
          fail('assessment_items.json',
            `forms ${a} and ${b} share ${shared.length} item id(s) — they are not independent: ${shared.slice(0, 3).join(', ')}`);
        }
      }
    }
    const prompts = new Map();
    for (const f of forms) for (const item of f.items) {
      const p = promptOf(item).trim().toLowerCase();
      if (!p) continue;
      if (prompts.has(p)) fail('assessment_items.json', `prompt reused across forms: ${JSON.stringify(p.slice(0, 50))}`);
      else prompts.set(p, item.id);
    }
  }

  // Scoring fixtures are what let an implementation be checked against the
  // author's intent rather than the implementer's reading of the rules.
  const fixtures = existsSync(join(dir, 'scoring_fixtures.json')) && readJSON(dir, 'scoring_fixtures.json');
  if (fixtures) {
    const cases = Array.isArray(fixtures) ? fixtures : fixtures.cases || fixtures.fixtures || [];
    if (!cases.length) fail('scoring_fixtures.json', 'contains no cases');
    // `technically_invalid` is the same case as `invalid` under another name:
    // a response that could not be scored, which must never become "wrong".
    const kinds = new Set(cases.map(c => {
      const k = c.kind || c.result || c.case;
      return k === 'technically_invalid' ? 'invalid' : k;
    }));
    for (const kind of ['correct', 'partial', 'incorrect', 'invalid']) {
      if (!kinds.has(kind)) fail('scoring_fixtures.json', `has no "${kind}" case`);
    }
  }

  const map = existsSync(join(dir, 'curriculum_map.json')) && readJSON(dir, 'curriculum_map.json');
  if (map) {
    const entries = Array.isArray(map) ? map : map.outcomes || [];
    // Sources may be cited per outcome, or once for the whole map with the
    // outcomes carrying locators into it. Both say where the outcome came
    // from and when it was checked; neither may be missing.
    const centralSources = Array.isArray(map.sources) && map.sources.length;
    const centralDate = map.retrieval_date || map.retrievedAt || map.checkedAt;
    for (const [i, o] of entries.entries()) {
      if (!o.source && !centralSources) fail('curriculum_map.json', `outcome ${o.id ?? i} cites no source document`);
      if (!o.retrievedAt && !o.checkedAt && !centralDate) {
        fail('curriculum_map.json', `outcome ${o.id ?? i} has no date the source was checked`);
      }
    }
  }

  return { items: items.length };
}

function checkReleaseB(dir) {
  const chapters = readJSON(dir, 'chapters.json');
  const learning = readJSON(dir, 'learning_items.json');
  const review = readJSON(dir, 'review_items.json');
  const skills = readJSON(dir, 'skills.json');

  const chapterList = Array.isArray(chapters) ? chapters : chapters?.chapters || [];
  if (chapterList.length !== 4) {
    fail('chapters.json', `contains ${chapterList.length} chapters; the pilot scope is 4`);
  }
  for (const [i, ch] of chapterList.entries()) {
    const where = `chapters.json[${ch?.chapter_id ?? i}]`;
    if (!ch?.scenes?.length && !ch?.script) fail(where, 'has no scenes or script');
    if (!ch?.session_bookmarks?.length && !ch?.bookmarks?.length) {
      fail(where, 'defines no safe stopping point — a 20-minute session needs one');
    }
  }

  const learningItems = itemsOf(learning);
  if (!learningItems.length) fail('learning_items.json', 'contains no items');
  checkItemsCommon('learning_items.json', learningItems, { isAssessment: false });

  const reviewItems = itemsOf(review);
  if (!reviewItems.length) fail('review_items.json', 'contains no items');

  // Every skill an item claims to teach or test must actually be defined.
  const skillList = Array.isArray(skills) ? skills : skills?.skills || [];
  const known = new Set(skillList.map(s => s.id));
  if (!known.size) fail('skills.json', 'defines no skills');
  for (const [file, list] of [['learning_items.json', learningItems], ['review_items.json', reviewItems]]) {
    for (const item of list) {
      for (const id of item.skillIds || item.skills || []) {
        if (!known.has(id)) fail(file, `item ${item.id} references unknown skill "${id}"`);
      }
    }
  }

  // A delayed check that reuses the teaching item measures recall of that item,
  // not retention of the skill.
  const learningIds = new Set(learningItems.map(i => i.id));
  for (const item of reviewItems) {
    if (learningIds.has(item.id)) {
      fail('review_items.json', `item ${item.id} is the same item taught in learning_items.json — a delayed check must be different`);
    }
  }

  const history = existsSync(join(dir, 'history_sources.json')) && readJSON(dir, 'history_sources.json');
  if (history) {
    const claims = Array.isArray(history) ? history : history.claims || [];
    for (const [i, c] of claims.entries()) {
      if (!c.source) fail('history_sources.json', `claim ${c.id ?? i} has no source`);
      if (!c.checkedAt && !c.retrievedAt) fail('history_sources.json', `claim ${c.id ?? i} has no date checked`);
    }
  }

  return { chapters: chapterList.length, learning_items: learningItems.length,
           review_items: reviewItems.length, skills: known.size };
}

// ── main ──
const dir = process.argv[2];
if (!dir) {
  console.error('usage: npm run check:content -- <path-to-package-directory>');
  process.exit(2);
}
if (!existsSync(dir)) {
  console.error(`✗ no such directory: ${dir}`);
  process.exit(2);
}

const spec = detectRelease(dir);
if (!spec) {
  console.error(`✗ ${dir} does not look like Release A or Release B`);
  console.error('  expected assessment_items.json, or chapters.json / learning_items.json');
  process.exit(2);
}

console.log(`Checking ${dir} against ${spec.name}\n`);
checkRequiredFiles(dir, spec);
checkNoPlaceholders(dir, spec);
const counts = spec === RELEASE_A ? checkReleaseA(dir) : checkReleaseB(dir);
checkManifestCounts(dir, counts);

for (const n of notes) console.log(`  note: ${n}`);
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`    ${p}`);
  console.error('\nThis package is not ready to implement against.\n');
  process.exit(1);
}
console.log(`✓ ${spec.name} passes structural validation`);
console.log('  Note: this checks structure and consistency, not educational');
console.log('  quality. It cannot tell you whether the questions are any good.');
