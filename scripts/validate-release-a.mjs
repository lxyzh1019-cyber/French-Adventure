// Validates an imported assessment content release against the master plan's
// Release A contract (§5.4). Run by `npm run verify`.
//
//   node scripts/validate-release-a.mjs [content/releases/assessment-v1]
//
// Exit code 1 with a gap report if anything the plan requires is missing or
// inconsistent. This checks completeness and internal consistency only; it is
// not educator review and says nothing about validity.

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const dir = process.argv[2] || 'content/releases/assessment-v1';
const gaps = [];
const gap = m => gaps.push(m);
const read = f => readFileSync(path.join(dir, f));
const json = f => JSON.parse(read(f).toString('utf8'));

const REQUIRED = ['manifest.json', 'assessment_items.json', 'assessment_rules.json',
  'rubrics.json', 'curriculum_map.json', 'scoring_fixtures.json', 'review_notes.md'];
for (const f of REQUIRED) if (!existsSync(path.join(dir, f))) gap(`missing file ${f}`);
if (gaps.length) { report(); }

const manifest = json('manifest.json');
const items = json('assessment_items.json');
const rules = json('assessment_rules.json');
const rubrics = json('rubrics.json');
const curriculum = json('curriculum_map.json');
const fixtures = json('scoring_fixtures.json');

// ── manifest: hashes, counts, release ids ────────────────────────────────────
for (const f of manifest.files || []) {
  if (!f.sha256) continue;
  const h = createHash('sha256').update(read(f.name)).digest('hex');
  if (h !== f.sha256) gap(`hash mismatch for ${f.name}`);
}
for (const [name, doc] of [['assessment_items.json', items], ['assessment_rules.json', rules],
  ['rubrics.json', rubrics], ['curriculum_map.json', curriculum], ['scoring_fixtures.json', fixtures]]) {
  if (doc.release_id !== manifest.release_id) gap(`${name} release_id ${doc.release_id} != manifest ${manifest.release_id}`);
}

const list = items.items || [];
if (list.length !== manifest.total_items) gap(`item count ${list.length} != manifest total ${manifest.total_items}`);
const counts = {};
for (const it of list) {
  const k = `${it.form}/${it.domain}/${it.difficulty_tier}`;
  counts[k] = (counts[k] || 0) + 1;
}
for (const form of manifest.forms || []) {
  for (const [domain, d] of Object.entries(manifest.item_counts?.[form] || {})) {
    let sum = 0;
    for (const [tier, n] of Object.entries(d.by_difficulty || {})) {
      sum += n;
      const actual = counts[`${form}/${domain}/${tier}`] || 0;
      if (actual !== n) gap(`${form}/${domain}/${tier}: manifest says ${n}, found ${actual}`);
    }
    if (sum !== d.total) gap(`${form}/${domain}: by_difficulty sums to ${sum}, total says ${d.total}`);
  }
}

// ── items: ids, keys, references, listening rules, placeholders ──────────────
const ids = new Set();
const skills = new Set((curriculum.skills || []).map(s => s.id));
const outcomes = new Set((curriculum.outcomes || []).map(o => o.id));
const rubricIds = new Set((rubrics.rubrics || []).map(r => r.id));
const PLACEHOLDER = /\bTODO\b|\bTBD\b|PLACEHOLDER|lorem ipsum|\bXXX\b|\?\?\?|\[insert/i;

for (const it of list) {
  const id = it.id || '(no id)';
  if (ids.has(id)) gap(`duplicate item id ${id}`);
  ids.add(id);
  for (const k of ['form', 'domain', 'difficulty_tier', 'item_type', 'prompt_en', 'scoring', 'exposure_group'])
    if (it[k] == null || it[k] === '') gap(`${id}: missing ${k}`);
  if (!Number.isInteger(it.version)) gap(`${id}: missing integer version`);
  if (!(it.skill_ids || []).length) gap(`${id}: no skill_ids`);
  for (const s of it.skill_ids || []) if (!skills.has(s)) gap(`${id}: unknown skill ${s}`);
  if (!(it.outcome_ids || []).length) gap(`${id}: no outcome_ids`);
  for (const o of it.outcome_ids || []) if (!outcomes.has(o)) gap(`${id}: unknown outcome ${o}`);
  if (PLACEHOLDER.test(JSON.stringify(it))) gap(`${id}: placeholder text`);

  const m = it.scoring?.method;
  if (m === 'objective') {
    if (Array.isArray(it.choices)) {
      const key = it.answer_key?.correct_choice_ids;
      if (!key?.length) gap(`${id}: choice item without correct_choice_ids`);
      for (const c of key || []) if (!it.choices.some(x => x.id === c)) gap(`${id}: key ${c} is not a choice`);
      if (it.choices.length < 2) gap(`${id}: fewer than two choices`);
    } else if (!(it.answer_key?.accepted_answers || []).length) {
      gap(`${id}: typed item without accepted_answers`);
    }
  } else if (m === 'analytic_rubric') {
    if (!it.scoring.rubric_id) gap(`${id}: rubric item without rubric_id`);
    else if (!rubricIds.has(it.scoring.rubric_id)) gap(`${id}: unknown rubric ${it.scoring.rubric_id}`);
    if (!it.scoring.model_response) gap(`${id}: rubric item without model_response`);
  } else {
    gap(`${id}: unknown scoring method ${m}`);
  }

  if (it.domain === 'listening') {
    if (!it.audio?.script_fr_ca) gap(`${id}: listening item without audio.script_fr_ca`);
    if (it.audio && it.audio.locale !== 'fr-CA') gap(`${id}: listening locale ${it.audio?.locale}, expected fr-CA`);
    if (it.audio && !/hidden/.test(String(it.audio.transcript_visibility))) gap(`${id}: listening transcript not hidden during the item`);
    if (it.stimulus && it.stimulus.text_fr) gap(`${id}: listening item shows written French`);
  }
}

// Both forms must cover the same blueprint (domain × tier × item_type counts).
const blueprint = form => {
  const b = {};
  for (const it of list.filter(i => i.form === form)) {
    const k = `${it.domain}/${it.difficulty_tier}/${it.item_type}`;
    b[k] = (b[k] || 0) + 1;
  }
  return b;
};
const [A, B] = (manifest.forms || ['A', 'B']).map(blueprint);
for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
  if ((A[k] || 0) !== (B[k] || 0)) gap(`blueprint differs between forms at ${k}: A=${A[k] || 0} B=${B[k] || 0}`);
}
// No stimulus or script may be shared verbatim across forms (answer leakage).
const surface = it => it.audio?.script_fr_ca || (it.stimulus ? JSON.stringify(it.stimulus) : null);
const byForm = f => list.filter(i => i.form === f);
for (const a of byForm('A')) for (const b of byForm('B')) {
  const sa = surface(a), sb = surface(b);
  if (sa && sb && sa === sb) gap(`identical stimulus in ${a.id} and ${b.id}`);
}

