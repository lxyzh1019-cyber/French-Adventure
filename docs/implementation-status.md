# Implementation status

Execution log, per master plan §5.6. This is not a plan. `files created` never
means `accepted`; only the parent's recorded acceptance moves a milestone to
`accepted`.

States: `not_started` · `in_progress` · `ready_for_review` · `accepted` · `blocked`

| Field | Value |
|---|---|
| Master plan | [French Adventure Improvement Plan](French_Adventure_Improvement_Plan.md), revision 3 (2026-09-09) |
| Baseline commit | `f065ca8` |
| M1 implementation | [PR #17](https://github.com/lxyzh1019-cyber/French-Adventure/pull/17), merged as `f290a3e` |
| M1 audit | third-party audit of `f290a3e`, 2026-09-08 |
| This repair round | branch `claude/audit-report-review-cq7cni`, merged as `a8220ce` |
| M2 branch | `claude/third-party-audit-validation-2oth5n` |

## Milestones

| Milestone | State | Notes |
|---|---|---|
| M1 — Repair foundation | `ready_for_review` | Both audit blockers repaired with regressions; full Match resume matrix; parent iPad smoke checklist and recovery-file confirmation still required for `accepted`. |
| M2 — Independent assessment | `in_progress` | Steps 0-3 complete: cleanup, data model, shell, and the three objective sections. Writing and speaking capture is Step 4. Nothing learner-facing yet. Step 0 cleanup on `claude/third-party-audit-validation-2oth5n`. Release A imported and validated; scoring rules proven against the content fixtures. No learner-facing assessment exists yet. Per master plan revision 3, M1 cleanup is folded into M2 rather than forming a separate milestone; parent approved building in parallel with the outstanding iPad checklist. |
| M3 — Learning pilot | `not_started` | Release B not yet authored. |
| M4 — iPad validation | `not_started` | |
| M5 — Evaluate and release pilot | `not_started` | |

## Content

| Package | Version | Location | State |
|---|---|---|---|
| Release A — assessment content | `assessment-v1.0.0` | `content/releases/assessment-v1/` | Imported unchanged. `npm run check:release-a` passes: hashes, 90 items, both forms complete, every skill/outcome/rubric/fixture reference resolves, listening audio-only. Parent approval of the learner-facing experience pending (nothing learner-facing yet). |
| Release B — pilot learning content | — | — | Not delivered. |

## M1 repair round — what the audit asked for

| Audit item | State | Evidence |
|---|---|---|
| Same-day, same-baseline two-device merge in both orders and after redelivery | done | `tests/merge.test.js`: five new cases (same day both orders, redelivery, identical rounds, knockout, pre-ledger days, same-week split). Round ledger `roundLog` (schema v2) reconciles `todayStats`, `dailyRounds`, `gradeStats`, `gradeGameRounds`, `dailyTopicStats`, `weekStars`, `totalStars`. |
| Rapid wrong-match browser test; callback holds no live reference to selection state | done | `src/app.js` `handleMatchClick` captures both tiles before clearing; `tests/browser/m1-repair.test.js` cases 1, 2, 6. On the audited build the same check shows the newer selection cleared. |
| Full Match resume matrix | done | `tests/browser/m1-repair.test.js`: no selection, one selection (highlight and tile rebound, then scores once), several pairs (not recounted), interruption after a wrong pair, completed board not resumed. |
| `npm run verify:all` passes in CI | done | [CI run 22](https://github.com/lxyzh1019-cyber/French-Adventure/actions/runs/34237806806) on `a8220ce`: success. 147 unit tests, 26 browser tests, handler check, drift check, Release A validation. |
| Parent keeps the verified combined recovery file and completes the iPad smoke checklist | **parent** | Not evidenced in the repository. Checklist in the audit; repeated below. |

### Parent-observed defects fixed in the same round

| Observation | Cause | Fix |
|---|---|---|
| Recording hard to turn off; mic too small | No stop path at all: no `abort`, no `onend`; second tap threw `InvalidStateError` and the button stayed pulsing. Mic had height but no width on touch. | `src/speech/recorder.js` toggle controller (tap to start, tap to stop, resets on end/error/timeout). Listen & Speak no longer auto-submits the transcript. 56 px mic on touch. |
| Pronunciation (🔊) buttons too small | `question-speak-inline` class was never defined; inline 🔊 rendered at browser default (~17 px). | Defined; every inline 🔊 uses `.speak-inline`/`.question-speak-inline`, ≥44 px (52 px on touch). Browser test scans every screen. |
| Some screens still say G4 while others say L1–L7 | Eleven leftover sites: hub note, tab markup, subtitle, rules strip, disclosure button, parent heading, moon banners, trophy strips, dead unlock banner. | All learner-facing text now uses `levelLabel()`/`levelNumber()`. Subtitle reads "Levels 1–7" with no curriculum claim (no traceable mapping exists in the app yet). Browser test asserts no `G4`/`Grade N` text on hub, game, study, My Words, round-complete, parent views. Selecting a player now opens the recommended level. |

## Checks

| Check | Command | Count | Last result |
|---|---|---|---|
| Unit + handler export | `npm test` | 147 tests across 11 files; 39 inline handlers checked | pass |
| Build parity | `npm run check:drift` | — | pass |
| Release A contract | `npm run check:release-a` | 90 items, both forms | pass |
| Content package contract | `npm run check:content -- <dir>` | 3 packages | pass |
| Browser (Chromium) | `npm run test:browser` | 26 tests across 3 files | pass (`CHROMIUM_PATH=/opt/pw-browsers/chromium` in the sandbox) |

Counts verified by running the suites at `a8220ce`, not copied from a previous
report.

Chromium is regression coverage, not the plan's actual-iPad gate.

## Manual tests still needed (parent, on the family iPads)

The checklist is [`docs/ipad-test-checklist.md`](ipad-test-checklist.md) — one
document, written as do / expect / if-not, ordered so that stopping after
fifteen minutes still answers the questions that matter most. It already covers
this round's two-iPad same-day merge check (§1.4), and §3.5 and §3.6 were added
for the microphone and the Listen & Speak submit behaviour this round changed.

Two things it assumes rather than states:

- Export the recovery file **before** starting. This round bumps the profile
  schema to v2, which adds an empty `roundLog` and rewrites nothing, but the
  test writes to the girls' real records either way.
- One combined Jenn/Jess export is the intended format; a separate file per
  child is not required.

## M2 Step 0 — validation findings

The master plan revision 3 lists six cleanup items. All six were confirmed
against the code. Validating them surfaced four things the plan did not list,
and three Phase 1 criteria that the M1 re-audit passed but the code does not
meet. Parent approved folding all of them into this Step 0.

### Not listed in the plan's Step 0

| Finding | Consequence |
|---|---|
| `manifest.json` carries a sha256 per file and `validate-release-a.mjs` cross-checks `release_id` across all five JSON documents | Editing `assessment_rules.json` fails `check:release-a` until the manifest is regenerated |
| `release_id` appears ~97 times — all six JSONs, `review_notes.md`, and every one of the 90 items | The version bump is mechanical, not a two-line edit; `scripts/rehash-release.mjs` added so it is repeatable |
| `docs/known-risks.md` §3 claimed the content packages "neither exists" | Corrected; Release A has been delivered since 2026-09-08 |
| The master plan was not in the repository, though §5.6 requires it at `docs/French_Adventure_Improvement_Plan.md` | Imported verbatim at revision 3 |

### Phase 1 criteria not met at `a8220ce`

| Criterion | State | Note |
|---|---|---|
| §1.3 no inline handler interpolates content into JavaScript | **not met** | `src/app.js` still built `onclick="checkDrill('…')"` with vocabulary text. The guard at `tests/scaffold.test.js` expected a different string shape and returned zero matches against the live defect — it passed vacuously. |
| §1.7 five explicit round outcomes | **not met** | `abandoned`, `interrupted` and `timedOut` were declared but never produced or stored; Rollup tree-shook them out of the build. The related browser test nested its assertions in `if (r.lives === 0)` and could pass asserting nothing. |
| §1.6 idempotent scoring | implemented, **untested** | No test named `attemptId`, `committedAnswers` or `commitAnswerOnce`. Word Match is the one answer path that does not use the commit gate. |

Genuinely met and properly covered: the scramble repair (7 regression words
plus a sweep of all 400+ curriculum words), the full Word Match resume matrix,
the merge's commutative/idempotent/monotonic properties and round ledger,
migration idempotence, and the Edmonton date helpers.

**Method note.** Two of the three gaps above were hidden by tests that could
not fail. Every guard repaired in this round was first observed failing against
the unfixed code; a guard that has never fired is not evidence.

### Naming

Master plan §1.1 names `tokenizeFrench` and `escapeForDisplay`. The shipped
symbols are `frTokenize` (`src/util/fr-text.js`) and `escapeAttr`
(`src/app.js`). Parent chose to keep the code names and annotate the plan; an
implementation note was added at §1.1 rather than renaming working code.

### Still device-clock dependent

Two display-only paths derive day keys from the device clock rather than the
Edmonton helpers: the weekly played-days strip and the "next reset in N days"
line. The gate that matters, `isWeekdayPlayAllowed`, correctly uses
`weekdayIndex()`. Cosmetic on a correctly-set iPad; recorded, not fixed.

## M2 Step 1 — the assessment data model

Storage, model, migration and merge for assessment runs. **No learner-facing
assessment exists yet** — nothing in `app.js` imports any of it, so the built
page is unchanged apart from two Firestore functions (+1.7 KB).

| Module | Role |
|---|---|
| `src/assessment/run-model.js` | Run, section, response and review constructors; the response record's first thirteen fields are `administration.response_storage` verbatim |
| `src/assessment/run-migrations.js` | Forward-only, idempotent, never-delete |
| `src/assessment/run-merge.js` | The lattice join; commutative, idempotent, monotonic |
| `src/assessment/store.js` | The only assessment module that touches storage; copies `saveState`'s write barrier |
| `src/assessment/content.js` | Reads the release; nothing else knows its file layout |
| `firebase-bootstrap.js` | `fbAssessInit` / `fbAssessSave` against `french_game_assessment/{player}` |

Shape and merge rules are documented in [`data-schema-v0.md`](data-schema-v0.md).

**Kept out of the profile.** `fbSave` writes the profile with `setDoc`, a full
document replace, so a run folded into it would rewrite a child's whole history
once per autosaved response. The profile schema is untouched by Step 1.

**Its own listener map.** `fbListeners` is keyed by player alone, so an
assessment listener reusing it would have unsubscribed the profile listener for
that learner the first time it attached.

**Two findings while reading the contract.**

- `reporting.required_fields` requires `strength_skill_ids` and
  `next_need_skill_ids` and nothing defines how to derive them — see the
  content-owner questions below. Still open, still blocking Step 5.
- **Four items carry an asset brief, not two.** The M1 notes record `SA-D02` and
  `SB-D02` as needing map images. `SA-F02` and `SB-F02` carry
  `illustration_brief` stimuli and need artwork on the same terms. All four are
  speaking prompts, all four are detected by `needsUnbuiltAsset()`, and all four
  must be **skipped rather than rendered** — printing a brief's
  `required_elements` hands the child the vocabulary the item tests.

68 new unit tests: 18 model and migration, 14 merge, 10 content parity, 14 store
barrier, plus the existing suites. 234 unit tests and 32 browser tests pass.

## M2 Step 2 — the assessment shell

Entry, form assignment, section navigation, autosave and cross-device resume.
**No items are rendered yet** — an opened section says what it will administer
and stops. That is Step 3.

| Module | Role |
|---|---|
| `src/assessment/session.js` | Pure administration rules: form choice, entry blocks, routing, section boundaries, resume |
| `src/modes/assessment-ui.js` | The screen. Injected dependencies only; reaches nothing global itself |
| `src/index.html` | `#screen-assessment`, and the parent entry point |

**Entry is parent-initiated, behind the password, and not on the child's hub.**
Exposure is permanent and each form is 45 items, so a child who wanders in out
of curiosity spends a measurement.

**The screen is deliberately unlike the game** — no stars, hearts, timer or
confetti. `administration.language` bars translations, hints, correctness
feedback, lives, stars, bonuses and leaderboard effects during a section, and a
screen that looks like the game invites a child to expect them. A browser test
scans for reward glyphs and game vocabulary rather than trusting the styling.

**Resume needs no cursor.** The next item is the first planned item with no
response, so the responses *are* the position. A browser test closes the page
entirely and reboots the app from what is on the device, rather than doing a
soft navigation.

**Rules implemented from the release, not from memory:**

- `administration.first_form` — jenn=A, jess=B, anyone else by FNV-1a.
- `administration.reassessment` — alternate forms, except that an attempt which
  gathered fewer than three valid scored items in every domain may repeat its
  own form. A child who stopped after two items has not seen the bank, and
  spending the alternate on that would leave nothing fresh for the real attempt.
- `section_boundaries` — a new section needs 6 minutes; a section already begun
  runs to its end, so no child is stopped four items in by a clock.
- `objective_routing` — the entry block is frozen first and routing applied only
  once all of it is submitted; routed tiers are appended in bank order; the
  decision and its timestamp are frozen.
- `invalidity.rule` — an invalid entry answer is excluded from numerator and
  denominator, so it neither helps nor hurts the routing.
- `pause_resume.resume` — a submitted item is never replayed; a second
  submission for the same key is refused rather than allowed to overwrite.

**Items with unbuilt assets are skipped, never rendered.** All four are detected
and passed over, and a section whose only unanswered items are skipped still
counts as answered rather than stalling.

**One defect found by its own test.** A parent can open the assessment from the
parent overlay without a learner being selected, so pausing called `updateHub()`
with `currentPlayer` null and threw. The exit path now checks.

The built page grows 246 KB → 355 KB: the release is now imported, as recorded
in [`known-risks.md`](known-risks.md) §1c.

36 new tests — 26 session unit tests, 10 browser. 260 unit and 42 browser tests
pass.

## M2 Step 3 — the objective sections

Listening, reading and vocabulary/grammar are administered end to end: three
item types from the bank (`audio_choice`, `text_choice`, `typed_short`),
adaptive routing, the replay cap, and per-item enforcement of the rules that
make this an assessment rather than a game.

**Scoring happens at submit; showing does not happen at all.** Routing reads the
entry block's result and cannot wait for the section to end, so an objective
answer is graded as it is stored — but no renderer reads that grade, and the
next item simply appears. Choosing an option marks it as chosen and says nothing
else; a chosen option is outlined in the app's French blue, never green or red,
because colour is a verdict.

**Enforced per item, and tested rather than asserted in a comment:**

| Rule | How it is held |
|---|---|
| `administration.language` | The screen text is scanned after answering and after submitting. The item's own prompt is excluded first — several prompts legitimately read "choose the correct …", and a blunt word scan would flag the bank's own English. |
| `audio.transcript_visibility` | Every listening item in a section is checked for its script and any written French, not just the first: one leaked stimulus turns a listening measurement into a reading one. |
| `replay.listening_max_plays` | Two plays, then the control disables. Asserted as the sequence enabled/enabled/disabled, and by counting what actually reached the speech API. |
| `replay.technical_replay` | "I heard nothing" does not consume a play. |
| `invalidity.rule` | That report stores `audio_failed`, `scored_valid: false`, and **no** `scored_correct` — excluded, never converted to wrong. |
| `pause_resume.resume` | Four items answered in sequence produce four distinct responses; no item returns. |
| `objective_routing` | Routing fires only once the whole entry block is submitted, then appends its tiers and freezes the decision with a timestamp. |

**iOS autocorrect.** Typed items carry `autocomplete`, `autocorrect`,
`autocapitalize` and `spellcheck` off, and a test walks all the way to a real
typed item to check it. This is the only lever a web page has and it is **not
sufficient** — the QuickType bar cannot be suppressed from a page at all, so the
iPad checklist must also ask for Auto-Correction to be turned off before the
words and writing sections. `VGA-F04` accepts `où`, and predictive text supplies
exactly that accent.

**One defect found by its own test.** Tapping "Start / resume" left the parent
overlay covering the assessment it had just opened, so nothing on the screen
responded. The overlay now closes.

**A note on the scan that nearly went wrong.** The first version of the
no-feedback test searched the whole screen for words like "correct" and failed
against a legitimate item prompt. A guard that flags the content it is meant to
protect would have been turned off rather than fixed; it now excludes the prompt
and checks what surrounds it.

18 new tests — 9 browser plus the session-level routing and playback cases.
269 unit and 51 browser tests pass. The built page is 375 KB.

## Speaking cannot produce a band until two illustrations exist

**Found in Step 3 preparation. Blocks a whole domain of the assessment.**

Each form has five speaking prompts. Two of them — `SA-F02`/`SA-D02` on form A,
`SB-F02`/`SB-D02` on form B — carry an asset *brief* rather than an asset, and
must be skipped rather than rendered, because printing a brief's
`required_elements` hands the child the vocabulary the prompt is testing.

That leaves **three presentable prompts against a minimum of four**
(`scoring.minimum_independent_valid_items.speaking`). So speaking will report
`insufficient_evidence` on every attempt, on both forms, no matter how well a
learner does, until the artwork is produced and reviewed.

Nothing in code can fix this. It is recorded on every run as
`blocked_by_content_domains`, kept distinct from the exposure-driven
`insufficient_domains`, so a domain with no band can say which kind of shortfall
it was rather than looking like an exhausted bank.

Writing is unaffected: six prompts, all presentable, minimum five.

**For the content owner:** the two illustration briefs are the smaller ask of
the four — `required_elements` is a short object list with `prohibited_text`
already specified. Producing those two alone does not fix speaking; all four
matter, because the two map briefs are the developing-tier prompts.

## Release A — amended to `assessment-v1.0.1`

Two edits, made under M2 Step 0 with parent approval. No item, answer key,
rubric, fixture or score changes; every fixture still passes unchanged.

| Field | Before | After |
|---|---|---|
| `scoring.tier_profile`, sentence 2 | "The domain band is the highest tier observed at secure, or if none, the highest tier observed at emerging." | "The domain band is the highest administered tier observed at emerging or secure, labelled with that tier's status." |
| `scoring.secure_threshold` | *(absent — stated only in the prose)* | `0.75` |
| `scoring.emerging_threshold` | *(absent — stated only in the prose)* | `0.50` |
| `manifest.compatible_master_plan_revision` | `2` | `3` |

**Why the wording changed.** Read literally, the old sentence gives
`developing_secure` for developing 3/3 plus stretch 2/3. Fixture `FX-STRETCH`
requires `stretch_emerging` for exactly that case, and every other fixture
agrees with the fixture rather than the prose. The implementation followed the
fixtures; the prose now says what they mean. This was the open question logged
against `assessment-v1.0.0` and is now closed in the package itself — the
content owner should confirm the reading was the intended one, because if the
literal sentence was intended then `FX-STRETCH` is wrong and every stretch-tier
band in every report flips.

**Why the thresholds became fields.** 0.75 and 0.50 appeared only inside the
prose, so `src/assessment/scoring.js` carried its own copy as constants. Two
statements of one rule is one to forget: a later release could change its cut
scores and the module would go on scoring by the old ones with every fixture
still green. The module now reads them, and throws if a release omits them
rather than falling back to a coded-in value.

**Mechanics.** `release_id` occurs 98 times — the top-level field of all six
JSON documents, `review_notes.md`, and every one of the 90 items — and
`validate-release-a.mjs` cross-checks the top-level ids against the manifest
while hashing every file's raw bytes. `scripts/rehash-release.mjs` performs the
rename and regenerates the manifest so this is repeatable rather than hand-done.
Per-item `version` fields stay at 1: the items did not change.

**One side effect, checked.** `assignFirstForm` hashes
`learner_id + "|" + release_id`, so the bump reshuffles form assignment for any
learner not named in the rules. Jenn and Jess are both named (`jenn`=A,
`jess`=B) and are unaffected; a test now asserts that against the live release
id rather than only against the hardcoded 1.0.0 hash vectors.

## Release A — content-owner decisions (ChatGPT, 2026-09-09)

Both open questions are answered. Validated against the release before being
recorded; every skill id, rubric dimension and domain the answer names exists.

### 1. Tier band — confirmed, no change

The fixtures were right. The band is "the highest administered tier observed at
emerging or secure, labelled with that tier's status", so developing secure plus
stretch emerging reports `stretch_emerging`. Thresholds stay 0.75 / 0.50, read
from the numeric fields rather than parsed from prose. This is what
`assessment-v1.0.1` and `src/assessment/scoring.js` already do; the risk that
`FX-STRETCH` was wrong and every stretch-tier band would flip is now closed.

### 2. `strength_skill_ids` / `next_need_skill_ids` — rule supplied

To be implemented in Step 5. **Current attempt only.** Eligible evidence must be
technically valid, unsupported, scored, carry a stable `skill_id`, and come from
a distinct item — invalid, supported, unanswered, duplicated and
`awaiting_review` responses contribute nothing either way, positive or negative.

- Objective: value = points earned ÷ points possible; an item contributes once
  to **every** `skill_id` listed on it, and no skill is inferred from wording or
  topic.
- Writing (`÷ 3`, all dimensions 0–3): `W_ENCODING` = conventions;
  `W_SENTENCE`, `W_QUESTION`, `W_CONNECTED` = mean(message, structure);
  `W_DESCRIPTION`, `W_REASON` = mean(message, vocabulary, structure).
- Speaking: `S_INTRO`, `S_DESCRIPTION`, `S_RESPONSE`, `S_DIRECTIONS` =
  mean(message, comprehensibility, vocabulary_structure); `S_CONNECTED` adds
  fluency; `P_COMPREHENSIBILITY` = comprehensibility;
  `P_SOUND_SYMBOL` = pronunciation_observation;
  `P_RHYTHM_LINKING` = mean(pronunciation_observation, fluency).

Aggregate by mean. **At least two distinct items/prompts** are required to
classify at all; below that the skill goes in neither array. Strength ≥ 0.75,
next need < 0.75. At most three ids per array — strengths by highest aggregate,
then more evidence, then id; next needs by lowest aggregate, then more evidence,
then id. Arrays may be empty, and no skill may appear in both.

Group each skill under the domain `curriculum_map.json` declares for it, **even
when the evidence came from another section**. This is not hypothetical:
`W_ENCODING` is declared under Writing and draws evidence from
`vocabulary_grammar` typed items as well as writing prompts.

Learner-facing wording is **"Observed strengths"** and **"Suggested next
practice areas"** — never "mastered" or "deficiencies". These are limited
observations from one sitting, not mastery claims.

**Validated against the release:** all 6 writing and 8 speaking/pronunciation
skill ids are used by real items; all 34 skills in `curriculum_map.json` are
declared with a domain and none is used without being declared; every named
rubric dimension exists and is scored 0–3, so `÷ 3` normalises correctly.

**One implementation note for Step 5.** `curriculum_map.json` labels domains in
prose — `Vocabulary and grammar`, `Pronunciation observation` — while items and
`section_order` use `vocabulary_grammar`, `speaking`. Step 5 needs an explicit
mapping between the two, and there are six declared skill domains against five
administered sections, because pronunciation is reported separately (master plan
§2.1) without being a section of its own.

## Release A follow-ups that are not code

- Map images for `SA-D02` and `SB-D02` (asset briefs in the items) must be produced and reviewed before those prompts are used.
- The 24 listening scripts need listening QA on an actual iPad with the resolved `fr-CA` voice.
- Someone must be named to score writing and speaking with the rubrics; until then those domains report `awaiting_review`.
- Independent educator review has not occurred; do not describe the bank as educator-validated.

## Parent acceptance

| Milestone | Accepted by | Date | Note |
|---|---|---|---|
| M1 | — | — | pending |
