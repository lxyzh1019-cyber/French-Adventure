# Plan v4 — Design update, PR 2 of 3 (Parent Summary in three tabs) — Awaiting approval

Planned by: Fable 5.1 (the session model you selected). New plan for PR 2, not a revision of Plan v3 (PR 1, merged as pull request 33), so no revision markers.

## Summary

The Parent Summary gets three tabs, as in the mockup: Progress (opens first), Check-in, and Settings. Everything the panel does today stays: the same buttons, the same password checks, the same ten stat rows per girl, the same practice words with their Chinese. Only where things sit changes, plus the wide iPad width in both orientations and 52 px buttons.

Two things need small code changes, not just layout: the panels that open from the Check-in tab (report, scoring, device check) will switch to that tab when they open, so the browser tests that click them from a script keep passing; and the messages "wrong password" and "enter parent password first" move to one strip under the tabs so a parent sees them whichever tab they are on. One test gets stronger, none weaker: the test that scans the Parent Summary for old "Grade" wording will visit all three tabs.

What I need from you: read the three decisions, then approve.

## Unclear or risky — each with my recommended fix

1. **The password box lives in Settings, but the Check-in and Backup buttons need it.** Today one box serves everything, and the refusal message appears next to it. Fix: keep the one box in Settings (as the package says); show the refusal and result messages in a strip under the tab bar that is visible from every tab; add one line under the Check-in cards, "Needs the parent password from the Settings tab." No change to the checks themselves.
2. **Hidden tabs and the tests.** Two browser tests click a button inside the report/scoring/device-check panels from a script while the panel would be on a hidden tab, and Playwright refuses to click hidden things. Fix in the app, not the tests: opening the report, the scoring screen or the device check switches to the Check-in tab. Also, the old-wording scan in one test only reads visible text, so it would silently cover less; fix: that test visits each tab before scanning (stronger, listed in the PR).
3. **"Locked until the password is typed."** The package says this for "Show full French times" only; the mockup greys out the clear buttons too. Greying out the clear buttons would break a test that sets the password from a script and presses Clear. Decision 1: lock only "Show full French times", as the package wording says.
4. **One card per girl with her status.** Today the status is one shared text block ("jenn · form A · in progress · 12/45 answered", one line per run). Fix: the same lines, written per girl into her own card; a girl with no run shows "Not started yet." Wording of each run line unchanged.
5. **The cap note on its own line.** "0:00 (cap 30m/day)" is one string built in code. Fix: the "(cap 30m/day)" and "(capped 30m)" parts are wrapped so they sit on a second line inside the value cell; the words do not change.
6. **Side by side in both orientations.** Today the two girl columns are side by side at every width; the package wants stacking only below 420 px. Fix: one media rule at 420 px. The wide panel width today applies only in landscape; it will apply from 768 px up in both orientations.
7. **Levels section.** Its text is written by code; it stays, and a "To fix later" tag goes next to the heading. No controls added.
8. **Chinese text.** The practice-word rows carry the Chinese (`parent-zh`); they are rendered by the unchanged code. The Check-in intro and the clear-button explanations are English only. Counts are checked before and after, as in PR 1.
9. **Explanations under each clear button.** The three-line note ("Today: … / Old Days: … / Reset All: …") is split so each line sits under its button, same words. Decision 2: keep the button labels as today ("🗑 Today", "🗂 Old Days", "🔄 Reset All") or take the mockup's ("Clear today", "Clear old days", "Reset everything"). Recommendation: the mockup's, since the package names them that way and no test reads these labels.
10. **Tab buttons.** Built with `data-action` like the other parent-panel buttons, so the existing click handling and the handler-count check stay as they are.

## Decisions (my recommendation first)

1. Lock only "Show full French times" until 4 digits are typed — recommended: yes (package wording; keeps the tests passing).
2. Clear-button labels: mockup wording ("Clear today", "Clear old days", "Reset everything") — recommended: yes.
3. Add one phone-width (390 px) screenshot on top of the two iPad sizes, to show the stacked columns — recommended: yes.

