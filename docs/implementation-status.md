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
| M2 — Independent assessment | `in_progress` | Steps 0-4 complete: cleanup, data model, shell, objective sections, and writing/speaking capture. Domain scoring and the parent report are Step 5. Nothing learner-facing yet. Step 0 cleanup on `claude/third-party-audit-validation-2oth5n`. Release A imported and validated; scoring rules proven against the content fixtures. No learner-facing assessment exists yet. Per master plan revision 3, M1 cleanup is folded into M2 rather than forming a separate milestone; parent approved building in parallel with the outstanding iPad checklist. |
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
| Unit + handler export | `npm test` | 361 tests across 26 files; 37 inline handlers checked | pass |
| Build parity | `npm run check:drift` | — | pass |
| Release A contract | `npm run check:release-a` | 90 items, both forms | pass |
| Content package contract | `npm run check:content -- <dir>` | 3 packages | pass |
| Browser (Chromium) | `npm run test:browser` | 80 tests across 8 files | pass (`CHROMIUM_PATH=/opt/pw-browsers/chromium` in the sandbox) |

Counts verified by running the suites at the head of the M2 branch, not copied
from a previous report.

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

## M2 Step 4 — writing and speaking capture

Both open sections are captured and **neither is scored anywhere in the app**.
`scoring.writing` and `scoring.speaking` each require a qualified human first,
and for speaking that person must listen to the original recording — a
transcript cannot score comprehensibility, fluency or pronunciation. Every open
response is stored `awaiting_review`, which is a state, not a placeholder score,
and a rubric score without a named `scorer_id` is refused.

| Module | Role |
|---|---|
| `src/speech/capture.js` | Audio capture. Stream and recorder injected, so denial and interruption are driven by tests rather than hoped for on a device. |
| `src/assessment/audio-store.js` | IndexedDB clip storage, device-local. Every operation resolves rather than throwing. |

**The two failure paths, and why neither is a wrong answer.** A refused
microphone stores `microphone_failed`; an interruption mid-recording stores
`app_interrupted_before_submit` **and keeps whatever was captured** — it is
still what she said. Both are excluded from the numerator and the denominator
per `invalidity.rule`, and the screen tells the child plainly that a refused
microphone is not a wrong answer.

**Audio never leaves the device.** §3.6 forbids storing raw child audio by
default, a Firestore document caps at 1 MiB, and no storage bucket exists. Clips
live in IndexedDB keyed `runId/itemId#attempt`; only the reference and
`audio_device_id` sync. The consequence is stated rather than discovered: a
parent opening the review panel on the other iPad sees the prompt waiting with
no audio to play, and clips should be reviewed the day they are recorded because
iPadOS clears unused site storage after about a week.

### The keyboard instruction (requirement 5)

Shown on screen before the words and writing sections, and added to the iPad
checklist as §5.0:

> For an accurate placement result, temporarily turn off Auto-Correction and
> Predictive Text in Settings → General → Keyboard.

The app sets `autocorrect`, `autocapitalize`, `spellcheck` and `autocomplete`
off on every field, but **a web page cannot disable the QuickType bar**, and the
wording says so. A test asserts the note never claims the app has turned
anything off.

### Recovery export (requirement 1)

Assessment runs now travel with the recovery file, carrying
`blocked_by_content_domains` and `insufficient_domains` per run — a domain that
reported no band must be able to say afterwards *which* shortfall it was, and
neither can be recomputed from a file that dropped them. Import **merges**
rather than replaces, so a file exported before today's sitting cannot erase
today's answers. Audio is not in the file; `audio_device_id` says where it is.

### Two near-misses, same class as Step 3's

Both were tests flagging legitimate content, and both would have been switched
off rather than fixed if left:

- A scan for model answers checked `document.innerHTML`, which contains the
  whole inlined release by construction. Scoped to what is *rendered* — the
  answer keys shipping in the file is the accepted risk in `known-risks.md` §1c
  and has no fix without a server; what is fixable is never showing them.