// ── rules: every essential decision present ──────────────────────────────────
for (const k of ['section_order', 'administration', 'objective_routing', 'open_sections', 'replay',
  'invalidity', 'scoring', 'reporting', 'pause_resume']) if (!rules[k]) gap(`rules: missing ${k}`);
for (const d of ['listening', 'reading', 'vocabulary_grammar']) {
  const r = rules.objective_routing?.[d];
  if (!r) { gap(`rules: no routing for ${d}`); continue; }
  for (const k of ['entry_tier', 'entry_count', 'weak', 'borderline', 'strong']) if (r[k] == null) gap(`rules: routing.${d}.${k} missing`);
}
for (const d of ['listening', 'reading', 'vocabulary_grammar', 'writing', 'speaking']) {
  if (!Number.isInteger(rules.scoring?.minimum_independent_valid_items?.[d])) gap(`rules: no minimum evidence for ${d}`);
}
if (!Number.isInteger(rules.replay?.listening_max_plays)) gap('rules: no listening replay allowance');
if (!(rules.invalidity?.reasons || []).length) gap('rules: no invalidity reasons');
if (!rules.administration?.first_form) gap('rules: no first-form assignment');
if (!rules.administration?.reassessment) gap('rules: no reassessment/form-rotation rule');

// ── rubrics ──────────────────────────────────────────────────────────────────
for (const r of rubrics.rubrics || []) {
  if (!(r.dimensions || []).length) gap(`rubric ${r.id}: no dimensions`);
  for (const d of r.dimensions || []) {
    if (!d.weight) gap(`rubric ${r.id}.${d.id}: no weight`);
    for (const lvl of ['0', '1', '2', '3']) if (!d.anchors?.[lvl]) gap(`rubric ${r.id}.${d.id}: missing anchor ${lvl}`);
  }
  if (!(r.examples || []).length) gap(`rubric ${r.id}: no scored examples`);
  for (const e of r.examples || []) if (!ids.has(e.prompt_id)) gap(`rubric ${r.id}: example references unknown item ${e.prompt_id}`);
  if (!r.scorer_requirement) gap(`rubric ${r.id}: no scorer requirement`);
}
if (!rubrics.unresolved_review_handling) gap('rubrics: no unresolved-review handling');

// ── curriculum map ───────────────────────────────────────────────────────────
if (!(curriculum.sources || []).length) gap('curriculum: no sources');
if (!curriculum.retrieval_date) gap('curriculum: no retrieval date');
for (const s of curriculum.skills || []) for (const o of s.outcome_ids || []) if (!outcomes.has(o)) gap(`skill ${s.id}: unknown outcome ${o}`);

// ── fixtures ─────────────────────────────────────────────────────────────────
if (!(fixtures.fixtures || []).length) gap('no scoring fixtures');
const cases = new Set();
for (const f of fixtures.fixtures || []) {
  if (f.item_id && !ids.has(f.item_id)) gap(`fixture ${f.id}: unknown item ${f.item_id}`);
  if (!f.expected) gap(`fixture ${f.id}: no expected result`);
  cases.add(f.case);
}
for (const c of ['correct', 'incorrect', 'partial', 'supported', 'technically_invalid'])
  if (!cases.has(c)) gap(`fixtures: no "${c}" case (plan §5.4 requires it)`);

report();

function report() {
  if (gaps.length) {
    console.error(`✗ ${dir}: ${gaps.length} gap(s) against the Release A contract`);
    for (const g of gaps) console.error('  - ' + g);
    process.exit(1);
  }
  console.log(`✓ ${dir}: ${manifest?.release_id ?? '?'} — ${list.length} items, both forms complete, every reference resolves`);
}
