// Merging two versions of the same learner's assessment store.
//
// The property that makes this safe, and the reason it needs none of the
// `base + merged ledger` arithmetic in state/merge.js: NOTHING HERE IS A
// COUNTER. Every value is either an immutable record under a unique key, or a
// value from a small ordered set that only ever moves one way. The response
// records *are* the ledger. So the merge is a lattice join, and the three
// properties fall out of the shape rather than being argued for case by case:
//
//   commutative — join(a, b) equals join(b, a)
//   idempotent  — join(a, a) equals a, and redelivery changes nothing
//   monotonic   — no evidence present in either input is absent from the result
//
// The whole-profile overwrite that cost this project a child's history is not
// merely avoided here; it is unrepresentable.

import { RUN_STATUS_RANK, SECTION_STATUS, responseKey } from './run-model.js';

const num = v => Number(v) || 0;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

/** Union two maps, resolving a key present on both with `resolve`. */
function unionBy(a = {}, b = {}, resolve) {
  const out = { ...a };
  for (const [k, bv] of Object.entries(b || {})) {
    out[k] = (k in out) ? resolve(out[k], bv) : bv;
  }
  return out;
}

const sortedUnion = (a = [], b = []) => [...new Set([...(a || []), ...(b || [])])].sort();

/**
 * A response is written once, at submit, so both sides are normally identical.
 * A genuine difference means the same run was answered on two devices while
 * offline — which the app tries to prevent, but cannot guarantee.
 *
 * The earlier submission wins. pause_resume.resume says a submitted item is
 * never replayed as a new scored item, so the first answer is the one the
 * assessment actually elicited; the second was given to a question the learner
 * had already seen. Ties break on device_id purely so the result does not
 * depend on argument order, and the loser is flagged rather than discarded
 * silently — a domain that hit this should not be reported at full confidence.
 */
function mergeResponse(x, y) {
  const xs = num(x?.response_submitted_at_utc);
  const ys = num(y?.response_submitted_at_utc);

  let winner, loser;
  if (xs && ys && xs !== ys) { [winner, loser] = xs < ys ? [x, y] : [y, x]; }
  else if (xs && !ys) { [winner, loser] = [x, y]; }
  else if (ys && !xs) { [winner, loser] = [y, x]; }
  else {
    const xd = String(x?.device_id ?? ''), yd = String(y?.device_id ?? '');
    [winner, loser] = xd <= yd ? [x, y] : [y, x];
  }

  const differs = JSON.stringify(x) !== JSON.stringify(y);
  return differs
    ? { ...winner, duplicate_submission: true, duplicate_from_device_id: loser?.device_id ?? null }
    : winner;
}

/**
 * A review is a correction, so unlike a response the LATER one wins: a scorer
 * who re-reads a piece of writing meant to change the score. Invalidation ORs,
 * because a merge must never un-invalidate something a parent marked.
 */
function mergeReview(x, y) {
  const later = num(x?.reviewed_at_utc) >= num(y?.reviewed_at_utc) ? x : y;
  const invalidated = !!(x?.invalidated || y?.invalidated);
  return {
    ...later,
    invalidated,
    invalidated_reason: invalidated ? (x?.invalidated_reason ?? y?.invalidated_reason ?? null) : null,
  };
}

/** First shown wins; shown_count takes the max. See the note in mergeRun. */
function mergeExposure(x, y) {
  const xf = num(x?.first_shown_at_utc), yf = num(y?.first_shown_at_utc);
  return {
    ...x, ...y,
    first_shown_at_utc: xf && yf ? Math.min(xf, yf) : (xf || yf),
    // Max, not sum. Sum is not idempotent under snapshot redelivery, and the
    // field's job — administration.exposure, "never treat a previously exposed
    // item as secure progress evidence" — needs only "was it shown", which max
    // preserves. It can under-count two genuinely separate showings.
    shown_count: Math.max(num(x?.shown_count), num(y?.shown_count)),
  };
}

const isPrefix = (short, long) => short.every((v, i) => long[i] === v);

/**
 * The one genuinely non-trivial join.
 *
 * Routing is a pure function of the entry-block responses, so two devices agree
 * unless they hold different subsets of them. Normally one plan is a prefix of
 * the other — the same route, one device further along — and the longer wins.
 *
 * When neither is a prefix the devices routed differently, and the earlier
 * routing decision stands so the result does not depend on arrival order. The
 * losing device may already have shown items outside the winning plan; those
 * stay in exposure, because an item that has been seen cannot be un-seen. The
 * conflict is flagged so the report can drop confidence rather than present a
 * band drawn from two different routes as though it were one.
 */