- A scan for brief text flagged `SA-D02` for the word "school", which is in the
  prompt's own English wording — "how to go from the school to the library".
  The prompt is the task. Scoped to exclude it.

### One real bug its own test caught

`audio-store.js` unwrapped an `IDBRequest` with `out?.result ?? out`. A missing
key gives `result: undefined`, so the fallback returned the request object,
which is truthy — `has()` reported a missing clip as present.

38 new tests: 10 capture, 8 audio store, 8 browser (writing, speaking, mic
denial, artwork, keyboard note), plus the asset proofs. **301 unit and 59 browser
tests pass.** The built page is 398 KB.

## M2 Step 5 — the report, the parent report screen, and the device check

### The content guards now test mechanisms, not vocabulary

All three had been keyword scans, and all three flagged real content: a prompt
reading "choose the correct schedule", a prompt naming the places its own map is
labelled with, and the release data that is bundled into the page on purpose.
Each was a reason to switch a guard off, which is the failure mode this project
has already had once.

| Guard | What it asks now |
|---|---|
| No feedback | Two identical sittings, one choosing the key's answer and one a distractor. Everything but the option list must be identical, being chosen must look the same either way, and every unchosen option must look like every other. Everything inserted into the screen is recorded, so a verdict that flashes for 60 ms is caught. |
| Model answer | What the learner-facing container actually rendered — its text, its attribute values, everything inserted along the way — never the page source. The release is inlined so the app works offline; scanning the file only re-detects the bundling (`known-risks.md` §1c). |
| Asset brief | The brief minus the item's own learner-facing copy. SA-D02 asks for directions "from the school to the library", so those words are the task; what is left is the illustrator's instruction. |

`tests/fixtures/guard-regressions/false-positives.json` records four cases,
including one found by running the new guards: "chair" and "table" are SA-F02's
brief and also the choice labels of four items answered earlier in the same
sitting, so the brief guard reads the item on screen rather than the session.
Every recorded case is exercised by `tests/guard-regressions.test.js`, and each
is paired with the true positive the guard must still catch. Verified by
injecting five leaks into a copy of the built page and watching the matching
guard fail each time.

### The report

`src/assessment/report.js` produces five banded sections in the release's own
order and nothing else — no total, no average, no overall band, and a domain
that was not measured stays missing (`scoring.overall`).

**Pronunciation is not a sixth section.** It is a group nested inside the
speaking report: `S_*` skills under Speaking, `P_*` skills under "Pronunciation
observations" one level in, with no band and no figure of any kind. Nothing
appears there until a named human has listened to the original recordings of at
least two distinct prompts, and the device transcript is reported beside the
observation rather than converted into one.

Writing and speaking have no band until a person has reviewed the release's
minimum — five prompts and four. A rubric score without a `scorer_id` is not a
review, and an invalidated review stops counting while the response is kept.

The strengths and next-needs derivation is the content owner's rule as recorded
above, implemented literally: current attempt only; valid, unsupported, scored,
distinct items; objective value = points ÷ points possible; rubric skills read
the dimensions named for them and normalise by 3; at least two distinct items
before a skill is classified; the release's `secure_threshold` is the cut; at
most three ids per list, ordered by aggregate, then by more evidence, then by id.

**One thing the rule did not cover, found while implementing it, and since
decided.** Four writing prompts also carried a vocabulary skill — `VG_NEGATION`
on WA-F02 and WB-F02, `VG_LOCATION` on WA-D01, `VG_GENDER_NUMBER` on WB-D01 —
and the rule names dimensions for `W_`, `S_` and `P_` skills only. The content
owner's answer was that those tags should go rather than be mapped: see
"Release A — amended to `assessment-v1.0.2`" below. The parent report carries no
note about any of it, because a parent should read findings, not an
implementation warning.

### The parent report screen

Behind the parent password, in the parent overlay: five sections, each with
where it sits, how much to read into it, the evidence behind it, and two lists —
**Observed strengths** and **Suggested next practice areas**. Bands are written
out in words, because a parent reading `developing_secure` will guess at it.
Built with `createElement` and `textContent` throughout.

