# Plan v1 — French Adventure review fixes and level tiers — 2026-10-10

Approved in the claude.ai chat on 2026-10-10 ("BABBA", then "BBAA"). Built and tested in the chat; delivered as one package for one pull request.

## Decisions
1. 20-minute timer: carries on through Back **and** a reload (B).
2. Parent password: keep `1234` (A).
3. More words: left to Release B (B).
4. Star rule: keep 60 / 80 / 95% (B).
5. Level lock: back, in pairs (A).
6. Days to open the next tier: any 2 practice days, not back-to-back (B).
7. A finished tier stays open (B).
8. Where each girl starts: L1+L2 for everyone (A).
9. Delivery: package from the chat (A).

## What changes
- L1 — one 20-minute timer per girl per day; Back, the card and a reload carry it on; Unlock starts a new 20 minutes.
- R6 — level tiers L1+L2 → L3+L4 → L5+L6 → L7; 🔒 LN X/2 on locked tabs; banner and confetti when a tier opens; a qualifying day = every topic 3⭐ that day and 95%+ on the level that day.
- L4 — no play time for the start screen or the first card tap.
- L5 — device check says "browser tab".
- F1 — parent password box under the tabs, visible from every tab.
- S1, S2 — "Translate to English" and every overlay ✕ at 52 px on touch screens.
- G1 — 7 unused functions removed from `src/app.js`.
- R1 — stale lines in WORKING_RECORD cleaned up.
- T1 — drift and Release A hash checks compare LF text, so `npm run verify` passes on a Windows clone.

## Round 2 (2026-10-10) — changes to the plan, approved
- T1: done by making the drift and hash checks ignore line endings, not by adding `.gitattributes` (that would show many files as changed in GitHub Desktop).
- T2: dropped. Almost every pull request touches `src/app.js`, so a "check-in files only" condition would run the slow test almost every time.
- G1: 7 functions removed, not 4 — the new lock lives in `src/learning/levels.js`.
- Settings heading "🔐 Parent password" became "⏱ Full French times", since the box moved under the tabs.
- The "To fix later" tag on Levels is removed: the section now works.

## Not doing
L2 (password kept), R4 (words), R5 (stars), L6 (run invalidation button, before the next re-check), S3 (phone top bar), G2 (Firestore sign-in, deferred), T2 (slow check-in test file — see the report).
