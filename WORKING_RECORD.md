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

## Hotspot counter
| Area / feature | Fix rounds | Recurrences | Last symptom | Rewrite-vs-repair reviewed? |
|---|---|---|---|---|
| Rules bundle install | 0 | 0 | — | no |
Rule: 3 fix rounds, or 2 recurrences, or a fix causing a nearby regression → no further patch until the comparison is presented.

## Deliverable ledger
| Deliverable | State | Evidence |
|---|---|---|
| `.claude/` governance tree at root | COMPLETE | 13 files committed in `30c3c59`; `settings.json` = model `fable`, `defaultMode: plan`, 6 ask + 8 deny, hooks on UserPromptSubmit/PreToolUse/Stop |
| `CLAUDE.md` at root | COMPLETE | Committed, 13503 bytes, bundle copy unmodified |
| `tests/` verification harness | COMPLETE | `replay-hooks.sh` → `passed=14 failed=0`; `test-routing-hook.md` present for the manual cloud pass |
| `docs/HZ-skill-trigger-tuning.md` | COMPLETE | Committed; `CLAUDE.review-rev2.md` removed as the bundle directs |
| `.gitignore` rules | COMPLETE | `git check-ignore`: `.claude/settings.json` not ignored, `.claude/state/foo` ignored |
| `FEATURES.md` app manifest | PARTIAL | Governance section written; app feature groups still template placeholders |
| Rules live for this repo | BLOCKED | Needs PR #23 merged to `main` — cloud sessions branch from `main`, so nothing is governed until then |

## Checks and evidence
- 2026-09-21 `bash tests/replay-hooks.sh` → passed=14 failed=0 (validation-line 3/3, record-guard 3/3, plan-gate 3/3, skill-router 2/2, routing-guard 3/3)
- 2026-09-21 `git check-ignore -v` on `.claude/settings.json` and `.claude/state/foo` → tracked / ignored as intended
- 2026-09-21 `routing_guard_mode` = `observe` (bundle default) — **not** yet `enforce`; `tests/test-routing-hook.md` unrun
- 2026-09-21 record-guard hook fired live on the install turn itself, forcing this record — the Stop hook is working from disk before merge

## Open questions / blockers
- PR #23 must merge into `main` before any of this governs a session. Verify in a **new** session: first reply should report "rules v2.1 (2026-09-21)".
- Upload `.claude/skills/hz-guarantee-audit/` zipped to claude.ai → Settings → Capabilities → Skills; the repo copy does not reach claude.ai chat.
- Leave `routing_guard_mode: observe` until `tests/test-routing-hook.md` has been walked in a cloud session.