The no-total check in the browser suite is arithmetic rather than vocabulary: it
computes the figures a total or a cross-domain average would be and asserts none
is on the page, so a rewording cannot get one past it. Verified by injecting a
"Total points" row into a copy of the built page and watching it fail.

### The Device & Feature Check

Parent-only, in the same overlay, headed **"Test mode — nothing here affects the
learner's record."** It runs the same modules the assessment runs — the same
`speakFrench`, the same capture factory, the same audio-store instance — because
a check written against its own copy of that wiring would prove only that the
copy works.

Six checks, each started by the parent: the French voice (what was asked for and
what this iPad will use), French audio playing, microphone permission, recording
and playing it back, keeping and reading back a clip, and deleting it. Two of
them can only be judged by the person in the room, and those wait for an answer
rather than passing themselves.

The storage check includes the failure this project has already had: a clip that
was never stored must come back **absent**, not as an `IDBRequest` object, which
is truthy and made a missing recording read as present.

**It writes no record.** No run, response, exposure, review, score, report,
star, streak or synchronisation record. The only thing it writes is a diagnostic
clip under its own `devicecheck_` key prefix in IndexedDB on this device, and
those are deleted on the way in and on the way out. A browser test runs every
check against a device that already holds a finished run, a game profile and a
real recording, then compares localStorage byte for byte, compares the
assessment store, counts cloud writes, and checks that the real clip survived
while the diagnostic one did not.

One consequence worth recording: `deviceId()` used to mint this device's id
whenever something first wrote, which meant a parent opening the check on a new
iPad created it. The app now settles it at startup instead, so the check creates
nothing.

**It does not replace the iPad QA.** It says whether the machinery answers; a
child hearing the French correctly, and a person hearing the child, is still a
person's job. `docs/ipad-test-checklist.md` §5.0b covers running it, and §5.9
the report.

**A seventh check, added after the first real run of the six.** The parent ran
the check on the iPad, everything reported working — and then reasonably asked
where the pictures were. They were not there: the artwork renders in exactly one
place, `assessment-ui.js`, while a speaking prompt is on screen. Confirming the
map labels were readable therefore meant reaching the speaking section of a real
sitting, which spends most of a form on a question about type size.

So the check now shows them. *Show the four pictures* draws the same four SVGs
through the same figure markup and CSS as the learner's screen, in a layer that
reproduces that screen's geometry — `max-width: 720px` and the same padding.
That last part is the whole point: the parent overlay card is 480px, so a
picture drawn inside the panel would have been a quarter smaller than the real
thing and would have answered nothing. A browser test measures the rendered SVG
in both places at one iPad-sized viewport and requires the two to be equal;
setting the preview to the panel's width makes that test fail, which is how it
was checked. The verdict is the person's, like the two audio checks — it cannot
pass itself — and the layer is cleared when the check is left.

## Speaking artwork — built (approved 2026-09-09, see below)

**Was:** each form had five speaking prompts of which two carried an asset
*brief* rather than an asset, leaving three presentable against a minimum of
four. Speaking reported `insufficient_evidence` on every attempt, on both forms,
however well a learner did.

**Now:** all four assets exist in `src/assessment/assets.js` as inline SVG, and
each form administers all five prompts.

| Item | Form | Tier | Asset |
|---|---|---|---|
| `SA-F02` | A | foundation | Illustration: table, chair, blue book and red pencil on the table, green bag beneath |
| `SB-F02` | B | foundation | Illustration: window, bed, lamp **on** a table, book **under** a chair |
| `SA-D02` | A | developing | Map: `école`, `parc`, `bibliothèque`, `banque` |
| `SB-D02` | B | developing | Map: `parc`, `école`, `bibliothèque`, `boulangerie`, `piscine` |

Both developing-tier maps are included, not only the simpler illustrations.

**Held to the briefs by tests, not by assertion:**

- Illustrations carry **no text of any kind** — both briefs list
  `prohibited_text: French labels, English object labels`, and a label would
  hand over the noun the child is meant to retrieve.
