# FEATURES — French Adventure — manifest v4 — 2026-09-29

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

## App features (read from `src/`, `src/index.html` and `docs/data-schema-v0.md` at `4a16357`, 2026-09-29)

This section lists only what the code does today. Where a feature has a known defect, that is noted with a pointer.

### Learner screens and modes
- Player select screen: Jenn (🐥) and Jess (🦊) cards, each with star points, day streak and today's mini summary (`src/index.html` `#screen-select`).
- Weekly Champion Board on the select screen: star points, streak, week points, and a weekly played-day dot strip per child.
- Wall clock (time and date) at the top of the app (`startWallClock`).
- Selecting a player opens the hub at the recommended level (`recommendLevel`, `src/learning/levels.js`).
- Hub: daily slogan with a "Translate to English" toggle; a collapsible daily summary; the ⭐ Topic Stars map; a connection/sync status line.
- Hub level tabs L1–L7, stored internally as grade keys 4–10. Every level is always reachable; no lock or day counter. The suggested level carries a ⭐ (`isLevelReachable`, `recommendLevel`, `recommendationText`).
- All learner-facing level text goes through `levelLabel()`/`levelNumber()` ("Level N", "LN"). No "G4" or "Grade N" text anywhere (`tests/browser/m1-repair.test.js`).
- Six game modes from the hub: Quick Quiz, Word Match, Scramble, Sentence Builder, Listen & Speak, and Boss Round (mixed, all topics) (`ALL_GAME_TYPES`).
- At most 2 rounds per game mode per child per day (`DAILY_ROUND_LIMIT`), shown as "N left today". Only a completed round uses one.
- Game screen: 3 lives (❤️/🖤), score, progress bar, 🔊 speak and 🎤 mic buttons, a hint panel, a feedback overlay, and Next.
- Points: 15 / 10 / 5 base per correct answer (3 / 2 / 1 lives left). Speed bonus up to 10 within 8 s, not in Word Match (`showFeedback`, `SPEED_BONUS_*`).
- Each question scores at most once, even if its buttons are re-enabled (`commitAnswerOnce`, `src/state/attempts.js`).
- A wrong answer costs a life. Running out of lives ends the round as `challengeFailed`: points kept, no daily round used.
- Five round outcomes are recorded: `completed`, `challengeFailed`, `abandoned`, `interrupted` and `timedOut` (`ROUND_OUTCOME`, `src/state/schema.js`).
- Round drafts: an unfinished round is saved locally and resumed, including the Word Match board and a pending selection. A completed board is not resumed (`french_round_draft_` keys).
- Scramble keeps œ, hyphens and apostrophes as tiles. Every scramble-eligible curriculum word is solvable (`src/util/fr-text.js`).
- Answer checking: recognition ignores accents. Dictation spelling (Listen & Speak) requires them, and an accent-only miss says "So close — check the accents and marks!" (`compareFrench`).
- Missed words are logged in `failedWords` and requeued into later rounds (`logFailure`, `injectRequeue`).
- Round-complete screen: points, confetti, moon banners and trophies, then "Play Again (N)" or "Done today! 🌙", and Hub.
- Moons (per level, plus super) are earned achievements and never gate anything. Topic stars come from daily topic accuracy.
- Study overlay: Set 1 Vocab, Set 2 Sentences, Set 3 My Words, and "I'm Ready!".
- My Words overlay: Word List and Drill tabs. The drill's Check works on apostrophe words.
- 20-minute session lock with a parent-password unlock (`SESSION_LIMIT_MS`, `#lock-overlay`). The round draft is flushed before locking.
- Play time shown to the child is capped at 30 minutes a day (`DAILY_PLAY_CAP_MS`). "Show full French times" reveals the real time for the browser session.
- Weekday lock: on a day the parent has blocked, "Not a practice day" appears, with a parent-password unlock or ← Back (`#weekday-lock-overlay`, `isWeekdayPlayAllowed`).
- Day keys use America/Edmonton (`src/util/dates.js`). Two exceptions use the device clock (implementation-status "Still device-clock dependent"): the weekly played-days strip and the "next reset" line.

