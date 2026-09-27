# FEATURES — French Adventure — manifest v1 — confirmed 2026-09-21

Locked features of the current version. Every edit is checked against this list and ends with a regression table. Update this file in the same change that alters a feature. Over-list rather than under-list.

## Governance / working rules (installed 2026-09-21, rules v2; stub install 2026-09-27)
- Working rules come from `hz-claude-config`: root `CLAUDE.md` is the pointer stub, and `.claude/hz-loader.py` fetches the rules and hook scripts at run time. No rule or hook copies live in this repo.
- Main session model is `fable`; the `opus-worker` agent runs Opus.
- Permission default mode is `plan` — no edits before plan approval.
- `git commit`, `git push`, `git merge`, `gh pr merge`, `firebase deploy`, `npm run deploy` prompt before running.
- Destructive git is denied outright: `reset --hard`, `checkout --`, `restore`, `clean`, `branch -D`, `push --force`, `push -f`, `stash drop`.
- Every session starts through the SessionStart hook (injects the central rules).
- Every prompt passes through `plan-gate.py` (plan tier injection) and `skill-router.py` (keyword → skill invocation).
- Every source edit passes through `routing-guard.py`.
- Every turn ends through `record-guard.py` (record + regression table) and `validation-line.py` (Confidence/Status line present).
- `.claude/` is tracked in git; `.claude/state/` is local-only.

## Build / deploy (pre-existing — carried over untouched)
- `index.html` at the repo root is generated. Edits belong in `src/`; both are committed together.
- GitHub Pages serves the committed root `index.html`.
- `npm run build` regenerates `index.html` from `src/`; `npm run verify` runs tests plus the "index.html matches src/" drift check.

## App features — NOT YET MANIFESTED
- The French Adventure app's own features (screens, vocabulary, assessment/scoring, Firebase sync, backup/restore, speech capture, levels, migrations) are **not** listed here yet. The `tests/` suite is the only current guard on them.
- Until this section is filled from a read of `src/`, a regression table for an app change cannot be trusted. Fill it before the next app edit.

## Regression table format (paste at the end of every edit)
| Feature | v<old> → v<new> | Note |
|---|---|---|
| <feature> | kept / added / intentionally removed / missing | <why, if not kept> |