- Maps carry their French place labels **and no route** — `learner_view` asks
  for "map with French place labels; no route arrows". The place names are the
  reference points for giving directions; an arrow would give the directions.
- No asset repeats any phrase from its own brief, and none displays an accepted
  answer from anywhere in the bank.
- Each asset declares what it depicts, and the declaration is checked against
  the brief's required list.
- The SVG is inert: no script, no external reference, no network.

**What the tests cannot tell you.** They prove nothing was dropped from a list
and nothing leaked. They cannot tell you whether a ten-year-old looks at
`SB-F02` and sees a book under a chair. **A person still has to look**, and the
rendered preview is committed at
[`docs/speaking-assets-preview.png`](speaking-assets-preview.png).

Both first drafts had defects a render caught and a test could not: in `SA-F02`
the chair back rose through the table and the pencil crossed it; in `SB-F02` the
chair read as a shelf. Both were redrawn.

**Still required before a speaking band is trusted:** review of these four by a
person, and the listening/voice QA on an actual iPad. Speaking-band acceptance
stays blocked until then.

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

- Map images for `SA-D02` and `SB-D02`, and the two illustrations: **built and approved by the content owner on 2026-09-09**, subject only to confirming the map labels are comfortably readable at actual iPad size (checklist §5.5d).
- If writing should measure `VG_NEGATION`, `VG_LOCATION` or `VG_GENDER_NUMBER`, Release B needs target-specific scoring criteria and matched prompts on both forms. Generic rubric dimensions are not precise enough, which is why v1.0.2 removed the tags.
- The 24 listening scripts need listening QA on an actual iPad with the resolved `fr-CA` voice.
- Someone must be named to score writing and speaking with the rubrics; until then those domains report `awaiting_review`. No adult in this family reads or speaks French. The content owner ruled on 2026-09-11 that an AI may give advisory or draft feedback but cannot produce a band, and that a named **qualified** human must read the writing or listen to the audio and confirm each dimension — so both domains stay `awaiting_review` until a French-capable person is found. See "Content-owner decision, 2026-09-11" below.
- Independent educator review has not occurred; do not describe the bank as educator-validated.

## Release A — amended to `assessment-v1.0.2`

**Content-owner decision, 2026-09-09.** Four writing prompts stop claiming a
grammar skill the writing rubric cannot evidence.

| Item | Skill removed | Skill kept |
|---|---|---|
| `WA-F02` | `VG_NEGATION` | `W_SENTENCE` |
| `WB-F02` | `VG_NEGATION` | `W_SENTENCE` |
| `WA-D01` | `VG_LOCATION` | `W_DESCRIPTION` |
| `WB-D01` | `VG_GENDER_NUMBER` | `W_DESCRIPTION` |

The reason is a measurement one, and it is worth stating in full because the
alternative looked reasonable. The generic writing rubric scores message,
vocabulary, structure, conventions and independence. None of those is about
negation, location or gender agreement, so a child who writes *"Je déteste le
fromage"* earns a strong message and structure score while demonstrating no
negation at all — and the report would have named `VG_NEGATION` as an observed
strength on the back of it. All three skills remain measured directly by the
vocabulary and grammar section's own items, so nothing is lost from the
measurement; what goes is a claim that was never evidence.

The four item `version` fields go to 2, because unlike the v1.0.1 amendment the
items themselves changed. `release_id` moves to `assessment-v1.0.2` across all
six JSON documents, `review_notes.md` and every one of the 90 items, with the
manifest re-hashed by `scripts/rehash-release.mjs`. No rule, rubric, fixture,
threshold, prompt, answer key or model response changed.

**The guard that keeps it decided.** `src/assessment/skill-mapping.js` holds the
dimension mapping, and `scripts/validate-release-a.mjs` now fails the build if a
rubric-scored item names a skill with no mapping. Verified by re-adding
`VG_NEGATION` to a copy of the release and watching `check:release-a` refuse it.
The parent-facing note about unmapped skills is gone from the report entirely.

