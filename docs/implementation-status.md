# Implementation status

Execution log, per master plan §5.6. This is not a plan. `files created` never
means `accepted`; only the parent's recorded acceptance moves a milestone to
`accepted`.

States: `not_started` · `in_progress` · `ready_for_review` · `accepted` · `blocked`

| Field | Value |
|---|---|
| Master plan | French Adventure Improvement Plan, revision 2 (2026-09-06; status update 2026-09-08) |
| Baseline commit | `f065ca8` |
| M1 implementation | [PR #17](https://github.com/lxyzh1019-cyber/French-Adventure/pull/17), merged as `f290a3e` |
| M1 audit | third-party audit of `f290a3e`, 2026-09-08 |
| This repair round | branch `claude/audit-report-review-cq7cni` |

## Milestones

| Milestone | State | Notes |
|---|---|---|
| M1 — Repair foundation | `ready_for_review` | Both audit blockers repaired with regressions; full Match resume matrix; parent iPad smoke checklist and recovery-file confirmation still required for `accepted`. |
| M2 — Independent assessment | `blocked` | Blocked on M1 acceptance. Release A imported and validated; scoring rules proven against the content fixtures. No learner-facing assessment exists yet. |
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
| `npm run verify:all` passes in CI | pending CI | Passes locally: unit, handler check, drift, Release A validation, browser suite. |
| Parent keeps the verified combined recovery file and completes the iPad smoke checklist | **parent** | Not evidenced in the repository. Checklist in the audit; repeated below. |

### Parent-observed defects fixed in the same round

| Observation | Cause | Fix |
|---|---|---|
| Recording hard to turn off; mic too small | No stop path at all: no `abort`, no `onend`; second tap threw `InvalidStateError` and the button stayed pulsing. Mic had height but no width on touch. | `src/speech/recorder.js` toggle controller (tap to start, tap to stop, resets on end/error/timeout). Listen & Speak no longer auto-submits the transcript. 56 px mic on touch. |
| Pronunciation (🔊) buttons too small | `question-speak-inline` class was never defined; inline 🔊 rendered at browser default (~17 px). | Defined; every inline 🔊 uses `.speak-inline`/`.question-speak-inline`, ≥44 px (52 px on touch). Browser test scans every screen. |
| Some screens still say G4 while others say L1–L7 | Eleven leftover sites: hub note, tab markup, subtitle, rules strip, disclosure button, parent heading, moon banners, trophy strips, dead unlock banner. | All learner-facing text now uses `levelLabel()`/`levelNumber()`. Subtitle reads "Levels 1–7" with no curriculum claim (no traceable mapping exists in the app yet). Browser test asserts no `G4`/`Grade N` text on hub, game, study, My Words, round-complete, parent views. Selecting a player now opens the recommended level. |

## Checks

| Check | Command | Last local result |
|---|---|---|
| Unit + handler export | `npm test` | pass |
| Build parity | `npm run check:drift` | pass |
| Release A contract | `npm run check:release-a` | pass |
| Browser (Chromium) | `npm run test:browser` | pass (`CHROMIUM_PATH=/opt/pw-browsers/chromium` in the sandbox) |

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
