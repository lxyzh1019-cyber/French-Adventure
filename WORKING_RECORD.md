# WORKING RECORD — French-Adventure — rules v2

Single working record for this repository. Updated by the main session at the end of every implementation turn (the record guard hook checks this). Keep it terse; history lives in git.

## Approved baseline
- No plan approval round: 2026-09-21 install was a direct, fully-specified instruction (8 explicit steps), executed as given. Rules v2 hooks were not yet loaded in that session, so plan mode did not apply to it.

## Pending
- FEATURES.md still holds only the governance manifest. The manifest of the French Adventure **app** itself (screens, data/sync, vocabulary, assessment rules) is unwritten — needs a read-the-app pass before any future edit can be regression-checked against it. Not attempted on 2026-09-21: not requested, and inventing it from guesswork would make the regression table worthless.

## Request ledger
| # | Round/date | Requirement (user's words, short) | Status | Note |
|---|---|---|---|---|
| 1 | 2026-09-21 | "Check out branch rules-v2" | done | Existed on origin only; checked out as tracking branch |
| 2 | 2026-09-21 | "Unzip working-rules-bundle-v2.zip with Python" | done | `zipfile` extract to scratchpad, then copy in |
| 3 | 2026-09-21 | "Copy the contents of bundle/ into the repo root" | done | All listed paths landed. `bundle/README.md` deliberately **not** copied — bundle install guide, would have overwritten the project README |
| 4 | 2026-09-21 | "If .claude/settings.json already exists, merge it" | n/a | No pre-existing `.claude/`; bundle settings installed verbatim, no merge performed |
| 5 | 2026-09-21 | "Delete the zip and docs/CLAUDE.review-rev1.md" | done (adapted) | Zip deleted. **rev1 does not exist** in repo or bundle; deleted `docs/CLAUDE.review-rev2.md`, which the bundle README marks "deleted during install" |
| 6 | 2026-09-21 | "Make .gitignore track .claude/ and ignore .claude/state/" | done | Also added `__pycache__/` — replay script byte-compiles `_common.py` |
| 7 | 2026-09-21 | "Run bash tests/replay-hooks.sh and show the last line" | done | `passed=14 failed=0` |
| 8 | 2026-09-21 | "Commit and push to rules-v2" | done | `30c3c59`; open PR #23 already carried the branch, no new PR opened |
| 9 | 2026-09-27 | Run the `hz-claude-config` stub installer; commit, push and open a PR if it ends `INSTALL OK` | done | `INSTALL OK`, smoke test `Rules v3.1.4 loaded`. v2 hooks, skill copy, `tests/replay-hooks.sh`, `tests/test-routing-hook.md`, `docs/HZ-skill-trigger-tuning.md` removed; `CLAUDE.md` is now the pointer; `FEATURES.md` governance section updated to match |
| 10 | 2026-09-28 | "Where is the status of rebuild?" | done | Answer: `docs/implementation-status.md`. Row numbered 10 because `origin/main` (PR #24) already holds row 9 |
| 11 | 2026-09-28 | "M1 same problems, you have to press play again" | done — fixed by row 17, iPad confirmed 2026-09-29 | Audit only, no fix. `d8edc24` covered one WebKit cause (idle `cancel()`); no gesture unlock, no voices-loaded wait, non-gesture auto-play at `src/app.js:2479`, `new Audio().play()` paths unhandled; guard test is a Chromium stub. Needs a design pass before any patch |
| 12 | 2026-09-28 | "For M2 the only thing missing is Jenn's assess?" | done | No — Step 5 was already built; Step 6, parent iPad evidence and parent acceptance were outstanding |
| 13 | 2026-09-28 | Plan v1 "Close out M2 Step 6" (approved) | partial | Items 1–7 done on `claude/m2-step6-closeout` (`1c2172d`, PR #25). Plan v2 approved 2026-09-29: `origin/main` merged into the branch, conflict resolved by keeping both sides |
| 14 | 2026-09-29 | "Can you export the diagnose report", Plan v1 "Save the Device & feature check as a file" (approved) | done (uncommitted) | ⬇ Save these results in the device check → `device-check-YYYY-MM-DD.txt`; shared `saveTextFile` in `src/app.js`; results gain an `answer` field. Does not unblock the iPad row: a person still has to run it |
| 15 | 2026-09-29 | "Here are the results, how to move on" (device check `.txt`, Jenn Form A `.html`, Jess Form A `.html` + `.txt`) | done | Plan v2 (approved). Recorded in `implementation-status.md` ("2026-09-29 — iPad results received", open items, Phase 2 rows) and `ipad-test-checklist.md`. Docs only; no code. Jess sat both forms — recorded, not an app defect |
| 16 | 2026-09-29 | Jess Form B report screenshots ("jess · form B · 2026-09-10") | done | Sitting date corrected 2026-09-17 → 2026-09-10 in both docs; 2026-09-17 is the report date. Her Form B recordings still not exported |
| 17 | 2026-09-29 | Plan v1 "Fix the silent first tap" (approved: one audio owner; a check-in play counts only once sound starts) | done — iPad §4.5 a–c confirmed 2026-09-29 | PR #29 merged as `5c272b3`. `src/speech/audio-out.js` owns all speech and clip playback; every caller routed through it. Closes the code side of row 11; row 11 stays open until the iPad confirms |
| 18 | 2026-09-29 | "merged, first tap works on the iPad" | done | §4.5 a confirmed; then "both work" — b and c confirmed |
| 19 | 2026-09-29 | "fix the first tap first, then design the learning" → "Brief only, wait" | done | Learning engine design waits for Release B (master plan §5.2/§5.7: content owner authors, Claude must not). Brief written: `docs/release-b-brief.md` |
| 20 | 2026-09-29 | Brief approved with recommendations: patterns not verbatim answers; Jess baseline = Form B, Form A with caution; learners sit check-ins apart in future | done | Recorded in the brief §3 and below |
| 21 | 2026-09-29 | "Plan V5 + Release B: update plan in repo, validate before writing in" | done | Revision 5 and `pilot-v1.1.0` validated read-only first (hashes, counts, references, `check-content.mjs`); results in `implementation-status.md` "2026-09-29 — Release B received" |
| 22 | 2026-09-29 | Plan v2 "Import master plan Revision 5 and Release B `pilot-v1.1.0`" (approved; finding 2 → re-inspect, finding 7 model voice → deferred) | done — committed, see row 23 | Branch `claude/import-rev5-pilot-v1.1.0`. Plan replaced verbatim; package imported unmodified; validator test; docs; amendment list `docs/release-b-amendments.md`. Nothing in the package changed |
| 23 | 2026-09-29 | "yes, commit and open the PR and the first tap is confirmed in last chat" | done | Checklist §4.5 first-tap item corrected to done (a–c confirmed 2026-09-29; idle 30 s check not separately reported) and Result page sub-lines filled; import of row 22 committed and PR opened (`4905512`, PR #31) |
| 24 | 2026-09-29 | "yes, fix both on the same PR" | done | FEATURES.md audio feature line and the M2 Step 6 device-results row now say first tap confirmed on the iPad; record correction only, no hotspot change (no new fix or recurrence) |
| 25 | 2026-09-30 | Design handoff zip: "read PROMPT.md, reply with understanding of the 3 PRs, risks, tests; after OK do PR 1 only" → Plan v3 approved (French Time spelling, all 12 Jenn-colour error places, ✗/✓ by CSS, screenshots via chat) | in progress | Branch `claude/design-pr1-tokens`; plan copy `plans/2026-09-30-plan-v3-design-pr1-tokens.md`; PR 2 and PR 3 get their own plans after each merge |

## Hotspot counter
| Area / feature | Fix rounds | Recurrences | Regressions caused | Workarounds/exceptions | Last symptom | Rewrite-vs-repair reviewed? |
|---|---|---|---|---|---|---|
| Rules bundle install | 0 | 0 | 0 | 0 | — | no |
| Audio playback (first tap silent) | 2 (`d8edc24`; one audio owner, `claude/audio-first-tap`) | 1 (parent, 2026-09-28) | 0 | 0 | "You have to press play again" | yes — Plan v1 2026-09-29: one audio owner (`src/speech/audio-out.js`) instead of per-site patches. A further recurrence after this means the WebKit model in `tests/helpers/fake-webkit-audio.js` is wrong, not that another call site needs a patch |
| Design update (tokens, colours, readability) | 1 (PR 1, `claude/design-pr1-tokens`) | 0 | 0 | 0 | Wrong answers in Jenn red; indigo text 2.3–2.8:1; white on green 2.5:1 | no — first round, no history |
Rule: 3 fix rounds, or 2 recurrences, or a fix causing a nearby regression → no further patch until the comparison is presented.

## Deliverable ledger
| Deliverable | State | Evidence |
|---|---|---|
| `.claude/` governance tree at root | COMPLETE | 13 files committed in `30c3c59`; `settings.json` = model `fable`, `defaultMode: plan`, 6 ask + 8 deny, hooks on UserPromptSubmit/PreToolUse/Stop |
| `CLAUDE.md` at root | COMPLETE | Committed, 13503 bytes, bundle copy unmodified |
| `tests/` verification harness | COMPLETE | `replay-hooks.sh` → `passed=14 failed=0`; `test-routing-hook.md` present for the manual cloud pass |
| `docs/HZ-skill-trigger-tuning.md` | COMPLETE | Committed; `CLAUDE.review-rev2.md` removed as the bundle directs |
| `.gitignore` rules | COMPLETE | `git check-ignore`: `.claude/settings.json` not ignored, `.claude/state/foo` ignored |
| `FEATURES.md` app manifest | COMPLETE | Manifest v2, 2026-09-29: 73 features in 5 groups, read from `src/` at `4a16357`. v3, 2026-09-29: device-check "Opened from" defect pointer added; no feature changed |
| M2 Step 6 — suite run at HEAD | COMPLETE | LF copy of `4a16357`: `npm test` 398/398, handlers 37, drift pass, Release A 90 items, browser 95/95, content 3/3; CI run 35669857016 success |
| M2 Step 6 — data regression | COMPLETE | migrations 15, merge 22, assessment-merge 14, backup-restore 4, assessment-store 14, assessment-model 18 → 87/87 |
| M2 Step 6 — stale status claims corrected | COMPLETE (uncommitted) | `implementation-status.md` rows 16/23/31 and Checks table; `known-risks.md` §1c |
| M2 Step 6 — review summary | COMPLETE (uncommitted) | `implementation-status.md:1005`; M2 row added to Parent acceptance |
| M2 Step 6 — parent iPad handoff checklist | COMPLETE (uncommitted) | `ipad-test-checklist.md:16` preface, Result page at line 481 |
| M2 Step 6 — actual-iPad device results | BLOCKED — parent-only checks on the iPad; no worker can run them | 2026-09-29: device check 7/7 (voice fr-CA Amélie), Jenn and Jess Form A exported with 5/5 clips each. Still parent only: §5.5c (no check-in available; next re-check), §4.5 idle-30 s check (first tap a–c confirmed 2026-09-29), M1 Parts 1–4, recovery file, Jess Form B clip export |
| Device check "⬇ Save these results" | COMPLETE | opus-worker: LF copy `npm test` 401/401, drift and release-a pass; Windows `test:browser` 95/95 (system Chrome); Windows `npm test` 400/401, the one failure the known CRLF manifest hash. Used on the iPad 2026-09-29 (Chrome for iOS): file produced; its "Opened from" label is wrong under Chrome (open question) |
| Record 2026-09-29 iPad results (docs) | COMPLETE | Branch `claude/record-ipad-results-2026-09-29`; `implementation-status.md`, `ipad-test-checklist.md`, this file, `FEATURES.md` |
| Audio first tap — one audio owner | COMPLETE | Merged: PR #29 as `5c272b3`. Parent, 2026-09-29, on the iPad: "first tap works" (§4.5 a); "both work" (§4.5 b Listen & Speak first word, c after sleep). Code evidence: 9 new or replaced browser tests: 6 failed on the old build (3 were guards that already passed), all pass after; Windows `test:browser` 103/103, LF-copy `npm test` 416/416, handlers 37, drift pass (LF copy; the Windows CRLF tree fails drift by line endings alone), Release A pass. `index.html` built from the LF copy. iPad §4.5 a–c confirmed |
| M2 Step 6 overall | PARTIAL | Claude-side evidence complete; device results outstanding; M2 cannot be accepted until they are recorded |
| Branch up to date with `origin/main` | COMPLETE | Plan v2 6b, 2026-09-29: `bd53ca6` merged; only `WORKING_RECORD.md` conflicted (resolved by keeping both sides); `FEATURES.md` auto-merged |
| Master plan Revision 5 in repo | COMPLETE (committed `4905512`, PR #31, not merged) | `docs/French_Adventure_Improvement_Plan.md` replaced verbatim, LF; sha256 equals the delivered file's (`7ef10683…745f20`); header "Revision: 5 — 2026-09-20" |
| Release B `pilot-v1.1.0` imported | COMPLETE (committed `4905512`, PR #31, not merged) | `content/releases/pilot-v1/`: 18 files byte-identical to the zip; 16/16 manifest hashes match; `check-content.mjs` passes. Validated, not accepted |
| Release B validator cases | COMPLETE (committed `4905512`, PR #31, not merged) | `tests/content-validator.test.js`: real package passes; link-only skills never scheduled (fires on a mutated copy). File 23/23; see "Checks and evidence" for the suite |
| Release B docs and amendment list | COMPLETE (committed `4905512`, PR #31, not merged) | `implementation-status.md` (rows, new section, §4.6 mapping, M3 constraints), `release-b-brief.md` (3 edits), `known-risks.md` §3 note and §4, `ipad-test-checklist.md` boards check, `release-b-amendments.md` (findings 1, 2, 3, 6 and the brief correction) |
| Rules live for this repo | BLOCKED | Needs PR #23 merged to `main` — cloud sessions branch from `main`, so nothing is governed until then |
| Design PR 1 — stage 1 branch from main | COMPLETE | `claude/design-pr1-tokens` created from `d042a58` |
| Design PR 1 — stage 2 implementation (opus-worker) | COMPLETE | opus-worker, model `claude-opus-5-5` (effort configured medium). LF copy `npm run verify`: 418/418, handlers 37, drift ✓, release A ✓ (90 items); Windows `test:browser` 103/103 (no test changed); Windows `npm test` 417/418 (the known CRLF manifest hash). Contrast indigo text 2.33→9.81, text on green 2.54→7.04, wrong on surface 3.77→7.71. Chinese lines 226→226, `中文见家长页` 3→3, `(中文 → parents` 2→2. 40 screenshots (10 screens × 2 orientations × before/after) in the session scratch folder |
| Design PR 1 — stage 3 evidence check, records, commit, PR, screenshots | COMPLETE | Main session re-checked the diff (no `--jenn` left in the 12 places, 3 raw radii left as planned, label in both places, tests untouched) and after-screenshots by eye; committed and pushed on `claude/design-pr1-tokens`, PR #33 open ready for review; screenshots zip sent in the session |
| Design PR 1 — stage 4 review and merge | WAITING ON YOU — review and merge PR #33 | |
| Design PR 2 — stage 5 Plan for PR 2 | NOT STARTED | after PR 1 merges |
| Design PR 2 — stage 6 approve plan, review and merge | WAITING ON YOU — after Plan for PR 2 | |
| Design PR 3 — stage 7 Plan for PR 3 | NOT STARTED | after PR 2 merges |
| Design PR 3 — stage 8 approve plan, review and merge | WAITING ON YOU — after Plan for PR 3 | |

## Checks and evidence
- 2026-09-21 `bash tests/replay-hooks.sh` → passed=14 failed=0 (validation-line 3/3, record-guard 3/3, plan-gate 3/3, skill-router 2/2, routing-guard 3/3)
- 2026-09-21 `git check-ignore -v` on `.claude/settings.json` and `.claude/state/foo` → tracked / ignored as intended
- 2026-09-21 `routing_guard_mode` = `observe` (bundle default) — **not** yet `enforce`; `tests/test-routing-hook.md` unrun
- 2026-09-21 record-guard hook fired live on the install turn itself, forcing this record — the Stop hook is working from disk before merge
- 2026-09-29 `opus-worker` self-reported model `claude-opus-5-5` (effort: configured high, not observable)
- 2026-09-29 M2 Step 6 suite: see the deliverable ledger. `bash tests/replay-hooks.sh` → `passed=12 failed=2` on Windows: the harness hands `/tmp` paths to Windows Python, so this is an environment failure, not a hook defect. Not re-run on Linux; the script is deleted upstream by PR #24
- 2026-09-29 record iPad results (docs only): Windows `npm test` 400/401 (the known CRLF manifest-hash failure); LF export of `98d679d` with the four edited files overlaid: `npm test` 401/401, `check:drift` and `check:release-a` pass. Grep: no remaining claim that Jess sat Form B on 2026-09-17; no claim that writing or speaking is scored. opus-worker self-reported model `claude-opus-5-5`

- 2026-09-29 audio first tap (opus-worker, model `claude-opus-5-5`): failing-first evidence against the old build and the passing run are in the deliverable ledger row; `grep` shows `synth.speak`, `new Audio` and `.play(` only in `src/speech/audio-out.js` (and tests)
- 2026-09-29 Release B import (opus-worker, self-reported model `claude-fable-5-1`): `node scripts/check-content.mjs content/releases/pilot-v1` passes; 16/16 manifest hashes match, 18/18 files byte-identical to the zip; plan file sha256 equals the Downloads file (LF); LF copy of the working tree: `npm test` 418/418 (416 + 2 new), handlers 37, `check:drift` and `check:release-a` pass; Windows `npm test` 417/418, the one failure the known CRLF manifest hash. Grep "revision 3": only historical statements remain (`implementation-status.md:23`, `:90`, `:102`)

- 2026-09-30 design PR 1 (opus-worker, model `claude-opus-5-5`): LF copy `npm run verify` 418/418, `check:handlers` 37, `check:drift` ✓, `check:release-a` ✓; Windows `CHROMIUM_PATH=…chrome.exe npm run test:browser` 103/103; Windows `npm test` 417/418 (known CRLF manifest hash). `index.html` rebuilt in the LF copy, banner "Built from d042a58", byte-identical to the drift-checked build. Contrast script and screenshot script (`shots.mjs`) live in the session scratch folder only. Regression table for this change:

| Feature | v4 → v5 | Note |
|---|---|---|
| All learner screens, modes, points, rounds, drafts | kept | colours, corners, one label only |
| Speech / audio owner | kept | untouched |
| Assessment screens and rules | kept | title/stimulus colour only; no marks on `.assess-choice` (snapshot tests pass) |
| Parent area (password, clear, recovery, device check) | kept | Reset All and error messages recoloured to `--wrong` |
| Data and sync | kept | untouched |
| Design tokens and rules section | added | `docs/DESIGN.md`, tokens, wrong ≠ Jenn, ✓/✗ marks, indigo text, radii, back-button size, "French Time" |
| Hub label "French_game" | intentionally removed | now "French Time" (parent's spelling) |

## Open questions / blockers
- PR #23 must merge into `main` before any of this governs a session. Verify in a **new** session: first reply should report "rules v2.1 (2026-09-21)".
- Superseded 2026-09-27: the repo copy of `.claude/skills/hz-guarantee-audit/`, `routing_guard_mode` and `tests/test-routing-hook.md` were removed by the stub install; skill and routing-guard mode are now maintained in `hz-claude-config`.
- 2026-09-29: the local `main` had been stale (PR #24 was never pulled), so this session ran on the in-repo v2.1 rules. `origin/main` (`bd53ca6`) is now merged into `claude/m2-step6-closeout`; from here the central `hz-claude-config` rules apply.
- `.claude/hooks/config.json` had line-ending-only changes left behind by the hook replay. They were resolved by taking PR #24's deletion of the file during the merge (Plan v2, 6b).
- 2026-09-29 device check defect, not fixed: `formatDeviceCheckReport` (`src/modes/device-check.js:93`) labels any non-standalone page "Safari tab", so a check run in Chrome for iOS says "Opened from: Safari tab". Needs a plan before any change.
- 2026-09-29 Jess's Form B recordings (sat 2026-09-10, ~19 days old) are still not exported. Only the parent can do it, in the browser where the Form B report opens. Time-bound: WebKit clears unused site data after about a week.
- 2026-09-29 Jess has sat both forms. Her next re-check has no unseen form: Form B reusable from 2026-11-09, Form A from 2026-11-28 (`administration.reassessment`). Jenn's re-check form is B.
- On this Windows checkout (`core.autocrlf=true`), `npm run verify` fails `check:drift`, `check:release-a` and one unit test because of CRLF line endings, not code. Structural fix (not done): a `.gitattributes` that pins LF.
- 2026-09-29 Jess Form A (`run_mumqznlp_gd5o7h`) read with caution: sat the same form 17 min after Jenn on the same iPad; her listening result matches Jenn's in every field, and she rose about a band in 19 days without lessons. Possible overhearing. Result unchanged; her baseline for Release B is Form B (2026-09-10). Future check-ins: learners sit apart (parent decision).
- 2026-09-29 Release B received and imported (`pilot-v1.1.0`, plan Revision 5). M3 still waits on M2 acceptance and on the parent's approval of Release B. The amendment list `docs/release-b-amendments.md` is with the parent to hand to ChatGPT; the repo keeps the delivered package until a versioned amendment arrives. *(Earlier: M3 waited on Release B itself; the brief was handed over and answered.)*