**One defect found while doing this.** `rehash-release.mjs` rewrites every
occurrence of the old release id, including `manifest.supersedes`, which names
the *previous* release — so v1.0.1 shipped claiming to supersede itself. The
script now restores it after the rename, and v1.0.2 correctly supersedes v1.0.1.

`review_notes.md` also said "Compatible master plan: Revision 2" while the
manifest said 3. Corrected in the same amendment.

## Speaking artwork — reviewed and approved

The content owner reviewed all four assets against their briefs on 2026-09-09
and approved each: `SA-F02`, `SB-F02`, `SA-D02`, `SB-D02`. The illustrations
reveal no answer vocabulary and the maps carry their French place labels without
route arrows; the plain style is appropriate for an assessment.

**The M2 content blocker is closed**, subject only to confirming on the actual
iPad that the map labels are comfortably readable at real size (checklist
§5.5d). No automated check can answer that one.

## M2 acceptance — the iPad run

**Device & Feature Check, run on the family iPad, 2026-09-10: all six checks
reported working.** Resolved French voice, audible playback, microphone
permission, record / stop / replay / delete, local audio storage, and the
"Done — clear the test clips" control.

Microphone-denial recovery (§5.5c) and the picture readability question remain
for the parent. The second is why the seventh check exists: see "A seventh
check" above.

## One more test that could not fail

Found while running the full suite for the picture preview, on code this branch
does not touch.

`a double tap on an answer scores once` allowed the score to move by at most 20.
A correct answer at full lives is worth 15 base plus a speed bonus of up to 10,
so **one** answer can be worth 25 — and the test failed whenever the machine
got to the click quickly enough to earn a large bonus. It was timing, not
scoring: a real guard failing for a reason that had nothing to do with the gate
it guards. It now asserts base points, which do not move with the clock: one
question answered once is worth 15 or nothing, and three times would be 45.

The deeper problem was the one underneath. Forcing `commitAnswerOnce` to return
true did **not** fail that test — because `handleQuizAnswer` disables every
choice button after the first tap, and a disabled button never fires. The DOM
was doing the work, and §1.6 was still untested end to end after all. A second
test now re-enables the buttons between taps, which is what any stray redraw
would do, and requires the same question to count once. That one does fail
against the broken gate, while the first still passes — so the two protections
are now told apart.

## Two things the iPad found

**The French was too quick.** `speakFrench` set `rate = 0.85`; it is `0.80` now,
named as `SPEECH_RATE` rather than a number buried in the utterance, with a
browser test that taps a real speak button and pins it. One setting governs the
games and the check-in, because both speak through the same function. The rate
reads back as 0.800000011920929 — the platform keeps it as a 32-bit float — so
the test compares with a tolerance.

**A finished check-in had no way out.** `render()` appended the "All done" card
and returned without adding an action, so the only exit was the bar's **Pause**
button: the wrong word for a run with nothing left in it, and easy to miss at
the top of the screen. The finished screen now offers *Done — back to the
start*, and the bar says **Close** once the run is complete. Both leave the same
way a pause does, which changes nothing about a run that is already complete —
asserted by a test that compares the run before and after leaving.

## Scoring the open prompts — the screen and the export

Built alongside the question above rather than after it, because both are needed
whoever ends up scoring: a French teacher wants the same screen and the same
file. Nothing here depends on the answer, and nothing in `content/` changed.

`src/assessment/review.js` is the queue, the rubric application and the
invalidation; `src/modes/assessment-review-ui.js` is the screen, reached from
the parent panel behind the password. Three rules from the release are what the
module exists to hold.

**A review without a named scorer is refused.** `rubrics.json` requires an
eligible person, and an unattributed rubric score cannot be told apart from a
machine-generated one — which these two domains forbid outright. The refusal is
in `recordReview`, and again in the screen so the message can name what is
missing rather than throwing.

**An invalid response is preserved, never converted to incorrect**
(`invalidity.rule`). The parent can set a response aside and put it back, but
only their own: a `microphone_failed` or `app_interrupted_before_submit` that
the app recorded is a record of what happened, and not a parent's to erase.