### Speech
- All sound — spoken French and recorded clips — goes through one owner, `src/speech/audio-out.js` (`createAudioOut`). `speakFrench` in `src/app.js` is a thin wrapper over it. The voice comes from `pickFrenchVoice`: fr-CA preferred, fr-FR as fallback. `lang` is set even with no voice. Rate is `SPEECH_RATE = 0.80`. Structural rule: `synth.speak`, `new Audio` and `.play(` appear nowhere else in `src/`.
- `cancel()` only when something is speaking or pending (`d8edc24`), and never to clear the silent unlock line. The first trusted tap anywhere speaks one empty, silent line to unlock WebKit speech. A paused engine is resumed before speaking, on returning to the page (`visibilitychange`) and on `pageshow`. Each line keeps a strong reference until it ends.
- A line that has not started within 1.5 s (`START_WATCHDOG_MS`) is reported, not retried: its 🔊 button pulses (`.needs-tap`) until a line starts. **The iPad first-tap silence is fixed and confirmed on the iPad** (2026-09-29: first tap after opening, Listen & Speak first word, first tap after sleep; `ipad-test-checklist.md` §4.5).
- 🔊 buttons carry their text in `data-speak`, with no inline-JS interpolation, so apostrophe words speak. Touch targets are ≥44 px (52 px on touch).
- Listen & Speak speaks each word automatically in the same task as the tap that rendered the question (the 400 ms delay is gone); the input is still focused at 600 ms. Quiz and Scramble also speak their word on render.
- `currentVoiceInfo()` is on `window`, for diagnostics.
- Mic toggle (`src/speech/recorder.js`): tap to start, tap again to stop. It resets on result, error, silence or the 10 s timeout. States 🎤 / ⏹ Stop.
- The quiz mic reports what the device heard and never claims the pronunciation was good. Listen & Speak puts the transcript in the box and submits nothing until Check ✓.
- Assessment audio capture (`src/speech/capture.js`): clips up to 90 s. A refused microphone is stored as `microphone_failed`. An interruption is stored as `app_interrupted_before_submit`, keeping what was captured.

### Assessment (Release A `assessment-v1.0.2`, `content/releases/assessment-v1/`)
- Entry is only from Parent Summary behind the parent password ("Start / resume — Jenn / Jess"). Never from the child's hub (`src/app.js` ~1591–1614).
- Form assignment: jenn = A, jess = B, anyone else by FNV-1a. Reassessment uses the alternate form, except that a barely-used attempt may repeat its own (`chooseForm`, `planNextAttempt`, `src/assessment/session.js`).
- Five sections in the release's order: listening, reading, vocabulary/grammar, writing, speaking. A new section needs 6 minutes. A section already begun runs to its end.
- Objective routing: the entry block is answered first, then the routed tiers are appended in bank order. The decision is frozen with a timestamp.
- Item types rendered: `audio_choice`, `text_choice`, `typed_short`, `open_written` and spoken prompts.
- Listening: at most two plays. A play is counted only when the speech actually starts; one that never starts uses nothing and says "No sound started. Tap ▶︎ Play again." The Play button is held while a play is starting. "I heard nothing" uses no play and stores `audio_failed` as invalid. The script and any written French are never shown.
- The assessment screen has no feedback, hints, translations, lives, stars, timer, confetti or leaderboard. A chosen option is outlined in blue only.
- Typed fields turn off autocorrect, autocapitalize, spellcheck and autocomplete. A keyboard note (turn off Auto-Correction and Predictive Text) appears before the words and writing sections.
- Autosave on every response. Resume goes to the first unanswered planned item, on either device. A submitted item is never shown again, and a second submission is refused.
- Items with unbuilt assets are skipped. The four artwork items (`SA-F02`, `SB-F02`, `SA-D02`, `SB-D02`) show inline SVG with no text labels (maps: French place names, no route) (`src/assessment/assets.js`).
- Writing and speaking responses are stored `awaiting_review` and never auto-scored. Clips stay in IndexedDB on the recording device (`src/assessment/audio-store.js`). Only the reference and `audio_device_id` sync.
- A finished check-in offers "Done — back to the start", and the bar says Close.
- Objective scoring follows the release rules, reading `secure_threshold` / `emerging_threshold` from the release (`src/assessment/scoring.js`). Invalid responses count in neither numerator nor denominator.
- Report (`src/assessment/report.js`): five banded sections in release order, with no total, average or overall band. Pronunciation is a nested observation group under Speaking, with no band. Strengths and next-needs: current attempt only, at least 2 items per skill, 0.75 cut, at most 3 per list.
- 📊 Parent report screen: every run on this device, newest first, with bands in words. A parent-invalidated run is shown and marked as not a measurement (`src/modes/assessment-report-ui.js`).
- Reassessment comparison `compareRuns`: band movement per domain, nothing aggregated. Logic and unit tests only; **no screen shows it**.
- ✍️ Scoring screen (`src/modes/assessment-review-ui.js`, `src/assessment/review.js`):
  - Every open prompt, with its rubric anchors.
  - A named scorer is required.
  - One 0–3 radio choice per rubric dimension.
  - A "helped" (support) flag.
  - "Set aside" and restore, but never for an invalidity the app recorded itself.
  - Play the recording on the recording iPad. Clips are read from IndexedDB when the cards are drawn, so the tap reaches `play()` directly; a refused play says "That did not play. Tap ▶ again."
  - No model answers anywhere.
