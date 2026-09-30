# Plan v3 — Design update, PR 1 of 3 (tokens, colours, readability, sizes) — Awaiting approval

Planned by: Fable 5.1 (you switched the session to it; the planner hint asked for Fable and it already applied).

## Summary

This is the reply the design package asks for before any code: what I understood of the three pull requests, what looks unclear or risky, and which tests I expect to change. It also holds the working plan for the first pull request only. The second and third get their own plan after you have merged the one before, exactly as the package says.

What the first pull request does: the app gets the new design tokens (named colours, spacings, corner sizes), wrong answers and errors stop using Jenn's red, French text becomes readable, green buttons get dark text, corners are unified, back buttons become big enough for a finger, and the on-screen code name "French_game" becomes 🟩 **Rev 2** "French Time" (capital T, your choice). The look otherwise stays the same. Nothing about behaviour changes, no Chinese text moves, no test is removed or weakened, and no real data is touched.

🟦 **Rev 1** What changed from v1 and why: you answered the five decisions, so they are now folded into the plan as settled (all twelve Jenn-colour places are fixed, the "Jenn" rule is about colour and font colour only; both hard-coded light-indigo values use the token; the code name is renamed in both places; ✗ / ✓ by style rule; screenshots come to you in the chat). The decisions list is gone; one spelling check remains below. Sections touched: Summary, Unclear or risky, Decisions, Technical details.

🟩 **Rev 2** What changed from v2: you chose the spelling "French Time" (capital T) over the package's "French time"; nothing else changed. Sections touched: Summary, point 3, Decisions, Technical details.

🟩 **Rev 2** What I need from you: approve the plan.

```diff
+ 🟦 Rev 1: decisions 1–5 settled per your answers and written into the plan
- 🟦 Rev 1: the open decisions list removed
+ 🟩 Rev 2: label spelling settled as "French Time" (capital T), your choice over the package's "French time"
```

## What I understood

**PR 1 — tokens and colours.** Add the design rules file and both mockups to the repo. Replace the colour block with the token block. Wrong/error/offline stop using Jenn's colour. Indigo text uses the light indigo. Green-button text goes dark. Secondary buttons get full-brightness text. Drill's English word uses the text colour. Corners map to four sizes. Back buttons at least 52 px on touch screens. "French_game" becomes "French time".

**PR 2 — Parent Summary in three tabs.** Progress / Check-in / Settings tabs. Progress keeps all ten stat rows, girls side by side, wide iPad width. Check-in tab holds the intro, one card per girl, and the report / scoring / device-check tools. Settings tab holds the day grid, password, "Show full French times", clear buttons with their explanations, "Reset everything" apart in a marked box, backup and recovery, and the Levels text with a "To fix later" tag. Every handler and password check stays.

**PR 3 — kids' screens.** Hub in the mockup's order with a slim top bar, eight tiles four per row on iPad, one save icon instead of the status bar, topic cards with icon, name and stars only (the raw counts move to the Parent Summary as a collapsed list), star rules in kid words inside "More", the Parent Summary button smaller under the player cards. Games: answer shown once, slim bar, one speaker. Round end: praise first, only the total stars, kid-worded next step, full progress bar. Study / My Words: a proper 52 px tab switch, no space before punctuation. Check-in: slim bar with Pause, tappable choices, "0 of 0 answered" hidden until the part starts, the "plays left" note on its own line.

## Unclear or risky — each with my recommended fix