**`support_flag` is the adult's to set.** Master plan §6 item 8 — only the
person in the room knows whether a hint was given. It had nowhere to be set
until now; capture always wrote `false`. A supported response is kept and
reported as supported evidence, and left out of the independent band.

Scores are chosen as radio buttons against the four anchor sentences, not typed
as a digit. A scorer choosing between sentences is doing the rubric's work; a
scorer typing a number is doing arithmetic, and can type 7. `validateScores`
refuses anything that is not a whole 0–3 for exactly the dimensions the rubric
declares, which `scoreRubric` would not have caught until it was computing a
percent — too late to say which box is empty, and it would have reported 233%.

### A collision found while building the export

`WRITING-ANALYTIC-V1`'s 3/3 worked example is, word for word, `WA-D02`'s
`model_response` — and `WA-D02` is a form-A written prompt, which is Jenn's
form. Both are the content owner's and both are right where they are; what
cannot happen is a scorer reading the second while marking the first.

The export therefore withholds a worked example whose text is the model answer
to a prompt in that same export, and says that it has done so rather than
silently printing less. The filter is by model-answer text, not by `prompt_id`:
the *weak* `WA-D02` example scored 2/1/1/1/3 gives nothing away and stays, and
the speaking examples are descriptions of a performance rather than utterances,
so they are unaffected. On form B, where `WA-D02` is not administered, nothing
is withheld.

The model answers are absent from the screen for the same reason, which is the
rule the parent report already held (`tests/browser/assessment-report.test.js`).

### Verified by breaking it

Four unit breaks and three browser breaks, each against the built page, each
failing exactly the test that guards it and nothing else: accepting a review
with no scorer; printing the withheld worked example; letting a parent erase
the app's own invalidity finding; accepting an out-of-range anchor; showing the
model answer on the scoring screen; and destroying the child's words when a
response is set aside.

`docs/ipad-test-checklist.md` §5.10 is the parent's walkthrough, including
§5.10g–h for the case where nobody in the house speaks French.

## Content-owner decision, 2026-09-11 — AI scoring

**Answered. Release A is unchanged: no version bump, no edit to any file under
`content/`.** The question logged against this release is closed.

> Release A remains unchanged. AI-only scoring is prohibited. An external AI
> service may provide advisory or draft rubric feedback, but it cannot produce
> an official Release A band. A named qualified human must directly read the
> writing or listen to the original audio and confirm the rubric dimensions.
> Without that confirmation, the domain remains `awaiting_review`. Device
> transcripts and automated pronunciation measurements are practice aids, not
> scoring evidence.

### What this means for this family, plainly

**It does not unlock writing.** The permission is for *advisory* feedback, and
the confirming person must be **qualified** — someone who can read French at
this level and judge it. No adult in this household can. So writing and
speaking both stay `awaiting_review` until a French-capable person is found:
a school French teacher, a tutor, one sitting for both girls. An AI draft plus
a parent who cannot read the answer is not the human confirmation the decision
requires, and entering numbers on that basis would put a name against a
judgement nobody made.

**What it does permit** is taking the export to an AI for a first pass or a
second opinion, and handing that to the qualified person as a starting point
rather than a blank rubric. That is a convenience for them, not a substitute
for them.

### What changed in the code

Nothing structural — the module already refused everything the decision
forbids, because it was written against the release rather than against the
hoped-for answer. Two pieces of wording were wrong and are corrected:

- The export said *"return the numbers to the parent, who enters them and is
  recorded as the scorer."* Under the decision the recorded scorer is the
  person who **read or listened**, whoever later types the numbers in. It now
  says so, and states the advisory rule and the transcript exclusion in the
  content owner's own terms.
- The scoring screen asked *"Who is doing the scoring?"* with a note about
  attribution. It now names the requirement: the person who read or listened
  **and can judge French at this level**, not whoever is holding the iPad.

**No `scoring_method` field was added.** It was floated when the question was
open; the decision defines no such vocabulary and leaves Release A untouched,
so inventing one would be inventing a rule the content owner did not write —
the mistake this project has already made once with the skill-evidence rule.
The review record names a human scorer, and that remains the whole contract.