- Exports: "⬇ Save everything, with the recordings" (`exportHtml`, one self-contained HTML with the audio embedded) and "⬇ Text only" (`exportText`). A worked example that is a model answer in the same export is withheld (`partitionExamples`).
- Assessment runs travel inside the recovery JSON export and are merged, not replaced, on import.

### Parent area
- 📋 Parent Summary overlay, from the select screen: weekly and daily modes with navigation, side-by-side stats per child, and practice-word rows (fr / en / zh / fail count).
- A 4-digit parent password, hard-coded as `PARENT_PASSWORD` in `src/app.js`, gates clear, recovery, assessment, device-check and unlock actions.
- Clear actions for both children, password-checked: 🗑 Today, 🗂 Old Days and 🔄 Reset All. Today leaves total stars, moons and earlier days alone.
- Recovery tools:
  - 🛡 Freeze cloud writes (a toggle).
  - 💾 Export backup JSON: both children's profiles plus the assessment stores.
  - ♻️ Import recovery JSON: migrate, then merge.
- 📅 Show daily cloud backups, and restore one: migrate, then merge — nothing earned is lost.
- Screen-time "allowed days" weekday grid.
- The Levels panel states that every level is open. It has no controls.
- 🔧 Device & feature check (`src/modes/device-check.js`, `device-check-ui.js`):
  - Seven parent-started checks: voice, audio plays, microphone permission, record and replay, storage round-trip, delete, and the four pictures shown at learner size.
  - "Play it back" plays the in-memory recording inside the tap. A refused play leaves the check at "needs you" with the reason and asks for another tap; only the person's "I heard nothing" fails it.
  - A test-mode notice at the top.
  - ⬇ Save these results: downloads `device-check-YYYY-MM-DD.txt` — each check's status, detail and the parent's answer, plus date, browser and Home Screen icon vs Safari tab. No learner data; writes nothing on the device. **Known defect:** any non-Home-Screen page is labelled "Safari tab", including Chrome for iOS (seen 2026-09-29; implementation-status "M2 Step 6", open items).
  - Writes no learner record. Diagnostic clips use the `devicecheck_` prefix and are deleted on the way in and on the way out.

### Data and sync
- Profile schema v3 (`SCHEMA_VERSION`, defaults in `src/state/schema.js`).
- Migrations run v0 → v1 → v2 → v3, forward only and idempotent. They keep unknown fields and leave a newer-build profile alone (`src/state/migrations.js`).
- Round ledger `roundLog` (added in v2; outcomes labelled in v3). The merge reconciles the day counters from it.
- `mergeProfiles` is commutative, idempotent and monotonic (`src/state/merge.js`):
  - two iPads offline on the same day keep both rounds;
  - weekly history is de-duplicated and capped at 8 weeks;
  - settings take the newer side.
- A local mirror in localStorage (`french_game_local_<player>`), plus round drafts. The device id `french_device_id` is set at startup.
- Firestore profile sync: `french_game/{player}` with a live listener. No cloud write happens until a cloud read has confirmed the learner's state (`loadState`), and a failed read is never promoted to "absent".
- Offline play with a status line: "Working offline · progress saved here, will sync" or "Synced to cloud". Pending saves flush on reconnect and on exit.
- Cloud failures are named by `describeCloudFailure`, which separates configuration problems from transient ones. Only actionable ones are shown.
- Daily cloud backup to `french_game_backup/{player}_{date}`: once per child per day, and only after the cloud load is confirmed and the child has progress.
- Assessment store: localStorage `french_assessment_local_<player>` and Firestore `french_game_assessment/{player}`, with its own listener map. Store schema v1, with its own migrations and a lattice-join merge (`src/assessment/store.js`, `run-migrations.js`, `run-merge.js`). Never folded into the profile.
- The Firebase project `chore-tracker-a461b` is shared with the owner's other apps. This repo has no Firestore rules file and no auth (`known-risks.md` §1, §1b).
- Release A is inlined into the built page, so both answer keys can be read in the page source. This is an accepted risk (`known-risks.md` §1c).

## Regression table format (paste at the end of every edit)
| Feature | v<old> → v<new> | Note |
|---|---|---|
| <feature> | kept / added / intentionally removed / missing | <why, if not kept> |
