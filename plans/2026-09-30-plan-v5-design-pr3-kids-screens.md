# Plan v5 — Design update, PR 3 of 3 (kids' screens) — Awaiting approval

Planned by: Fable 5.1 (the session model you selected; the planner hint asked for Fable and it already applies). New plan for PR 3, not a revision of Plan v4 (PR 2, merged as pull request 34), so no revision markers.

## Summary

This is the last and largest of the three pull requests: every screen the girls see follows the design rules. The hub gets the mockup's order with a slim top bar, eight tiles, simple topic cards and a collapsed "More" with the star rules in kid words. Games get the same slim bar, one speaker, and a popup that shows the answer once. The round-end screen leads with praise and the result, without the points formula. My Words gets a proper tab switch, sentences lose the space before punctuation, and the check-in screen gets a slim bar, tappable choices and two small text fixes. Everything the app records stays exactly as it is; no Chinese text moves; no real data is touched.

Two tests change, neither weakened: the one that reads the save status text now taps the new save icon first; the one that checks the out-of-hearts screen keeps working because the praise line still says "Good effort!". Every other test runs unchanged.

What I need from you: read the five decisions, then approve.

## Unclear or risky — each with my recommended fix

1. **One slim top bar for hub and games.** Today the hub has a clock row inside it and the game screen has its own back button and status bar. Fix: one shared slim bar under the big title, shown on the hub and in games, hidden on the start screen and the check-in; the screen switcher becomes the single place that shows or hides the big title, the wall clock and the slim bar (today three places do this by hand). Its Back button goes to the hub from a game and to the start screen from the hub. Label "← Back" on both (decision 5).
2. **Save icon and the save test.** One browser test reads the visible words "working offline … will sync" from the status bar. With the bar gone, the words sit behind the icon: a tap shows the same message. Fix: the test taps the icon first, then makes the same check. Quiet cloud only when saving is confirmed; warning icon in the wrong colour for offline, waiting, and failing states (decision 4).
3. **"More" content.** The package says More holds today's four numbers and the three rules. Today's More also lists each level's accuracy and the "suggested next" line. Decision 1: keep those inside More (they are already hidden until tapped and are not thresholds or formulas) — recommended.
4. **Topic details in the Parent Summary.** "Current level" must be chosen per girl. Decision 3: use each girl's suggested level (the ⭐ one), computed by the code that already exists — recommended. The lines are the same text the hub shows today, produced by the same function; no new calculation.
5. **Round result "9 of 10 right!"** The counts exist in the round-end code (they feed today's stats), so no new tracking is needed. The out-of-hearts screen keeps "Good effort!" as its praise line and adds the package's sentence, so the existing test still matches.
6. **Removing the points tiles.** The package names Base, Speed and Lives; the fourth tile is "Rounds left", which the Play Again button already shows. Decision 2: remove the whole row — recommended.
7. **Popup: answer once, Chinese kept.** Today a wrong answer shows "sept = seven (中文 → parents)" above the green box and "seven (中文见家长页)" inside it. Fix: the green box keeps the French word and one line "seven (中文 → parents · 中文见家长页)"; the upper line is used only for the accent note ("So close — check the accents…"), which the code prepares today but never shows. Right answers are unchanged. Both Chinese strings stay in the code and on screen.
8. **One speaker.** The game-bar 🔊 stays only in Word Match, which has no card speaker; Quick Quiz, Scramble, Sentence Builder, Listen & Speak and Boss Round already have one on the card. The 🎤 stays.
9. **Punctuation.** The check of a built sentence compares the parts one by one and is not touched. Only the displayed and spoken text joins punctuation without a space, through one small helper with unit tests, used by Sentence Builder, Study set 2, the popup and the game-bar speaker.
10. **Check-in screen.** No test reads the big title, and the choice styles compare right-against-wrong sittings, so a "picked" style that depends only on the picked class is safe. The screen must keep no ✓, no colours for right/wrong, and no banned words in class names.
11. **Level tabs.** They get the tap size (52 px) now, as part of the hub work.
12. **Chinese text.** The popup change reuses both Chinese strings; the hint panel, Sentence Builder, Study, My Words and Parent Summary are untouched. The check is by string: every distinct Chinese string in the source appears at least as often after as before.

## Decisions (my recommendation first)

1. Keep the per-level accuracy rows and "Suggested next" inside More — yes.
2. Remove the whole tile row at round end, including "Rounds left" — yes.
3. Topic details in the Parent Summary use each girl's suggested level — yes.
4. Save icon: quiet only when synced; warning for offline, waiting or failing — yes.
5. Back label "← Back" on both the hub and the game slim bar — yes.

## Rewrite-vs-repair (hotspot "Design update" reaches 3 rounds with this plan)

Shared cause: none — the three rounds are the three planned parts of one design package, with no recurrence, no regression and no workaround so far. Incremental repair (this PR on top of PR 1 and PR 2) is the approach the package prescribes; a rewrite of the kids' screens from scratch would discard the tested handlers and the 103 browser tests' selectors for no gain. Recommendation: continue incrementally; consolidate what this PR touches (screen visibility in one place; one save-state writer; one punctuation helper). Reviewed 2026-09-30.

## Stages to finish

1. **Claude** — Branch from `main` (main session). Level: Routine.
2. **Claude** — PR 3 implementation (opus-worker, Level: Complex): hub, slim bar, save icon, tiles, topic cards and Parent Summary topic details, More with rules, start-screen button, popup, game header and speaker, round end, My Words switch, punctuation helper with unit tests, check-in changes, the two test updates, rebuild, verify, browser tests, Chinese string check, screenshots.
3. **Claude** — Check the evidence, update the working record and feature manifest with the regression table, copy this plan into `plans/`, commit, push, open the PR ready for review, send the screenshots (main session).
4. **You** — Review and merge PR 3.

## Success criteria (PR 3)

- Hub order: slim bar → player header (avatar, name, stars, streak, week points, slogan + Translate) → "Pick a level" row (L1–L7, ⭐ on the suggested one, 52 px) → 8 tiles (6 games + My Words + Study), 4 per row on iPad in both orientations, 2 per row at phone width, all visible without scrolling at 1194×834 → Topic stars (icon, name, stars only) → More (collapsed).
- Slim bar on hub and games: Back · "French Adventure" · French Time · time left · save icon; the big title and the big clock only on the start screen. Save icon: quiet cloud when synced; warning in the wrong colour otherwise, tap shows the message. The old status bars are gone from kids' screens.
- More: today's four numbers as tiles; the three rules in the package's exact words; the note "Exact percentages and per-topic counts are in the Parent Summary."; the level rows and suggested-next line (decision 1). The one-line rule strip is gone.
- Parent Summary › Progress: under each girl a collapsed "Topic details (current level)" list with the same Games / Tries / Accuracy / Next lines per topic.
- Start screen: "Parent Summary" button below the player cards, smaller.
- Games: slim bar, game bar (name, hearts, star points) right under it, no status row; game-bar 🔊 only in Word Match; 🎤 kept.
- Wrong-answer popup: the answer once, in the green box, with both Chinese strings; the accent note shows when it applies.
- Round end: praise first, then "N of M right!" or "Out of hearts — this one doesn't count, try again!"; total stars earned only; no formula line, no tiles; if no topic star yet, the kid-words next step instead of "Keep practicing topics!" with empty stars; progress bar full.
- My Words: a 52 px Word List / Drill switch in the Weekly/Daily style. Sentences show and speak "Le crayon est rouge." with no space before punctuation; the answer check is unchanged (unit tests prove the helper; the builder test still passes).
- Check-in: no big title or clock; slim bar with the section name and Pause; choices filled `surface2` with a visible border and a clear picked state, ≥52 px; "0 of 0 answered so far" hidden until the part starts; "2 plays left…" on its own line under Play at ≥0.85rem.
- Everything recorded at round end (stars, rounds, topic stars, day records, round log, moons, saves) is unchanged: the recording code is not edited.
- LF-export verify passes (unit tests including the new helper cases); all browser tests pass on Windows; changed tests: `data-loss` (taps the save icon before the same text check) and any other listed with its reason — none weakened.
- Every distinct Chinese string appears at least as often as before; the hint panel's "(中文 → parents only)" and the popup's two strings are present.
- Screenshots before/after at 1194×834 and 834×1194 (touch): start, hub L1 and L7, each of the 6 games, wrong popup, round end (finished and out of hearts), Study sets 1–3, My Words list and drill, check-in question, check-in report and scoring (with test data), and the save-failed icon.

## Checked against

- Request ledger rows 25–26 and Plans v3–v4: PR 1 and PR 2 merged (pull requests 33 and 34); this plan builds on them. Hotspot "Design update": fix round 3 at approval; rewrite-vs-repair reviewed above, cell set to "yes 2026-09-30".
- Ledger rows 11 and 17 (audio first tap, one audio owner): no speak call site is added; the speaker removal only hides a button; `src/speech/audio-out.js` untouched. The first-tap tests run unchanged; the Listen & Speak tile must stay clickable on the hub (one test really clicks it).
- FEATURES.md rows: hub, game screen, round-complete, connection status line, Study/My Words, assessment screen rules (no feedback, no banned words), Parent Summary Progress tab (PR 2).
- Known failure: Windows CRLF verify — LF-export procedure as before.
- No conflicting ledger items.

## Removes/consolidates

- One screen switcher owns the visibility of the big title, wall clock and slim bar (replaces the by-hand toggles in the player-select and back functions).
- Two connection status bars → one save icon written by the existing status function.
- The rule strip, the formula line and the points tiles are removed from kids' screens.
- Dead CSS for the old topic progress rows is removed with the progress block.
- One punctuation helper replaces four ad-hoc space joins for display and speech.
- Skills: `hz-guarantee-audit` applied as the review above; `hz-outcome-audit` and `hz-web-app-audit` do not fit (a layout plan, not an audit).

## Technical details

Branch: `claude/design-pr3-kids-screens` from `main` at `416b848`. Line numbers as of main.

**Screens and bars (`src/index.html`, `src/app.js`, `src/styles.css`)**
- `showScreen` (app.js:1282) becomes the owner: select → `.game-header` and `#wall-clock-display` shown, `#topbar` hidden; hub/game → header and wall clock hidden, `#topbar` shown; assessment → all three hidden. Remove the wall-clock toggles from `selectPlayer` (1267) and `goBack` (1277); `selectPlayer` no longer sets `#session-clock` display.
- New `#topbar.topbar` inside `.container` after `#wall-clock-display`: `button.back-btn` `onclick="topBarBack()"` "← Back" (new global: `exitGame()` if `#screen-game` is shown, else `goBack()`); `.brand` "French Adventure"; French Time pill (`.sgt-label` "French Time", `#hub-playtime-val`); time-left pill (`#countdown-display`, keeps `.warning`); `#save-icon` (`button`, `data-action="save-status"`). Delete the old `#session-clock` block (index.html:74–93), `#clock-wall` and the game's back button + `#conn-status-game` (188–193); make the `#clock-wall` write in `startSessionClock` (755–798) null-safe or remove it.
- `updateConnectionStatusUI` (304–345): keep the text logic; write `#save-icon` instead of the two bars: class `ok` + "☁️" when the save text is "Synced to cloud" or "Ready"; else class `bad` + "⚠️"; store the message in `data-msg` and `aria-label`. `case 'save-status'` in the document click switch → show the message in the existing toast (`showToast`) and in a small `#save-msg` line under the bar that stays until the next state change (so `innerText` contains it after a tap). Remove `.conn-status-bar`/`.cs-*` CSS.
- Game screen: `.game-topbar` (194–202) sits right under the slim bar; `startGame` (1713) shows `#btn-tts` only when `type==='match'`.

**Hub (`src/index.html` 94–184, app.js)**
- Remove `#hub-rules-mini` (107) and `.hub-rules-mini` CSS. Player header keeps `#hub-avatar`, `#hub-name`, `#hub-stars`, `#hub-streak`, `#hub-week`, `#hub-moons`, slogan + `#hub-slogan-translate-btn`.
- "Pick a level" row: `#hub-grade-bar-note` text → "Pick a level · ⭐ = suggested next"; `.grade-tabs` keeps `#tab-g4…#tab-g10` (`setGrade`), min-height `--tap-min`; the My Words and Study buttons move out of this row into the tiles grid as two more `.mini-game-btn` tiles (`onclick="showMyWords()"` / `"showStudy()"`, classes `.tile-words` / `.tile-study`, sub-lines "Practise" / "Sets 1–3" static — no new counts).
- `.mini-games-grid`: `grid-template-columns:repeat(4,1fr)` at ≥768px, `repeat(2,1fr)` below; tile min-height so 8 tiles fit above the fold at 1194×834 (verify with a screenshot).
- Topic stars: `updateStarMap` (1472) renders `.sm-topic` with icon, name and ⭐/☆ only — drop the `topicStarProgressHTML` call; keep `topicStarProgressParts` (560) and `topicStarProgressHTML` (611) for the Parent Summary; delete the dead `.sm-star-progress-row*` CSS (185–187).
- More: `#hub-today-panel` becomes the collapsed section: `#hub-daily-summary-btn` (kept id, text "More: today & how stars work", `aria-expanded`) toggles `#hub-daily-summary-block`, which now holds: the four today tiles (`#hub-day-stars-val`, `#hub-rounds-today-val`, `#hub-acc-today-val`, `#hub-drill-val`, moved inside), the three rules (exact package text), the note, then the existing `renderHubDailySummaryInner` content (decision 1). Collapsed by default (as today).
- Start screen: the "📋 Parent Summary" button (50–52) moves below `.player-cards`, class `btn-secondary`, smaller.

**Parent Summary topic details (app.js `renderParentSummary` ~2616, PR 2 layout)**
- Under each girl's card (both weekly and daily views): `<details class="parent-topic-details">` "Topic details (current level)" listing, for each topic of `recommendLevel(state).gradeKey` for that girl, one line "icon name — Games x/3 · Tries x/6 · Accuracy … · Next: …" from `topicStarProgressParts` (decision 3). Chinese: none in these lines.

**Popup (`showFeedback` 2086–2126)**
- Wrong with `word`: `#fb-msg` = `extra || ''`; green box sub = `${word.en} (中文 → parents · 中文见家长页)`. Wrong without `word` (builder): unchanged apart from the joined display word. Right: unchanged.

**Round end (`endRound` 2160–2276; no change to what is stored)**
- Replace `.rc-title` / `.rc-score` / `.rc-stat` row (2258–2265): praise (the existing tier titles, "Good effort!" when not completed) → result line (`"${correct} of ${total} right!"` from the round's correct/total counts already used for `todayStats`, or the package's out-of-hearts sentence, kept alongside the existing `.rc-outcome` text or replacing it — keep "Good effort!" so `regression.test.js:306` still matches) → `+${roundScore} star pts` only. If `maxTopicTier===0 && completed`: no ☆☆☆ row; show the topic's "Next: …" text from `topicStarProgressParts` for the round's topic ("Play 2 more game types…"), in place of "Keep practicing topics!". Set `#progress-bar` width to 100% at round end. Moon banners, trophies, Play Again / Done today / Hub buttons unchanged.

**Study / My Words / punctuation**
- `.mywords-tab` (index.html 226–237): restyle as the `.summary-mode-*` segmented switch, `--tap-min`; handlers unchanged.
- `src/util/fr-text.js`: new exported `joinFrenchParts(parts)` (no space before `.,!?;:…` and after an apostrophe if that case exists in the curriculum — check `joinScrambleTiles` at 133 and reuse its rule); unit cases in `tests/fr-text.test.js`. Use it at app.js 2035 (speak text), 2067 (`speakFrench`), 2075 (popup display), 1629 (`speakCurrent`), 2439/2442 (Study set 2), 2357 (drill blank) — display and speech only; `checkBuilder` (2059) untouched.

**Check-in (`src/modes/assessment-ui.js`, `src/styles.css` 491–573)**
- `render()` 161–163: sub line = `Form ${run.form}` until the section's status is not NOT_STARTED, then the full "N of M answered so far".
- CSS: replace `var(--card)` (undefined) with `var(--surface)` on `.assess-card`; `.assess-choice` background `var(--surface2)`, border `2px solid var(--surface)`… visible on dark; `.assess-choice.chosen` border `var(--french)` + `rgba(79,70,229,.2)`; min-height `--tap-min`; `.assess-audio .assess-note{flex:0 0 100%;font-size:.85rem}`; `.assess-bar` becomes the slim bar (section name from `#assess-title`, Pause on the right, min-height `--tap-min`). No new class names containing the banned tokens.

**Tests**
- `tests/browser/data-loss.test.js:137–139`: click `#save-icon` (DOM click via evaluate) before reading `innerText`; same regex, same assertion.
- `tests/fr-text.test.js`: new cases for `joinFrenchParts`.
- All others unchanged; if another fails, fix the app, or stop and report a blocker.

**Build, checks, evidence**
- LF export + `npm run build` (GIT_DIR set), copy `index.html` back LF; `npm run verify` in the LF copy; Windows `npm run test:browser` with `CHROMIUM_PATH`; Windows `npm test` (known CRLF hash only); drift check.
- Chinese: extract every distinct Chinese string from `src/` before and after; each must appear at least as often after; report counts.
- Screenshots: scratch script (`shots-pr3.mjs`), before = `git show main:index.html`, after = new build; the list in the success criteria; for the save-failed icon set the pending state via the stubbed `fbInit` (as `data-loss.test.js` does); for the check-in report and scoring, complete a check-in with test data the way `assessment-report.test.js` / `assessment-review.test.js` do.
- Worker instructions path: `C:\Users\Heng Z\.cache\hz-rules\3.1.21\agents\opus-worker-instructions.md`.
