# Release B — pilot-v1.1.0

## Amendment summary

Replaces pilot-v1.0.0 after the parent's supplied release-b-brief.md (2026-09-29). Revision 5 remains the governing master plan; the brief's Revision 3 citation is stale. Four chapters, the plot resolution and history remain. New: explicit recognition/assembly/frame routes, more/less support for every activity, encoding teaching and separate spelling feedback, French production clues, canonical assessment links, per-item release IDs and baseline fixtures. This is a content package, not a new implementation plan.

Status: author-reviewed; observed package tests are in validation_report.json. No app, educator, device or learner validation is claimed.

## Delivered scope

Four chapters; twelve core 20-minute sessions and two follow-up sessions; 144 learning items; 37 delayed/transfer/reserve items; eight chapter targets plus W_ENCODING grapheme recognition; twelve canonical curriculum links that carry no mastery. Twelve pronunciation tasks, six bilingual history cards and four SVG teaching boards. Full fixed items, keys, feedback, models, variants and fallbacks are supplied. Nothing must be invented at runtime.

## Baseline adaptation rationale

The brief supplies parent-report transcriptions, not newly scored raw answers. Jenn Form A (September 29): Listening Developing secure, Reading Foundation secure, vocabulary/grammar below measurable. Jess Form B (September 10): Listening and Reading Foundation secure, vocabulary/grammar below measurable. Both writing/speaking remain awaiting_review. Mixed-language attempts, omitted articles/verbs and unanswered longer tasks indicate a provisional productive entry at words and short patterns. Do not infer a writing or speaking band from these observations. Jess's later Form A has possible exposure/conditions concerns and is not a reliable starting baseline or established upper bound.

Both start with explicit article+verb models, one short pattern, recognition then sentence assembly then frame completion. More-support English gloss is visible by default in teaching; less-support gloss is collapsed and available on request. Jenn's listening can start with less support while her reading/grammar/writing still receive more; Jess begins with more listening support. Anonymous BASE-A/BASE-B fixtures record these differences without putting names into child content. Later response evidence changes support, not historical truth or plot.

Core practice is checkable without a French-speaking adult. Longer causal C2/C4 models are enrichment: do not demand them as unassisted free writing. Novel writing is one optional sentence, saved unjudged. Unlisted bounded wording is awaiting_review, with an example and checkable supported retry, and never a gate. The app must not pretend to correct all French or promise a reviewer.

## Answers to implementation questions

1. Use Release B's own independent delayed/transfer evidence for pilot progress while Release A forms are unavailable. Keep it separate from assessment bands. November 9 (B) and November 28 (A) concern possible reuse eligibility under the existing 60-day rule, not unseen forms. Claude must derive eligibility from stored attempts rather than hard-code these dates.
2. Default English gloss on for more-supported teaching, off/on-request for less-supported teaching, hidden during independent checks. Record actual support per response.
3. Begin W_ENCODING in Chapter 1 and revisit across all four chapters: boîte/î; l’indice/apostrophe; trouvé/é; à/location. Recognition of a grapheme is not proof of unaided keyboard spelling. Accent-tolerant authored sentence matches record meaning_correct_spelling_needs_correction and never encoding credit.

## Implementation handoff

Import to content/releases/pilot-v1/ using the existing Revision 5 plan, not the miniature fixture content. Preserve Release A and old responses. Existing revised items retain IDs and move to version 2; added items start at version 1. Every response records release_id and item version; merge attempts by their original versions. All supported variants are concrete and contain fixed content. A reveal/gloss/model cannot be undone by switching back to a less-supported variant. Independent checks hide target-bearing supports.

Implement the Chapter 1 vertical slice first. Use the shared audio owner from PR #29, existing local capture and audio-store; no external scorer, server or keys. Amélie/fr-CA at 0.80 is reported checked in the brief; these new lesson scripts have not been heard by the content author. A fallback voice must disclose its actual locale. C1 sur/sous needs a device check of the audible contrast. Other tasks target silent plural s, final é, and l’école linking. Transcripts say The device heard; never a pronunciation verdict.

Each four-minute teaching step routes through a small set of recognition/assembly/completion tasks, not every task at every support level. Bookmark teaching or exit overflow and resume next session. Do not compress several long tasks into one minute, require consecutive days, or penalize slow typing. Story advances on attempts/feedback opportunity, not mastery. Learning mastery stays narrow; canonical skill links are curriculum relationships, not automatic Release A equivalence. W_ENCODING reports taught-grapheme recognition with evidence counts, never a broad writing band.

Run the repository check-content.mjs and delivered validate-release-b.mjs. Run learning_fixtures.json through the implemented reducer and support router; package oracle passes do not test the app. No scorer invents errors for unlisted free text. No named skill receives token-wide credit for one sentence.

## Assets and source limits

Required illustrations: assets/C1.svg (map/letter/box board), C2.svg (two-message board), C3.svg (sequence board), C4.svg (community-language board). All four are supplied, 960×600, large card labels; fiction boards, not historical maps. Their readiness is structural only: test these new boards on iPad at arm's length. Assessment-art readability reported in the brief does not validate them. Teaching boards stay hidden beside independent listening checks. Models use device TTS scripts; no human audio files are claimed. No additional external artwork is needed for this bounded pilot.

History is introductory and source-checked as documented in history_sources.json, not independently reviewed by an educator, historian or community representative. No invented historical diaries/voices. No full later Africa/Asia empire account. One OIF source was inspected as a search excerpt only. Alberta outcome summaries are inherited from Release A; current official access was limited and full Grade 5 alignment/immersion equivalence is not claimed. EN/ZH/French author review is not independent linguistic certification.

## Finite review and exposure

37 delayed/transfer/reserve items support a first pilot, not unlimited spaced practice. Productive reserve items now use different fixed keys; receptive reserves retain their stated conditional freshness where they duplicate retries. Track actual content/model exposure across IDs. After mistakes, provide guided practice; fresh delayed checks wait until that skill is ready and at least 48 hours have passed. If no fresh checks remain, report fresh_bank_exhausted. Do not call a repeated answer transfer or silently generate substitutes.

## Review and remaining acceptance

Open preview.html after extraction for the revised scaffolding and encoding overview as well as the story/history. Integration, actual lesson audio/visuals, timing, engagement and retained learning still need the Chapter 1 pilot. The package does not close M3/M4/M5 acceptance.