## Stages to finish

1. **Claude** — Branch from `main` (main session). Level: Routine.
2. **Claude** — PR 2 implementation (opus-worker, Level: Complex): markup into three tabs, tab handling, message strip, per-girl check-in cards, tab switch on panel open, password lock for one button, styles, the one test strengthened, page rebuild from an LF export, verify on the LF export, browser tests on Windows, Chinese count, before/after screenshots of all three tabs.
3. **Claude** — Check the evidence, update the working record and feature manifest with the regression table, copy this plan into `plans/`, commit, push, open the PR ready for review, send the screenshots (main session).
4. **You** — Review and merge PR 2.
5. **Claude** — Plan v5 for PR 3 (after the merge).
6. **You** — Approve Plan v5; later review and merge PR 3.

## Success criteria (PR 2)

- Opening the Parent Summary shows Progress; the three tabs switch panels; closing and reopening returns to Progress.
- Progress: Weekly/Daily switch and ‹ period › on one row; Jenn and Jess side by side at 1194×834 and 834×1194, stacked at 390 px; all ten stat rows in the same order and words as today; no value wraps mid-word; practice targets with Chinese unchanged.
- Check-in: intro, one card per girl with status and "Start / resume", then the report, scoring and device-check buttons with their panels; opening any of the three lands on this tab.
- Settings, in order: day buttons (52 px) · password box then "Show full French times" (disabled until 4 digits) · Clear today and Clear old days with their explanation under each · Reset everything alone in a marked box in the wrong colour · Backup & recovery (export, import, daily cloud backups, freeze) · Levels text with a "To fix later" tag.
- Panel width `page-max-wide` from 768 px up in both orientations; every button at least 52 px on touch; no Jenn/Jess colours on buttons.
- Every handler, `data-action` hook, password check and panel behaviour works as before; the handler count stays 37 plus any new tab handler the check reports.
- LF-export verify passes; all browser tests pass on Windows; changed tests: one (the old-wording scan visits all tabs) — listed in the PR with the reason.
- Chinese line counts per file unchanged; "中文" strings unchanged.
- Screenshots before/after: Progress, Check-in and Settings tabs at both iPad sizes, plus Progress at 390 px.

## Checked against

- Request ledger row 25 (design handoff) and Plan v3: PR 1 merged (pull request 33); this plan builds on it. Hotspot "Design update": fix round 2 recorded at approval (a new round in the same area, no recurrence, no regression, no workaround).
- Ledger rows 11 and 17 (audio first tap): the check-in "Play" and the scoring "rev-play" paths are not touched; only the tab they sit on switches when their panel opens. The first-tap tests run unchanged.
- FEATURES.md "Parent area" and "Assessment" rows: entry to the check-in stays behind the parent password from the Parent Summary only; the report, scoring and device-check screens keep their ids and actions.
- Known failure: Windows CRLF verify — LF-export procedure as in PR 1.
- No conflicting ledger items.

## Removes/consolidates

- Removes the single long "Parent Controls" section in favour of three panels; the one explanation block becomes three short ones under their buttons.
- Consolidates the two message lines (`pwd-msg`, `recovery-msg`) into one visible strip under the tabs (both ids kept, so no handler changes).
- The overlay's hard-coded 1100 px width becomes the `page-max-wide` token.
- Skills: `hz-guarantee-audit` applied as the review above; `hz-web-app-audit` does not fit (a layout plan, not an internals audit).

## Technical details

Branch: `claude/design-pr2-parent-tabs` from `main` at `09c5c23`.

