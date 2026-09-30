# Plan v6 — Design update, PR 4 (Patch 1: fonts offline, text sizes, touch and motion rules) — Awaiting approval

Planned by: Fable 5.1 (the session model you selected). New plan for the Patch 1 package (nine items N1–N9), not a revision of Plan v5 (PR 3, open as pull request 35).

## Summary

The patch asked me to say where I am, how the fonts will work inside the single-file page, and which tests I expect to change, then wait for your OK. Here it is, as a plan.

Where I am: PR 1 and PR 2 are merged; PR 3 (the kids' screens) is built, checked and open for your review. The patch said "fold into PR 1 or do it right after PR 1" — that moment has passed, so it becomes PR 4, built from main after you merge PR 3. It replaces the design rules file with the patch's version and adds the new smallest-text token.

Fonts inside the single page: the two font families are downloaded once as font files, placed in the source folder with their licence files, and declared in the stylesheet. The page builder already inlines every file the stylesheet references, so the fonts end up embedded in the one page and work offline. The page grows by roughly a quarter to a third; the drift check stays valid because the built page is committed with the source.

Tests I expect to change: none. No test checks fonts, text sizes, hover, motion, touch behaviour or the fonts link. The check-in look-alike tests compare two sittings of the same build, so a global button border shows on both sides.

What I need from you: read the three decisions, then approve.

## Unclear or risky — each with my recommended fix

1. **When to build it.** PR 4 touches the same stylesheet and start screen as PR 3. Fix: branch from main after PR 3 merges (decision 1). Approving now lets the worker start the moment you say "merged".
2. **French characters in the fonts.** Google serves fonts in pieces; é and ç are in the basic piece, but œ is in the "extended Latin" piece. Fix: download both pieces for every weight and declare them with the same character ranges Google uses, so every French letter renders in the real font. Check: an offline screenshot of a word with œ and é. The worker needs the network once, only to fetch the font files from Google's font host; nothing else goes online.
3. **More small text than the patch counted.** The patch lists about 44 places; the source has 58 (43 stylesheet rules, 1 inline in the page, 14 inline in the app code), because it counts 0.7rem too. Fix: raise all 58 to the new minimum (decision 3). Uppercase labels keep their letter-spacing; boxes widen or wrap.
4. **Start screen order.** PR 3 already moved the Parent Summary button below the cards. Patch item N6 also wants the cards before the champion board and a slim title row with a smaller clock. Fix: reorder as the patch says; keep the champion board content and the wall clock (smaller). The cards must be fully visible at 1194×834: today's estimate puts their bottom around 760–780 px, so the smaller title and clock are what make room.
5. **Hover rules.** All 13 hover rules go inside a hover-capable media rule; where hover was the only pressed feedback, a matching active rule is added so a tap still responds.
6. **Reduced motion.** The five animations (leader glow, avatar float, pulse, confetti fall, recording pulse) stop under the reduced-motion setting through one stylesheet rule; confetti is drawn by script with CSS animation, so the script also skips it when the setting is on.
7. **Touch-action.** Today a global rule already covers buttons and inputs plus nine per-element rules. Fix: one rule for the patch's list; the per-element ones are removed only where they become redundant.
8. **Countdown warning colour** (N7) closes the "remaining risk" PR 3 left open.
9. **Play Again label** (N8): "Play again · N left today". No test reads it.
10. **Chinese text:** untouched by every item; counted before and after as in the earlier PRs.

## Decisions (my recommendation first)

1. Build PR 4 from main after PR 3 merges (not stacked on the open PR 3 branch) — yes.
2. Fonts: download the basic and extended-Latin pieces of both families from Google's font host, woff2, with licence files — yes.
3. Raise all 58 small-text places to the minimum, not only the ones the patch lists — yes.

## Stages to finish

1. **You** — Merge PR 3 (pull request 35).
2. **Claude** — Branch from `main` (main session). Level: Routine.
3. **Claude** — PR 4 implementation (opus-worker, Level: Complex): design rules file and token, fonts, text sizes, touch-action, hover, primary-button border, start-screen order, countdown colour, button label, reduced motion, rebuild, verify, browser tests, greps, offline-font screenshots, start-screen screenshot.
4. **Claude** — Check the evidence, update the working record and feature manifest with the regression table, copy this plan into `plans/`, commit, push, open the PR ready for review, send the screenshots (main session).
5. **You** — Review and merge PR 4.

## Success criteria (PR 4)

- `docs/DESIGN.md` is byte-identical to the patch's file; `:root` gains `--text-min: 0.75rem`.
- Network blocked: the hub and a game screen render in the real fonts (screenshot), including é and œ; grep finds no `fonts.googleapis`, no `cursive`, no `font-size` below 0.75rem in `src/`.
- Every family stack ends in `system-ui, sans-serif`.
- `index.html` size before → after noted in the PR; drift check passes.
- One `touch-action: manipulation` rule for the patch's list; hover rules only inside `@media (hover: hover)`, with an `:active` twin where hover was the only feedback.
- `.btn-primary` has a thin `--french-text` border; no primary button sits inside a Jess-tinted area.
- Start screen order: slim title row (app name, small clock/date on the right) → player cards → Weekly Champion Board → Parent Summary button (small, last); both cards fully visible at 1194×834 (screenshot with the measured card bottom).
- `.countdown-display.warning` uses `--wrong`; pulse kept.
- Round end button reads "Play again · N left today"; Listen & Speak "🔊 Play Again" unchanged.
- Under `prefers-reduced-motion: reduce` no animation runs and confetti is skipped (screenshot or a scripted check with the media feature emulated).
- LF-export verify passes; all browser tests pass on Windows; changed tests: none expected (any change listed with its reason, none weakened).
- Chinese line counts per file unchanged.

## Checked against

- Request ledger rows 25–27 and Plans v3–v5: PR 1 and PR 2 merged, PR 3 open (#35). Hotspot "Design update": fix round 4 at approval; the rewrite-vs-repair comparison was presented in Plan v5 ("yes 2026-09-30") and still holds: no recurrence, no regression, no workaround; this is the package's own add-on.
- Ledger rows 11 and 17 (audio first tap): no speak path touched; `src/speech/audio-out.js` untouched.
- FEATURES.md rows: design tokens (token added), start screen (order), game screen (button label, countdown colour), motion.
- Known failure: Windows CRLF verify — LF-export procedure as before.
- No conflicting ledger items. The patch's "PR 1b before PR 2" placement is superseded by decision 1 (stated here, not silently).

## Removes/consolidates

- The Google Fonts link and every `cursive` fallback are removed; fonts come from the page itself.
- Per-element `touch-action` rules fold into one rule where redundant.
- 58 sub-minimum text sizes become one token.
- Skills: `hz-guarantee-audit` applied as the review above; `hz-outcome-audit` and `hz-web-app-audit` do not fit (an add-on plan, not an audit).

## Technical details

Branch: `claude/design-pr4-patch-1` from `main` after PR #35 merges. Patch files: `scratchpad\patch1\patch-1\{DESIGN.md, tokens.css, PATCH-1.md}` (DESIGN.md differs from the repo copy from line 3; tokens.css adds `--text-min: 0.75rem`).

- **N1 fonts:** `src/fonts/` with `FredokaOne-400-latin.woff2`, `FredokaOne-400-latin-ext.woff2`, `Nunito-{400,600,700,800}-{latin,latin-ext}.woff2` fetched from the Google Fonts CSS endpoint with a woff2-capable user agent (`https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800`) — the returned CSS gives the `fonts.gstatic.com` URLs and the `unicode-range` per subset; copy those ranges into `@font-face` rules at the top of `src/styles.css` with `font-display: swap` and `url('./fonts/…woff2') format('woff2')`. Add `src/fonts/OFL-FredokaOne.txt` and `src/fonts/OFL-Nunito.txt` (SIL OFL 1.1 from each family's repository). Remove `src/index.html:7` (the `<link>`); no preconnect exists. Replace every `'Fredoka One',cursive` / `'Fredoka One', cursive` → `'Fredoka One',system-ui,sans-serif` (44 in styles.css, 1 in index.html:21, 4 in app.js) and `'Nunito',sans-serif` → `'Nunito',system-ui,sans-serif`. `vite.config.js` unchanged: `assetsInlineLimit: 100_000_000` plus vite-plugin-singlefile 2.3.3, which forces `assetsInlineLimit = () => true`, inlines `url()` assets as base64 data URIs and the CSS into `index.html` (fonts must live under `src/`, not `public/`). Note the built size (528,810 bytes today) in the PR.
- **N2:** `:root` += `--text-min: 0.75rem`. Raise the 58 sites: styles.css lines 53, 78, 82, 83, 99, 119, 125, 173, 176, 185, 186, 204, 210, 268, 316, 318, 323, 439, 462, 502, 519, 583, 586, 590–592, 597–600, 605, 608, 615, 616, 618, 634, 646, 649, 658, 659, 663, 673, 677, 678, 682, 688, 689, 697; index.html:197; app.js 1393, 1398, 2416, 2676, 2817, 2929, 2931, 2939, 2942, 2943, 2944, 2949, 2951 → `var(--text-min)` (inline styles may use `.75rem`). Keep letter-spacing on uppercase labels; check `.sgt-label`, `.round-badge`, `.lb-stat-lbl` still fit (widen or wrap).
- **N3:** one rule `button,[role="button"],.choice-btn,.letter-tile,.answer-slot,.word-chip,.grade-tab,.player-card,.mini-game-btn,.weekday-chip{touch-action:manipulation;}` replacing styles.css:477 `button,input{…}` (keep `input`); remove the now-redundant per-element declarations at 368, 373, 398, 407, 413, 443, 458 (buttons); keep 429, 473 (inputs) and 522 unless redundant; app.js:2944 inline may stay.
- **N4:** wrap the `:hover` rules at styles.css 89, 90, 120, 182, 193, 218, 228, 236, 248, 250, 253, 362, 414 in `@media (hover: hover) { … }`; add `:active` twins for those without one (all but 259/369/374 already have `:active`).
- **N5:** styles.css:247 `.btn-primary{border:2px solid var(--french-text)}` (adjust padding by 2px so height is unchanged); verified no `.btn-primary` inside `.player-card.jess`, `.hub-header.jess`, `.lb-row.jess-row` or the Jess check-in card.
- **N6:** `src/index.html`: `.game-header` (14–17) + `#wall-clock-display` (20–23) become one slim title row shown on select only (`showScreen` already owns this): app name in the display face (smaller than 3.5rem), clock + date right-aligned and small; inside `#screen-select` (42): `.player-cards` (65–79) first, then `.leaderboard` (43–64), then the Parent Summary button (81–83). Measure both cards' bottom ≤ 834 at 1194×834 with touch.
- **N7:** styles.css:466 `.countdown-display.warning` → `color:var(--wrong);border-color:rgba(252,165,165,.5);background:rgba(252,165,165,.1)`; keep `animation:pulse`.
- **N8:** app.js:2320 `Play Again (${roundsLeft})` → `Play again · ${roundsLeft} left today`; app.js:2532 unchanged.
- **N9:** end of styles.css: the patch's `@media (prefers-reduced-motion: reduce)` block; app.js `confetti()` (749–757) returns early when `matchMedia('(prefers-reduced-motion: reduce)').matches`. Keyframes affected: `leaderGlow`, `float`, `pulse`, `confettiFall`, `assess-pulse`.
- **Build, checks, evidence:** LF export + `npm run build` (GIT_DIR set), copy `index.html` back LF; `npm run verify` in the LF copy; Windows `npm run test:browser` with `CHROMIUM_PATH`; Windows `npm test` (known CRLF hash only); drift check. Greps: `fonts.googleapis`, `cursive`, `font-size:\s*\.?0?\.[0-6]\d*rem|\.7[0-4]rem` in `src/`. Screenshots (scratch script; network blocked, stubs): hub and quiz at 1194×834 with the real fonts (include a card with œ/é, e.g. Study set with "sœur" or "cœur" if present, else any é word), start screen at 1194×834 with the measured card bottom, one shot with `emulateMedia({reducedMotion:'reduce'})` during a round end (no confetti pieces in the DOM).
- Chinese baseline (main after PR 3): `src/app.js` 9 lines, `src/index.html` 1, `src/content/curriculum-map.js` 216.
- Worker instructions path: `C:\Users\Heng Z\.cache\hz-rules\3.1.21\agents\opus-worker-instructions.md`.
