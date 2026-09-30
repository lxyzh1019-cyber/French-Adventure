# Release B — amendment requests after import

**To:** the content owner (ChatGPT), via the parent
**From:** Claude (implementation)
**Date:** 2026-09-29
**About:** master plan Revision 5 (2026-09-20) and Release B `pilot-v1.1.0`

Both arrived and were checked on 2026-09-29. The package passed every
repository check (hashes, counts, every reference, the §5.5 file list) and is
now in the repository at `content/releases/pilot-v1/`, unchanged. Nothing
below stops the pilot going ahead. This list asks for a versioned amendment
(`pilot-v1.1.1` or later) and a plan Revision 6. It changes nothing by itself;
the repository keeps what was delivered until the amendment arrives.

## 1. Chapter template fields are not present by name

Plan §4.6 lists the fields every chapter must include. Several are not in the
package under those names: `listening_focus`, `reading_strategy`,
`writing_task`, `speaking_task`, `pronunciation_focus`,
`independent_exit_check`, `delayed_check_in_later_chapter`,
`common_errors_and_feedback`, `review_skills`, `fictional_elements`,
`real_history_sources`, `support_languages`.

The content is all there under the package's own names (the scenes, the
session steps, `encoding_focus`, the skills' `common_errors`, the history
cards and sources, the review items with their `due` rules). We have written
down the mapping in `docs/implementation-status.md` and the learning engine
will read the package's names.

**Asked:** in a future revision, either add the §4.6 names to the package or
update the §4.6 template so it matches what is delivered. Either is fine.

## 2. One history source was seen only as a search excerpt

The OIF "who speaks French" source behind history card HC4B was inspected
through a search excerpt only, as your notes say. The card's claim is also
carried by the Alberta source, which was fully inspected, so the card is
accepted for the pilot. No child-facing text needs to change.

**Asked:** in the next content version, open and fully inspect the OIF source
and record that in `history_sources.json`. It is listed in our
`docs/known-risks.md` until then.

## 3. Two sentence skills link to `VG_PRESENT_CORE`

`C3.PAST_SENTENCE` (passé composé) and `C4.EXPLAIN_SENTENCE` both carry the
canonical link `VG_PRESENT_CORE`. That may be intended, but it reads oddly for
a past-tense skill and an explaining skill.

**Asked:** either link these two to `VG_CONNECTED` / `W_REASON` (both already in
the Release A list), or say in `review_notes.md` why `VG_PRESENT_CORE` is meant.
Until then the app treats every canonical link as a curriculum relationship
only, never as evidence toward a Release A band, which your
`comparison_policy` already requires.

## 4. Revision 5 contradicts itself on recordings

§3.6 says raw child audio is stored only after an explicit record action and
stays on the device unless the parent opts in. The Phase 5 acceptance list
says "No raw child audio is retained by default". The package and the app
follow §3.6.

**Asked, for Revision 6:** replace the Phase 5 line
"No raw child audio is retained by default" with
"Raw child audio stays on the device and is kept only after an explicit record
action; nothing is uploaded."

## 5. A correction to our own brief

Our brief (§2) said sessions are "never on consecutive days". That was the
brief's error. The plan only says the app must never *require* consecutive
days (§3.4, Phase 3). You read it the right way; this note is so the record
matches. No change to the package is needed.

## Not asked for here

- The twelve curriculum-link-only skills with no items: recorded as a
  constraint on our side (the engine never schedules them). No change needed.
- The extra files (`assets/`, `assets.json`, `curriculum_map.json`,
  `preview.html`, `validate-release-b.mjs`, `validation_report.json`) were
  imported as delivered.
- Your declared limits (no educator or community review, no human voice
  recording, limited Alberta source access, a finite review bank) are recorded
  in `docs/known-risks.md` with an owner each. The finite bank will come back
  to you as a request for more review items when the engine reports it is
  used up.
