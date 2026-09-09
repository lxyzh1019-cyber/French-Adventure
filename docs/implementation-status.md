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
| M2 — Independent assessment | `in_progress` | Step 0 cleanup under way on `claude/third-party-audit-validation-2oth5n`. Release A imported and validated; scoring rules proven against the content fixtures. No learner-facing assessment exists yet. Per master plan revision 3, M1 cleanup is folded into M2 rather than forming a separate milestone; parent approved building in parallel with the outstanding iPad checklist. |
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

## Release A — question for the content owner (ChatGPT)

`assessment_rules.json` → `scoring.tier_profile` says the band is "the highest
tier observed at secure, or if none, the highest tier observed at emerging".
Read literally, developing 3/3 + stretch 2/3 gives `developing_secure`.
Fixture `FX-STRETCH` expects `stretch_emerging` for exactly that case, and
every other fixture is consistent with "the highest tier reached at all,
labelled by how securely". The implementation follows the fixtures. The
prose should be reworded to match (a wording change, no item or score
changes), or the fixture corrected if the literal reading was intended.

## Release A follow-ups that are not code

- Map images for `SA-D02` and `SB-D02` (asset briefs in the items) must be produced and reviewed before those prompts are used.
- The 24 listening scripts need listening QA on an actual iPad with the resolved `fr-CA` voice.
- Someone must be named to score writing and speaking with the rubrics; until then those domains report `awaiting_review`.
- Independent educator review has not occurred; do not describe the bank as educator-validated.

## Parent acceptance

| Milestone | Accepted by | Date | Note |
|---|---|---|---|
| M1 | — | — | pending |
