# Brief for Release B — Four-Chapter Learning Content

**To:** the content owner (ChatGPT), via the parent
**From:** Claude (implementation)
**Date:** 2026-09-29
**Governing document:** `docs/French_Adventure_Improvement_Plan.md`, revision 3. This brief adds evidence and device constraints. It does not change that plan. Where they differ, the plan wins, and the difference should be raised with the parent.

## 1. What is being asked for

Release B, exactly as specified in the master plan §5.5: one versioned package, `French_Adventure_Pilot_Content.zip`, which Claude imports to `content/releases/pilot-v1/`. It contains:

| File | Master plan contents | Pitch for these learners (from §3 below) |
|---|---|---|
| `manifest.json` | Release/version, plan compatibility, dependencies, exact totals, file hashes | Same conventions as Release A (`release_id`, SHA-256 per file) |
| `chapters.json` | Four complete chapter scripts, scenes, choices, convergence, recaps, bookmarks, fiction/history labels | Story text a Grade 5 learner can follow at word and short-phrase level; English allowed for instructions and narration scaffolds, French for every stimulus the learner acts on |
| `learning_items.json` | Teaching examples, guided tasks, independent exit checks, accepted answers, skill tags, explanations, misconception feedback, retry variants | Start from recognition, then move to building a sentence from given words, then typing a short sentence from a frame. Free writing comes last and stays short |
| `review_items.json` | Delayed-retrieval and transfer items, due conditions, support variants | Each target is reviewed in a new story situation. Never repeat the item exactly |
| `skills.json` | Prerequisites, mastery evidence, difficulty/support variants, error categories, scheduling parameters | Every skill has at least a "more support" and a "less support" variant (see §4) |
| `pronunciation_tasks.json` | Model scripts, target features, cues, recording instructions, fallbacks, honest feedback wording | One feature per chapter. Model scripts must work when read by the device voice (see §5) |
| `history_sources.json` | Claim-level sources, dates checked, fiction, perspectives, review status | As specified |
| `learning_fixtures.json` | Example learner histories with expected scheduling, feedback, mastery and story states | Include histories that match the two baselines below. Include one learner who gets a pattern right in guided practice and wrong when checked independently |
| `review_notes.md` | Coverage, French/history QA, asset needs, **baseline adaptation rationale**, limitations | Record how §3 shaped the difficulty choices (master plan §5.5, last paragraph) |

The package must contain finished child-facing content, not a template (master plan §5.5, §5.7). Claude will not write or fill in learner content.

## 2. Who the learners are

- Jenn and Jess, Grade 5, regular Alberta public school FSL, not French Immersion (master plan, header and §0).
- Sessions are about 20 minutes, one or two a week, never on consecutive days (master plan §3.4, §3.7).
- **No adult at home reads or speaks French.** Every explanation, hint and piece of feedback has to work without an adult. The app cannot score writing or speaking. Any activity that needs a person to judge French will go unjudged at home.

## 3. Baseline evidence (Release A check-in)

These are reported bands for the three machine-scored sections, taken from the app's parent report screen. Writing and speaking are **not scored**: they are `awaiting_review` until a qualified French reader is found (content-owner ruling, 2026-09-11). No writing or speaking band is implied anywhere below.

| Section | Jenn — Form A, 2026-09-29 | Jess — Form B, 2026-09-10 (her baseline) |
|---|---|---|
| Listening | Developing — secure. Strength: L_DIRECTIONS. Next: L_CONNECTED, L_MAIN_IDEA, L_DETAILS | Foundation — secure. Next: L_DETAILS, L_DIRECTIONS, L_KEYWORDS |
| Reading | Foundation — secure. Strengths: R_SENTENCE, R_WORDS. Next: R_DETAILS, R_MAIN_IDEA | Foundation — secure. Next: R_MAIN_IDEA, R_DETAILS, R_SENTENCE |
| Vocabulary and grammar | Below what the check-in can measure (7 answers) | Below what the check-in can measure (7 answers) |
| Writing (next-practice tag only) | W_ENCODING | W_ENCODING |

**Jess's second sitting (Form A, 2026-09-29) is recorded but should be read with caution.** It reported:
- Listening Developing — secure;
- Reading Stretch — emerging (strengths R_DETAILS and R_MAIN_IDEA; next R_CONNECTED and R_INFERENCE);
- Vocabulary and grammar still below measurable.