1. **The plan's list of "wrong = Jenn" places is short.** The package names six. The source has six more that the same rule covers: the wrong pair in Word Match, the wrong-answer toast in Drill, the "Enter parent password first" error, a second parent error message, "Backup not available offline", and the small error line on the scoring screen. 🟦 **Rev 1** Settled: all twelve change, and only their colour and font colour (your answer: the rule is about colour). Four other Jenn-colour uses are not wrong/error/offline (mic listening, blocked weekday chip, time-nearly-up warning, overlay close hover); those stay and are listed in the PR.
2. **The light indigo is already hard-coded twice.** 🟦 **Rev 1** Settled: use the new token there too.
3. **"French_game" appears twice, not once:** the label on the clock and inside the Today summary text. 🟦 **Rev 1** Settled: rename both. 🟩 **Rev 2** Spelling settled: "French Time" (capital T), your choice; the package and mockups write "French time", the app will use yours.
4. **The check-in title:** the only check-in heading in indigo is the big "Check-in" title and the question text on the check-in screen. Changing their colour is safe: the check-in tests compare two sittings of the same build, so a new colour on both sides is fine.
5. **✗ and ✓ marks.** Wrong choice buttons show no mark today. Adding text would touch code and the tests that read button text. 🟦 **Rev 1** Settled: the marks come from a style rule on the right/wrong choice buttons; button text is unchanged. The check-in screen keeps no marks, as required.
6. **Corners below 6 px** (1 × 2 px, 2 × 3 px) are not in the mapping. **Fix:** leave them, list them in the PR. The 12 px cases (28 of them) are decided one by one: tiles/tags → small, buttons/choices/inputs/rows → medium; the PR lists any doubtful ones.
7. **Screenshots.** The repo has no screenshot tool and the tests use 820×1180, not the iPad sizes. **Fix:** a throw-away script in my scratch folder takes before/after shots at 1194×834 and 834×1194 with touch on, network blocked, made-up local data. The script is not committed. 🟦 **Rev 1** Settled: I send you the images in the chat and say so in the PR; you attach them on GitHub if you want them there. The two mockup files you attached from Downloads are byte-identical to the ones in the zip, so the copies going into `docs/mockups/` are the right ones.
8. **Line endings.** On this Windows checkout the full verify fails for line-ending reasons alone (recorded in the working record). **Fix:** the worker runs verify on an LF export, builds the page from it, and also runs the browser tests here on Windows — the same procedure as the last three rounds.
9. **Tests.** For PR 1, none of the nine listed browser tests reads a colour, a corner size, a button label we change, or the "French_game" text. **I expect zero test changes in PR 1.** All 10 browser tests, the unit tests, drift and release checks run anyway. The nine tests will matter in PR 2 and PR 3 (password field id, overlay ids, data-action hooks, pause button text "Close", the "plays left" text).
10. **Back buttons.** The 44 px touch rule today covers back buttons and level tabs on one line. Only back buttons go to 52 px in PR 1; level tabs are PR 3's hub work.
11. **Risks I see for PR 2 and PR 3 (noted now, planned later):** PR 3 moves the topic counts into the Parent Summary and changes sentence display, which touches the app logic file heavily; PR 3's "2 plays left" line and PR 2's password field are asserted by tests and must keep their text/ids; the round-end change must not alter what is stored.

## Decisions

🟦 **Rev 1** All five decisions from v1 are settled by your answers and written into the points above. 🟩 **Rev 2** The spelling is settled too: "French Time". No decision is open.

## Stages to finish

1. **Claude** — Branch from `main` (main session). Level: Routine.
2. **Claude** — PR 1 implementation (opus-worker, Level: Complex): docs, token block, colour and radius and size changes, label rename, page rebuild from an LF export, verify on the LF export, browser tests on Windows, contrast numbers, Chinese-text count before/after, before/after screenshots.
3. **Claude** — Check the worker's evidence, update the working record and feature manifest with the regression table, copy this plan into `plans/`, commit, push, open the PR ready for review, send the screenshots (main session).
4. **You** — Review and merge PR 1.
5. **Claude** — Plan v2 for PR 2 (after the merge).
6. **You** — Approve Plan v2; later review and merge PR 2.
7. **Claude** — Plan v3 for PR 3 (after the merge).
8. **You** — Approve Plan v3; later review and merge PR 3.

## Success criteria (PR 1)