- `src/index.html` `#parent-overlay` (lines 277–353): after the title, a tab bar `.parent-tabs` with three `button.parent-tab[data-action="parent-tab"][data-tab="progress|checkin|settings"]`; a message strip holding `#pwd-msg` and `#recovery-msg`; three `section.parent-panel[data-panel]` (Progress `.on` by default). Progress: `.parent-progress-bar` containing `#summary-mode-row` and `#summary-nav`; then `#parent-stats-grid`. Check-in: intro text (as today); `.parent-checkin-who` with two cards, each with the girl's name, `#assess-parent-status-jenn` / `-jess`, and the existing `data-action="assess-open"` button; the password hint line; "After a check-in" section with the three existing buttons and their panels (`#assess-report-panel`, `#assess-review-panel`, `#assess-device-check-panel`). Settings: weekday section (`#weekday-grid`, hint); password section (`#parent-pwd`, state text, `#btn-reveal-time` = the "Show full French times" button, its note); clear section (two `.clear-item` with button + explanation, `.dangerzone` with Reset everything); backup section (export, import, daily cloud backups, freeze; `#backup-restore-panel`, `#recovery-import-file`); Levels (`#parent-grade-reopen-controls` + "To fix later" tag). All existing `onclick` strings and ids kept.
- `src/app.js`: new `showParentTab(name)` (toggle `.on` on tabs and panels); `case 'parent-tab'` in the document click switch (~1588); `showParentSummary` (2557) calls `showParentTab('progress')` and syncs the reveal button's disabled state; an `input` listener on `#parent-pwd` sets `#btn-reveal-time.disabled = value.length !== 4`; `assess-report`, `assess-review`, `assess-device-check` cases call `showParentTab('checkin')` before opening their panel; lines 2644 and 2719 wrap the cap note as `<small class="parent-stat-sub">…</small>`. `revealFullPlayTime` (2773) unchanged.
- `src/modes/assessment-ui.js` `renderAssessmentParentPanel` (730): write per-player rows into `assess-parent-status-<player>` (same line text; "Not started yet." when none); the shared `assess-parent-panel` element goes away.
- `src/styles.css`: `.parent-tabs/.parent-tab/.on`, `.parent-panel{display:none}.parent-panel.on{display:block}`, `.parent-progress-bar` (flex, wrap), `.summary-nav-btn` and mode buttons at `--tap-min`, `.parent-side-by-side` 1fr 1fr with `@media(max-width:420px){1fr}`, `.parent-stat-val{white-space:nowrap}` + `.parent-stat-sub{display:block;font-size:.72rem;color:var(--text-muted)}`, `#parent-overlay .overlay-card{max-width:var(--page-max-wide)}` inside `@media(min-width:768px)`, `.parent-section/.parent-section-title/.parent-hint`, `.parent-btn` (52 px, left-aligned, `surface2`), `.parent-checkin-who` two columns, `.weekday-chip` 52×52, `.clear-grid/.clear-item`, `.dangerzone` (dashed `--wrong` border), `.todo-tag`; spacing from `--space-*`. Existing `.summary-mode-*`, `.parent-pwd-*`, `.btn-clear-*` rules updated in place, not duplicated.
- `tests/browser/m1-repair.test.js` (~358): after `showParentSummary()`, run the grade-label scan once per tab (call `showParentTab` for each) — the only test change.
- Handler check: `scripts/check-handlers.mjs` counts inline `on*=` names; the tab buttons use `data-action`, so the count stays 37 unless a new inline handler is added (none planned).
- Build/verify: LF export (`git -c core.autocrlf=false archive` + overlay), `npm run build` with `GIT_DIR` set so the banner shows the sha, `npm run verify` there; Windows `npm run test:browser` with `CHROMIUM_PATH`; `index.html` copied back LF.
- Screenshots: scratch script as in PR 1 (`shots.mjs`), before = `git show main:index.html`, after = new build; Parent Summary Progress/Check-in/Settings at 1194×834 and 834×1194, plus Progress at 390×844; network blocked, stubs, no real data.
- Chinese baseline (main after PR 1): `src/app.js` 9 lines, `src/index.html` 1, `src/content/curriculum-map.js` 216, total 226.
- Worker instructions path: `C:\Users\Heng Z\.cache\hz-rules\3.1.21\agents\opus-worker-instructions.md`.
