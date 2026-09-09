# French Adventure — Release A review notes

**Release:** assessment-v1.0.1  
**Compatible master plan:** Revision 2  
**Authored/check date:** 2026-09-08

## What this package fixes

This is the complete content and scoring contract for Milestone 2. It contains two parallel forms across listening, reading, vocabulary/grammar, writing, and speaking. It deliberately reports a separate profile for each domain. It does not produce a school grade, a French-immersion equivalence, a percentile, or an overall average.

The design begins with the current Alberta FSL Nine-year Program, which treats French as a subject and organizes outcomes around communication, language, culture, and learning strategies. Grades 4–7 are the core reference. Grade 8 appears only as an enrichment reference for the top tier. The mapping samples outcomes; it is not a claim that this short assessment covers the full program.

## Form and item QA

- Form A and Form B have the same blueprint: 12 listening, 12 reading, 10 vocabulary/grammar, 6 writing, and 5 speaking prompts.
- Objective sections have matched difficulty distributions and distinct surface content. Comparable blueprints do not establish psychometric equivalence; pilot data is still required.
- Listening scripts are exact, versioned, set to Canadian French, and hidden during each item. Runtime TTS output must be heard on an actual iPad before acceptance; requesting fr-CA does not guarantee the installed voice.
- Reading includes connected notes, directions, narratives, evidence comparison, and Francophone-community texts.
- Writing and speaking include independent production. They remain `awaiting_review` until a qualified human uses the rubric.
- Speech-to-text is an observation only. It never scores pronunciation.

## Implementation instructions for Claude

1. Copy this directory to `content/releases/assessment-v1/`. Keep item IDs and versions unchanged.
2. Validate every item reference against `curriculum_map.json` and each rubric reference against `rubrics.json`.
3. Implement the exact routing, invalidity, form rotation, replay, resume, and reporting rules in `assessment_rules.json`. Do not reuse practice scoring or rewards.
4. Add fixtures from `scoring_fixtures.json` as executable tests before connecting the learner UI.
5. Render listening from `audio.script_fr_ca`; never expose the transcript or English translation during the item. Record requested and resolved locale.
6. Keep raw speaking audio on device by default. Authentication is deferred by parent decision and is outside M2 scope unless that decision is reopened.
7. Treat image/map descriptions in speaking prompts as asset briefs. A reviewed asset must preserve every listed object and spatial relationship; do not add clues that answer the task.

## Release gate from the M1 audit

Release A itself is content-complete, but Milestone 2 implementation should not be accepted until the M1 audit blockers are fixed: same-day concurrent offline attempts must survive sync, and the delayed wrong-match callback must capture its button references before selection state is cleared. Authentication is an accepted deferred risk and is not part of this release gate.

## Known limits and required review

- This package has not been reviewed by an independent French educator and is not psychometrically validated. A knowledgeable Alberta FSL educator should review the French, outcome mapping, and rubric anchors before results guide high-stakes decisions.
- Actual A/B comparability, timing, item difficulty, and band thresholds require pilot evidence from Jenn and Jess and should remain versioned settings.
- A parent or French-capable adult must score open writing and speaking. If unavailable, report `awaiting_review`.
- Canadian French is the preferred playback/recognition locale. Other Francophone varieties are valid; accent difference alone must not be treated as an error.
- Assessment conditions prohibit coaching. If coaching occurs, keep the response as supported evidence and exclude it from the independent band.
- Authentication remains deferred by explicit parent decision. Claude must preserve current sync and must not add authentication to M2 unless the decision is reopened.

## Source record

Official current pages were checked on 2026-09-08:

- Alberta Open Government publication landing: https://open.alberta.ca/publications/french-as-a-second-language-nine-year-program-of-studies-grade-4-to-grade-12
- LearnAlberta Grade 4: https://curriculum.learnalberta.ca/curriculum/en/pos/OLCFSL_9/FSL094
- LearnAlberta Grade 5: https://curriculum.learnalberta.ca/curriculum/en/pos/OLCFSL_9/FSL095
- LearnAlberta Grade 6: https://curriculum.learnalberta.ca/curriculum/en/pos/OLCFSL_9/FSL096
- LearnAlberta Grade 7: https://curriculum.learnalberta.ca/curriculum/en/pos/OLCFSL_9/FSL097
- LearnAlberta Grade 8: https://curriculum.learnalberta.ca/curriculum/en/pos/OLCFSL_9/FSL098

The text-accessible mirror listed in `curriculum_map.json` was used only to verify page locators in the Alberta Learning 2004 document (ISBN 0-7785-3772-2).