- Unit tests, handler check, drift check and Release A check pass on the LF export; the 10 browser tests pass on Windows Chrome. No test file deleted, skipped or weakened; expected changed tests: none.
- Contrast (measured by a script): indigo text on surface about 9.8:1, text on green about 7.0:1, wrong on surface about 7.7:1.
- No `var(--jenn)` or Jenn red left in the twelve wrong/error/offline places; Jenn's own rows, name and cards unchanged.
- Chinese-character line count per source file identical before and after.
- Before/after screenshots at both iPad sizes show the same layout with the new colours.
- The built page matches the source (drift check), and both are committed together.

## Checked against

- Request ledger rows 11 and 17 (audio first tap): PR 1 does not touch the audio owner or any speak button; the 52 px touch rule for speaker buttons stays. Hotspot "Audio playback": untouched.
- No prior design-token or colour work exists in the record: no history for this area. A new hotspot row "Design update (tokens, colours)" is added at approval with fix round 1, as the plan-gate hook asks.
- Known failure: Windows CRLF verify failure (working record, open questions) — handled by the LF-export procedure.
- Conflicting ledger items: none. FEATURES.md rows touched: the connection/sync status line (colour only), game screen feedback (marks added), Parent area "Reset All" (colour only).

## Removes/consolidates

- Retires the ad-hoc colour block in favour of the token block; the two hard-coded light-indigo values become the token.
- Consolidates 16 distinct corner sizes into 4 tokens (3 sizes under 6 px left as is, listed).
- Skills: `hz-guarantee-audit` applied as the whole-package review above; `hz-chat-handoff` (produces a handoff, does not receive one), `hz-outcome-audit` (no version trajectory to audit) and `hz-web-app-audit` (no internals audit requested) do not fit; `superpowers:brainstorming` skipped because the design is fixed by the package ("do not add features").

## Technical details

Branch: `claude/design-pr1-tokens` from `main` at `d042a58`. Files:
- New: `docs/DESIGN.md`, `docs/mockups/parent-summary-mockup.html`, `docs/mockups/kids-hub-mockup.html` (copied from the package).
- `src/styles.css`: `:root` (lines 1–8) → `tokens.css`; `.choice-btn.wrong` :202, `.wrong-part-highlight` :195, `.parent-fails` :302, `.lock-error` :406, `.conn-status-bar .cs-dot.cs-offline` :32, `.assess-review-msg` :626 → `var(--wrong)` / `rgba(252,165,165,…)`; `color:var(--french)` text at :27, :123, :125, :141, :281, :299, :310, :315, :355, :431, :460 → `var(--french-text)`; `#c7d2fe` at :100, :158 → `var(--french-text)`; `.btn-green` :231 `color:var(--on-green)`; `.btn-secondary` :229 `color:var(--text)`; `.choice-btn.correct::after` "✓" and `.choice-btn.wrong::after` "✗"; 89 `border-radius` values mapped to `--radius-*`; `@media(pointer:coarse)` :367 `.back-btn{min-height:var(--tap-min)}` (`.grade-tab` stays 44px).
- `src/index.html`: :82 label 🟩 **Rev 2** "French Time"; :295 Reset All inline style → `var(--wrong)`; :295 and :335 radius 12px → token.
- `src/app.js`: :1416 🟩 **Rev 2** "French Time"; 🟦 **Rev 1** :1906, :2387, :2777, :3084, :2853 `var(--jenn)` → `var(--wrong)` — colour values only, text and handlers untouched; :2358 drill English word `var(--french)` → `var(--text)`. Lines :2871–2872 (Jenn's backup rows) unchanged.
- Rebuild `index.html` (`npm run build` on the LF export via `git -c core.autocrlf=false archive`), then `npm run verify` there and `npm run test:browser` on Windows with `CHROMIUM_PATH`.
- Contrast script and screenshot script live in the session scratch folder only.
- Chinese count baseline: `src/app.js` 9 lines, `src/index.html` 1 line, `src/content/curriculum-map.js` 216 lines.
- Worker instructions path for the hand-over: `C:\Users\Heng Z\.cache\hz-rules\3.1.21\agents\opus-worker-instructions.md`.