function mergeSection(x, y) {
  const a = Array.isArray(x?.plan) ? x.plan : [];
  const b = Array.isArray(y?.plan) ? y.plan : [];

  let plan, conflict = false;
  if (a.length >= b.length && isPrefix(b, a)) plan = a;
  else if (b.length > a.length && isPrefix(a, b)) plan = b;
  else {
    const xr = num(x?.routed_at_utc), yr = num(y?.routed_at_utc);
    plan = (xr && yr) ? (xr <= yr ? a : b) : (a.length >= b.length ? a : b);
    conflict = true;
  }

  const routedFirst = (num(x?.routed_at_utc) && num(y?.routed_at_utc))
    ? (num(x.routed_at_utc) <= num(y.routed_at_utc) ? x : y)
    : (num(x?.routed_at_utc) ? x : (num(y?.routed_at_utc) ? y : null));

  const statusRank = { [SECTION_STATUS.NOT_STARTED]: 0, [SECTION_STATUS.IN_PROGRESS]: 1, [SECTION_STATUS.COMPLETE]: 2 };
  const status = (statusRank[x?.status] ?? 0) >= (statusRank[y?.status] ?? 0) ? x?.status : y?.status;

  const firstOf = k => {
    const xv = num(x?.[k]), yv = num(y?.[k]);
    return xv && yv ? Math.min(xv, yv) : (xv || yv || null);
  };
  const lastOf = k => Math.max(num(x?.[k]), num(y?.[k])) || null;

  return {
    ...x, ...y,
    plan,
    status,
    administered_tiers: sortedUnion(x?.administered_tiers, y?.administered_tiers),
    sitting_ids: sortedUnion(x?.sitting_ids, y?.sitting_ids),
    routing_decision: routedFirst ? routedFirst.routing_decision : (x?.routing_decision ?? y?.routing_decision ?? null),
    routed_at_utc: routedFirst ? num(routedFirst.routed_at_utc) : null,
    started_at_utc: firstOf('started_at_utc'),
    completed_at_utc: lastOf('completed_at_utc'),
    ...(conflict ? { routing_conflict: true } : {}),
  };
}

function mergeRun(x, y) {
  // Identity fields must agree. Disagreement means two different runs somehow
  // share an id, which the random suffix makes vanishingly unlikely; keep the
  // earlier-started side and surface it rather than silently blending them.
  const identity = ['learner_id', 'release_id', 'form', 'started_at_utc'];
  const conflicted = identity.some(k => x?.[k] != null && y?.[k] != null && x[k] !== y[k]);
  const primary = num(x?.started_at_utc) <= num(y?.started_at_utc) ? x : y;

  const rank = r => RUN_STATUS_RANK[r] ?? 0;
  const status = rank(x?.status) >= rank(y?.status) ? x?.status : y?.status;
  const statusSide = rank(x?.status) >= rank(y?.status) ? x : y;

  const sections = {};
  for (const d of new Set([...Object.keys(x?.sections || {}), ...Object.keys(y?.sections || {})])) {
    const xs = x?.sections?.[d], ys = y?.sections?.[d];
    sections[d] = (xs && ys) ? mergeSection(xs, ys) : (xs || ys);
  }

  return {
    ...primary,
    status,
    status_at_utc: num(statusSide?.status_at_utc),
    invalidated_reason: statusSide?.invalidated_reason ?? null,
    invalidated_by: statusSide?.invalidated_by ?? null,
    // Never un-link a replacement.
    replacement_of_run_id: x?.replacement_of_run_id ?? y?.replacement_of_run_id ?? null,
    section_order: (x?.section_order?.length ? x.section_order : y?.section_order) || [],
    sections,
    exposure: unionBy(x?.exposure, y?.exposure, mergeExposure),
    responses: unionBy(x?.responses, y?.responses, mergeResponse),
    review: unionBy(x?.review, y?.review, mergeReview),
    ...(conflicted ? { merge_conflict: true } : {}),
  };
}

/**
 * Join two assessment stores. Both sides must already be migrated — the same
 * contract state/merge.js has, and for the same reason: comparing a v0 shape
 * against a current one is how a merge invents or drops data.
 */
export function mergeAssessmentStores(a, b) {
  if (!isObj(a)) return isObj(b) ? b : null;
  if (!isObj(b)) return a;

  return {
    ...a, ...b,
    assessmentSchemaVersion: Math.max(num(a.assessmentSchemaVersion), num(b.assessmentSchemaVersion)),
    learner_id: a.learner_id ?? b.learner_id ?? null,
    runs: unionBy(a.runs, b.runs, mergeRun),
    lastUpdatedAt: Math.max(num(a.lastUpdatedAt), num(b.lastUpdatedAt)),
  };
}

/** Every response across every run — what a report and the exposure rule read. */
export function allResponses(store) {
  const out = [];
  for (const run of Object.values(store?.runs || {})) {
    for (const [key, r] of Object.entries(run?.responses || {})) out.push({ key, run_id: run.run_id, ...r });
  }
  return out;
}

export { responseKey };
