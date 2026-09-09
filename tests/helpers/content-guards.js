// The analysis behind the three content guards.
//
// All three were first written as keyword scans, and all three flagged real
// content: a prompt that reads "choose the correct schedule", a prompt that
// names the very places its own map is labelled with, and the release data that
// is bundled into the page on purpose. Every one of those was a reason to
// switch the guard off. tests/fixtures/guard-regressions/false-positives.json
// records them and tests/guard-regressions.test.js runs these functions against
// that record, so relaxing a guard is now itself a failing test.
//
// So nothing here searches for a word. Each function compares what the release
// actually holds against what the page actually put in front of the learner:
//
//   snapshot / differences   does the screen depend on whether the answer was
//                            right? A verdict is a difference; nothing else is.
//   leakedStrings            did a scorer-facing field reach the rendered
//                            container? Not the file - the container.
//   briefOnlyPhrases         which parts of an asset brief does the item not
//                            already say to the learner itself?

const CURLY_SQ = /[‘’ʼ]/g;
const CURLY_DQ = /[“”]/g;

/** Fold the differences that are not differences: case, quote style, spacing. */
export function normalise(text) {
  return String(text ?? '')
    .replace(CURLY_SQ, "'")
    .replace(CURLY_DQ, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Does `phrase` occur in `haystack`?
 *
 * A single word matches only as a whole word. "bank" must not fire on
 * "banknote", and a guard that fires on a substring is a guard that gets
 * switched off.
 */
export function occurs(haystack, phrase) {
  const hay = normalise(haystack);
  const p = normalise(phrase);
  if (!p || !hay) return false;
  if (/\s/.test(p)) return hay.includes(p);
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(p)}(?![\\p{L}\\p{N}])`, 'u').test(hay);
}

/**
 * Which of `phrases` reached the learner.
 *
 * `strings` is what the page rendered - text nodes and attribute values from
 * the learner-facing container - never the page source. The release is inlined
 * so the app works offline, so every model answer and every key is in the file
 * by construction (known-risks.md 1c). Scanning the file only re-detects that.
 */
export function leakedStrings(strings, phrases) {
  const hay = [].concat(strings).map(normalise).join('   ');
  return [].concat(phrases).filter(Boolean).filter(p => occurs(hay, p));
}

// -- what an item says to the learner in its own right ----------------------

/** The item's own learner-facing copy: what it is supposed to display. */
export function authoredLearnerText(item) {
  const out = [item?.prompt_en, item?.stimulus?.text_fr, item?.stimulus?.text_en];
  for (const c of item?.choices || []) out.push(c?.label);
  return out.filter(Boolean).map(String);
}

const BRIEF_FIELDS =
  ['required_elements', 'required_labels', 'required_route', 'prohibited_text', 'learner_view', 'notes'];

export function isBrief(item) {
  return String(item?.stimulus?.type || '').endsWith('_brief');
}

/**
 * The parts of an asset brief the item does not already say itself.
 *
 * SA-D02 asks the child to give directions "from the school to the library",
 * and school and library are also entries in the brief's required_labels. The
 * prompt is authored learner-facing copy; the brief is instruction to an
 * illustrator. Subtracting one from the other leaves exactly what a learner
 * must never see, and leaves the guard with nothing generic to trip over.
 */
export function briefOnlyPhrases(item) {
  if (!isBrief(item)) return [];
  const authored = authoredLearnerText(item).join('   ');
  const out = [];
  for (const field of BRIEF_FIELDS) {
    const value = item.stimulus[field];
    if (!value) continue;
    for (const phrase of Array.isArray(value) ? value : [value]) {
      if (!phrase || occurs(authored, phrase)) continue;
      out.push({ field, phrase: String(phrase) });
    }
  }
  return out;
}

// -- does the screen depend on whether the answer was right? ----------------

/**
 * Run inside the page. A structural photograph of a container: tags, classes,
 * attributes, the styling a verdict would use, and the text at each node.
 *
 * Self-contained on purpose - Playwright serialises it into the browser.
 */
export function snapshot(selector) {
  const walk = el => {
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      classes: [...el.classList].sort(),
      attrs: [...el.attributes]
        .filter(a => a.name !== 'class')
        .map(a => [a.name, a.value])
        .sort((x, y) => (x[0] < y[0] ? -1 : 1)),
      style: [cs.color, cs.backgroundColor, cs.borderColor, cs.fontWeight, cs.textDecorationLine],
      text: [...el.childNodes].filter(n => n.nodeType === 3)
        .map(n => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' '),
      children: [...el.children].map(walk),
    };
  };
  const root = document.querySelector(selector);
  return root ? walk(root) : null;
}

/** Run inside the page. Every string the container renders: text and attributes. */
export function renderedStrings(selector) {
  const root = document.querySelector(selector);
  if (!root) return [];
  const out = [];
  const walk = el => {
    for (const a of el.attributes) out.push(a.value);
    for (const n of el.childNodes) {
      if (n.nodeType === 3) out.push(n.textContent);
      else if (n.nodeType === 1) walk(n);
    }
  };
  walk(root);
  return out;
}

/**
 * Run as an init script. Records every string inserted into the assessment
 * screen, so a verdict that flashes up and is removed before the next snapshot
 * is still caught.
 */
export function recordRendering() {
  window.__renderLog = [];
  const inScreen = node => {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return !!(el && el.closest && el.closest('#screen-assessment'));
  };
  const push = node => {
    if (node.nodeType === 3) { window.__renderLog.push(node.textContent); return; }
    if (node.nodeType !== 1) return;
    // The whole subtree. The app builds a card detached and appends it in one
    // go, so the added node is a container and everything that matters - a
    // placeholder on an input three levels down - is inside it.
    for (const el of [node, ...node.querySelectorAll('*')]) {
      for (const a of el.attributes) window.__renderLog.push(a.value);
    }
    window.__renderLog.push(node.textContent);
  };
  new MutationObserver(records => {
    for (const r of records) {
      if (!inScreen(r.target)) continue;
      if (r.type === 'attributes') {
        window.__renderLog.push(r.target.getAttribute(r.attributeName) ?? '');
      } else if (r.type === 'characterData') {
        window.__renderLog.push(r.target.textContent);
      } else {
        for (const n of r.addedNodes) push(n);
      }
    }
  }).observe(document,
    { childList: true, subtree: true, attributes: true, characterData: true });
}

/**
 * Where two snapshots differ, as readable paths.
 *
 * Used to compare the same item answered correctly and answered incorrectly.
 * The screen is allowed to depend on WHICH option was chosen - that is how the
 * child sees their own choice - so `ignoreAttrs` and `ignoreClasses` drop the
 * marks of chosenness. What is left is a screen that must not depend on whether
 * the choice was right, and any difference at all in it is a verdict.
 */
export function differences(a, b, { ignoreAttrs = [], ignoreClasses = [], ignoreText = false, path = 'screen' } = {}) {
  const out = [];
  if (!a || !b) return a === b ? out : [`${path}: one side is missing`];
  const opts = { ignoreAttrs, ignoreClasses, ignoreText };
  if (a.tag !== b.tag) out.push(`${path}: <${a.tag}> vs <${b.tag}>`);

  const cls = s => s.classes.filter(c => !ignoreClasses.includes(c)).join(' ');
  if (cls(a) !== cls(b)) out.push(`${path}: class "${cls(a)}" vs "${cls(b)}"`);

  const at = s => s.attrs.filter(([k]) => !ignoreAttrs.includes(k)).map(([k, v]) => `${k}=${v}`).join(' ');
  if (at(a) !== at(b)) out.push(`${path}: ${at(a)} vs ${at(b)}`);

  if (a.style.join('|') !== b.style.join('|')) {
    out.push(`${path}: styled ${a.style.join(', ')} vs ${b.style.join(', ')}`);
  }
  if (!ignoreText && a.text !== b.text) out.push(`${path}: "${a.text}" vs "${b.text}"`);

  if (a.children.length !== b.children.length) {
    out.push(`${path}: ${a.children.length} children vs ${b.children.length}`);
  }
  for (let i = 0; i < Math.min(a.children.length, b.children.length); i++) {
    out.push(...differences(a.children[i], b.children[i],
      { ...opts, path: `${path} > ${a.children[i].tag.toLowerCase()}[${i}]` }));
  }
  return out;
}

/** Every node in a snapshot carrying `className`. */
export function nodesWithClass(snap, className) {
  if (!snap) return [];
  const here = snap.classes.includes(className) ? [snap] : [];
  return here.concat(...snap.children.map(c => nodesWithClass(c, className)));
}

/**
 * A copy of the snapshot with the subtree under `className` replaced by an
 * empty marker.
 *
 * The option list is the one part of the screen that legitimately differs
 * between two sittings: a different button is chosen, so a different button
 * carries the chosen styling. Pruning it lets the rest of the screen be
 * compared strictly, and the options are then compared by role - chosen
 * against chosen, unchosen against unchosen - which is stricter still.
 */
export function prune(snap, className) {
  if (!snap) return snap;
  if (snap.classes.includes(className)) return { ...snap, text: '', children: [] };
  return { ...snap, children: snap.children.map(c => prune(c, className)) };
}