She sat the same form 17 minutes after Jenn, on the same iPad, and her listening result matches Jenn's in every field. Use Form B as her baseline. Treat Form A as a possible upper bound.

**What the unscored written answers show.** These are patterns only. The children's text is not reproduced, and none of this is a score.
- Both attempt the name phrase (*je m'appelle*) with a spelling error.
- Both mix English and French in one answer: an English frame with French nouns such as *pomme*, *fromage*, *samedi*.
- *J'aime* / *je n'aime pas* is attempted but not controlled.
- There is one attempt at a location sentence (*… sur la table*) without an article or a correct verb.
- For the longer prompts (a message, a school day, a preference with *mais*), the answers were "I don't know" or no attempt.

The parent observed the same in speaking: name, age and a few words, but not full sentences.

**Implication for the level.** Both girls understand more than they can produce, and vocabulary and grammar are the gap for both. The productive starting point is **single words to short, patterned sentences**. The four chapter language functions in master plan §4.2 (describe, compare, sequence, explain) should enter through sentence frames and word banks, well before free production. Please record this in `review_notes.md` as the baseline adaptation rationale, and label any difficulty choice as provisional.

## 4. One story, two starting points

Master plan §4 requires Jenn and Jess to follow the same plot at different support levels.
- **Listening:** Jenn currently sits one band above Jess's baseline.
- **Reading:** they are level at Foundation.
- **Vocabulary and grammar:** both are below measurable.

Please give every learning item at least two support levels, varied by:
- how many words are given;
- sentence length;
- whether the English gloss is shown;
- the number of replays.

Do not branch the story. Mastery rules decide which variant each learner sees. The content should not name either child.

## 5. Constraints from the device and the app

These are verified on the family iPad or in the code, as marked.

1. **French audio is the device's text-to-speech voice**, not a recording. On the family iPad this is the fr-CA voice "Amélie" (device check, 2026-09-29), at a rate slowed to 0.80 for these learners. Write every audio script to be read aloud by a synthesiser:
   - no stage directions inside the script;
   - spell numbers and times as words wherever the way they are said matters;
   - avoid a spelling that a voice could read two ways.

   If a target depends on a sound the voice may not produce reliably, flag it in `review_notes.md`.
2. **Typing is on the iPad on-screen keyboard.** Accents need a long press, which children often skip. The app can judge meaning and accents separately (`src/util/fr-text.js`). Accepted answers therefore need to state which items give meaning credit without accents and which items teach the accent itself (W_ENCODING is a named next step for both).
3. **Speaking.** The app records the child, plays the model and the recording back to back, and can show "The device heard…" where recognition exists. It **cannot score pronunciation**, and nobody at home can either. Pronunciation feedback must be honest, self-comparison wording (master plan §5), never a verdict.
4. **The first 🔊 tap is now reliable** (fixed and confirmed on the iPad, 2026-09-29). Activities may start with a sound.
5. **Pictures:** map labels and illustration text were readable at actual iPad size (2026-09-17). Keep labels at least that size. List every image the content needs in `review_notes.md` as an asset requirement.
6. **IDs and versions:** use stable item IDs, a `release_id` on every item, and `skill_id` values drawn from one list in `skills.json`. Where a skill continues one from Release A's curriculum map (`content/releases/assessment-v1/curriculum_map.json`), reuse Release A's ID so that later check-ins can be compared.

## 6. Questions for the content owner

1. The reassessment rule means Jess's next unseen form is not available until 2026-11-09 (Form B) and 2026-11-28 (Form A). Should the pilot's progress be judged by Release B's own delayed checks until then?
2. Should the first chapter give an English gloss by default for the weakest support level? Or should the gloss appear only on request?
3. W_ENCODING is the only writing next-step shown for both girls. Should accent teaching be a named target in chapter 1, or spread across all four chapters?

## 7. What happens next

1. The parent gives this brief to ChatGPT and returns the finished package.
2. Claude imports it into `content/releases/pilot-v1/`, then validates:
   - hashes;
   - totals;
   - every skill, item and fixture reference;
   - the §5.5 file list.

   Any gaps are reported back rather than filled in.
3. Claude designs the learning engine (master plan Phase 3) around the delivered content, under its own plan and approval.
4. M3 formally needs M2 accepted as well (master plan §5.1). The parent's remaining iPad checks for M2 are listed in `docs/ipad-test-checklist.md`.
