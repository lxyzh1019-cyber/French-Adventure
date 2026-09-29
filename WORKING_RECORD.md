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
| 10 | 2026-09-28 | "Where is the status of rebuild?" | done | Answer: `docs/implementation-status.md`. Row numbered 10 because `origin/main` (PR #24) already holds row 9 |
| 11 | 2026-09-28 | "M1 same problems, you have to press play again" | open | Audit only, no fix. `d8edc24` covered one WebKit cause (idle `cancel()`); no gesture unlock, no voices-loaded wait, non-gesture auto-play at `src/app.js:2479`, `new Audio().play()` paths unhandled; guard test is a Chromium stub. Needs a design pass before any patch |
| 12 | 2026-09-28 | "For M2 the only thing missing is Jenn's assess?" | done | No — Step 5 was already built; Step 6, parent iPad evidence and parent acceptance were outstanding |
| 13 | 2026-09-28 | Plan v1 "Close out M2 Step 6" (approved) | partial | Items 1–6 done on `claude/m2-step6-closeout`, uncommitted. Plan v2 (merge `origin/main` into the branch) awaiting approval |

## Hotspot counter
| Area / feature | Fix rounds | Recurrences | Last symptom | Rewrite-vs-repair reviewed? |
|---|---|---|---|---|
| Rules bundle install | 0 | 0 | — | no |
| Audio playback (first tap silent) | 1 (`d8edc24`) | 1 (parent, 2026-09-28) | "You have to press play again" | no — a design pass is required before the next patch; one more recurrence hits the gate |
Rule: 3 fix rounds, or 2 recurrences, or a fix causing a nearby regression → no further patch until the comparison is presented.

## Deliverable ledger
| Deliverable | State | Evidence |
|---|---|---|
| `.claude/` governance tree at root | COMPLETE | 13 files committed in `30c3c59`; `settings.json` = model `fable`, `defaultMode: plan`, 6 ask + 8 deny, hooks on UserPromptSubmit/PreToolUse/Stop |
| `CLAUDE.md` at root | COMPLETE | Committed, 13503 bytes, bundle copy unmodified |
| `tests/` verification harness | COMPLETE | `replay-hooks.sh` → `passed=14 failed=0`; `test-routing-hook.md` present for the manual cloud pass |
| `docs/HZ-skill-trigger-tuning.md` | COMPLETE | Committed; `CLAUDE.review-rev2.md` removed as the bundle directs |
| `.gitignore` rules | COMPLETE | `git check-ignore`: `.claude/settings.json` not ignored, `.claude/state/foo` ignored |
| `FEATURES.md` app manifest | COMPLETE (uncommitted) | Manifest v2, 2026-09-29: 73 features in 5 groups, read from `src/` at `4a16357` |
| M2 Step 6 — suite run at HEAD | COMPLETE | LF copy of `4a16357`: `npm test` 398/398, handlers 37, drift pass, Release A 90 items, browser 95/95, content 3/3; CI run 35669857016 success |
| M2 Step 6 — data regression | COMPLETE | migrations 15, merge 22, assessment-merge 14, backup-restore 4, assessment-store 14, assessment-model 18 → 87/87 |
| M2 Step 6 — stale status claims corrected | COMPLETE (uncommitted) | `implementation-status.md` rows 16/23/31 and Checks table; `known-risks.md` §1c |
| M2 Step 6 — review summary | COMPLETE (uncommitted) | `implementation-status.md:1005`; M2 row added to Parent acceptance |
| M2 Step 6 — parent iPad handoff checklist | COMPLETE (uncommitted) | `ipad-test-checklist.md:16` preface, Result page at line 481 |
| M2 Step 6 — actual-iPad device results | BLOCKED | Parent only: §5.5c, §4.5 plus the first-tap observation, M1 Parts 1–4, recovery file |
| M2 Step 6 overall | PARTIAL | Claude-side evidence complete; device results outstanding; M2 cannot be accepted until they are recorded |
| Branch up to date with `origin/main` | NOT STARTED | Plan v2 step 6b awaiting approval |
| Rules live for this repo | BLOCKED | Needs PR #23 merged to `main` — cloud sessions branch from `main`, so nothing is governed until then |

## Checks and evidence
- 2026-09-21 `bash tests/replay-hooks.sh` → passed=14 failed=0 (validation-line 3/3, record-guard 3/3, plan-gate 3/3, skill-router 2/2, routing-guard 3/3)
- 2026-09-21 `git check-ignore -v` on `.claude/settings.json` and `.claude/state/foo` → tracked / ignored as intended
- 2026-09-21 `routing_guard_mode` = `observe` (bundle default) — **not** yet `enforce`; `tests/test-routing-hook.md` unrun
- 2026-09-21 record-guard hook fired live on the install turn itself, forcing this record — the Stop hook is working from disk before merge
- 2026-09-29 `opus-worker` self-reported model `claude-opus-5-5` (effort: configured high, not observable)
- 2026-09-29 M2 Step 6 suite: see the deliverable ledger. `bash tests/replay-hooks.sh` → `passed=12 failed=2` on Windows: the harness hands `/tmp` paths to Windows Python, so this is an environment failure, not a hook defect. Not re-run on Linux; the script is deleted upstream by PR #24

## Open questions / blockers
- PR #23 must merge into `main` before any of this governs a session. Verify in a **new** session: first reply should report "rules v2.1 (2026-09-21)".
- Upload `.claude/skills/hz-guarantee-audit/` zipped to claude.ai → Settings → Capabilities → Skills; the repo copy does not reach claude.ai chat.
- Leave `routing_guard_mode: observe` until `tests/test-routing-hook.md` has been walked in a cloud session.
- 2026-09-28: the local `main` was stale. `origin/main` is at `bd53ca6` (PR #24, the `hz-claude-config` stub), which removes these hooks and `tests/replay-hooks.sh`. Merging it into `claude/m2-step6-closeout` will overlap this file at the request ledger and here; resolve by keeping both sides.
- `.claude/hooks/config.json` has line-ending-only changes left behind by the hook replay, and the main session was blocked from restoring it. PR #24 deletes the file, so the merge resolves it.
- On this Windows checkout (`core.autocrlf=true`), `npm run verify` fails `check:drift`, `check:release-a` and one unit test because of CRLF line endings, not code. Structural fix (not done): a `.gitattributes` that pins LF.