**No AI integration was built, and none can be.** The app is client-only with
no server; its only network is Firebase. Any AI use happens in the parent's own
session, on text the export gives them.

## A work order that was partly about another app

**2026-09-11.** A list of required fixes arrived. Checked item by item against
this repository before anything was changed, because acting on a misaddressed
work order is how a codebase acquires features nobody wanted.

| Asked for | Found here |
|---|---|
| Fix first-tap audio without weakening route/item cancellation | **Real mechanism, different name.** There is no router, but `speakFrench` did call `cancel()` before every `speak()`. Fixed. |
| An isolated microphone panel: permission, record, stop, play, delete, handle denial and silence, write no learner record | **Already built and shipped** as the Device & Feature Check, including the no-record guarantee, proven byte-for-byte. |
| Confirm the Firebase project `chore-tracker-a461b` | **Correct and confirmed intentional** — the owner shares it across their repositories. Already recorded in `known-risks.md` §1. |
| Deploy the repository's Firestore rules | **There are none** — no `firestore.rules`, `firebase.json` or `.firebaserc` exists. See the warning below. |
| Make the configuration failure identifiable | **Real.** Every failure was a `console.warn` plus a generic `'error'`. Fixed. |
| Re-test 16 dictation words, 16 contrast utterances, 12 decoding recordings | **No such content.** Release A is 90 items — per form 12 listening, 12 reading, 10 vocabulary/grammar, 6 writing, 5 speaking. Dictation here is a game mode over a dynamic word list, not 16 fixed words. |
| Create no Jenn/Jess attempt or **mastery** record | Records are attempts, stars and rounds. This project deliberately makes no mastery claim (`prohibited_claims`). |

### A warning that matters more than any of the fixes

**Firestore security rules are per-project, not per-app.** The Firebase project
is shared with the owner's other repositories. Deploying a rules file authored
for French Adventure to `chore-tracker-a461b` would replace the rules the other
applications are running under. No rules file was added here for that reason:
one cannot be written correctly from inside this repository alone.

## The first tap, and a harness that could not fail

`speakFrench` called `speechSynth.cancel()` unconditionally before every
`speak()`. The cancel is wanted — moving to the next word should cut the
previous one off rather than queue behind it — but calling it on an **idle**
synthesiser is the documented WebKit way to lose the first utterance after a
page loads: the child taps 🔊, hears nothing, taps again and it works. It is now
guarded on `speaking || pending`, which removes the no-op call and keeps the one
that does work.

**The more serious finding is how nearly this went in unverified.** The new test
passed against a build with the defect restored *and* against a build with the
cancel deleted entirely — it could not fail. The cause was not the test:
`tests/browser/regression.test.js` and `tests/browser/data-loss.test.js`
hard-coded `path.resolve('index.html')` and ignored `APP_FILE`, so every
"verified by breaking it" run against those two files silently re-tested the
fixed page. The other seven browser files honour it. Both now do, and with the
harness repaired the test fails against both breaks and passes on the fix.

Any earlier claim of break-verification that ran through those two files was
worth less than it sounded.

## Naming what is wrong with the cloud

Every Firestore failure landed in `console.warn` and became a generic
`'error'`, so "we are offline", "the security rules refuse this" and "that
project does not exist" were indistinguishable from the screen — and the one a
parent can act on was the hardest to see.

`describeCloudFailure` now maps the Firestore code to a sentence that names the
project and says what to change, and marks whether it is a *configuration*
problem at all. That last flag is the point: telling a parent to go and change
settings because the wifi dropped is worse than saying nothing, so `unavailable`
and `resource-exhausted` are explicitly not configuration failures. The sync
line shows the text only when the failure is one a person can act on.

Seven unit tests, verified against three breaks: marking everything a
configuration problem, collapsing every code to one sentence, and dropping the
project name.

## Parent acceptance

| Milestone | Accepted by | Date | Note |
|---|---|---|---|
| M1 | — | — | pending |
