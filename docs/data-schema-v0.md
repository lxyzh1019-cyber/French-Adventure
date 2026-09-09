# Persisted data — baseline (schema v0)

What French Adventure stores today, recorded before any schema change so a
migration can be checked against it. Every field below is live learner data.

**Rule for this milestone:** opening the app must never clear or rewrite any of
it. A browser test (`tests/browser/regression.test.js`) loads a populated
profile and asserts nothing is lost.

---

## Where data lives

| Location | Key | Contents |
|---|---|---|
| Firestore | `french_game/{player}` | The authoritative profile. `player` is `jenn` or `jess`. |
| Firestore | `french_game_backup/{player}_{YYYY-MM-DD}` | Daily snapshot. Written once per day, only when `totalStars > 0`, and never overwritten. |
| localStorage | `french_game_local_{player}` | Full profile mirror, so the app works offline. |
| localStorage | `french_round_draft_{player}_{day}_{gameType}_g{grade}` | In-progress round, so a round survives a screen lock. |
| localStorage | `french_backup_done_{player}_{YYYY-MM-DD}` | Marker that today's backup was written. |

There is no authentication. See [`known-risks.md`](known-risks.md).

## Profile fields

### Rewards and streaks
| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | Migration version. Absent means v0 — see `src/state/migrations.js`. |
| `totalStars` | number | Lifetime star points. Never decreases. Rebuilt from the per-day ledger (itself reconciled through `roundLog`) when two devices merge. |
| `weekStars` | number | Star points this week; archived into `weeklyHistory` at rollover. |
| `streak` | number | Consecutive study days. |
| `lastPlayed` | string | Last day played. Historically `Date#toDateString()` ("Sat Sep 06 2026"); now an Edmonton date key. Both are read. |
| `moons` | `{grade4..grade10, super: boolean}` | Achievement per level, earned when every topic reaches 3 stars. Once earned, never revoked. |
| `topicStars` | `{"{grade}_{topic}": 0..3}` | Star tier per topic. |

### Activity history
| Field | Type | Meaning |
|---|---|---|
| `playedDays` | `{dateKey: true}` | Days with any activity. |
| `todayStats` | `{dateKey: {correct, wrong, rounds, stars}}` | Per-day totals. `rounds` counts completed rounds only. |
| `dailyRounds` | `{dateKey: {gameType: count}}` | Completed rounds per format, against the daily cap. |
| `dailyTimeMs` | `{dateKey: ms}` | Time in app. |
| `dailyTopicStats` | `{dateKey: {topicKey: {gameType: {c, w}}}}` | Per-topic correct/wrong, the source for topic stars. |
| `gradeStats` | `{dateKey: {grade: {correct, wrong}}}` | Per-level accuracy; drives the level recommendation. |
| `gradeGameRounds` | `{dateKey: {grade: {gameType: count}}}` | Completed rounds per level and format. |
| `weeklyHistory` | `[{weekStart, …}]` | Last 8 archived weeks. |
| `weekStart` | dateKey | Monday of the current week. |
| `failedWords` | `{fr: {fr, en, …}}` | Practice queue. **Keyed by the French string** — see known-risks. |
| `lastDrillComplete` | dateKey | Last completed drill. |

### Levels
| Field | Type | Meaning |
|---|---|---|
| `gradeUnlocked` | `{4..10: boolean}` | Was a gate; now a record of levels visited. Nothing is locked. |
| `gradeParentOpen` | `{4..10: boolean}` | Legacy tier window. Retained, no longer consulted. |
| `tier1..3Conquered`, `tier1..3ParentOpen` | boolean | Legacy tier flags. Retained, no longer consulted. |

Storage keys stay 4–10 while the UI shows Level 1–7. An app level is not a
school grade and must never be presented as one.

### Settings and bookkeeping
| Field | Type | Meaning |
|---|---|---|
| `parentSettings.weekdayOpen` | `[7 booleans]` | Sunday-first screen-time gate. |
| `seedProfilePatches` | `{flag: true \| 'retired'}` | One-off profile corrections. All retired — they used to delete data on load. |
| `lastUpdatedAt` | ms | Write ordering for sync. |

### Round ledger (schema v2)
| Field | Type | Meaning |
|---|---|---|
| `roundLog` | `{attemptId: {id, day, type, grade, stars, correct, wrong, completed, grades, topics, at}}` | One immutable record per finished round. The two-device merge unions these by id and rebuilds `todayStats`, `dailyRounds`, `gradeStats`, `gradeGameRounds`, `dailyTopicStats`, `weekStars` and `totalStars` from them, so two rounds on the same day from two iPads are both kept. Rounds from before v2 have no record and are treated as shared history (counted once, by the larger value). Cleared alongside the day counters by the parent "clear" actions. |

## Round draft

Written on a short debounce during a round and on session timeout; cleared when
a round ends.

| Field | Meaning |
|---|---|
| `v` | Draft format version (currently 2). |
| `attemptId` | Identity for this round attempt. |
| `committed` | Question instances already scored, so a resume cannot score one twice. |
| `qIndex`, `questions`, `currentQ`, `lives`, `roundScore`, `roundBasePoints`, `roundSpeedPoints`, `roundTopicTally`, `roundAnswerTally`, `roundGradeTally` | Round position and progress. The two tallies are what this round alone has added to the day counters, so the ledger entry written at round end is exact even after a resume. |
| `feedbackOpen` | Whether the feedback overlay was showing. If so the answer was already scored, and resume advances past it. |
| `matchPairs`, `matchMatched`, `matchFrOrder`, `matchEnOrder`, `matchSelected` | Word Match board and selection. |
| `scrambleAnswer`, `scrambleSource` | Scramble tiles. Rebuilt on resume if they cannot spell the target. |
| `builtWords`, `listenInput` | Sentence Builder and dictation input. |

## Dates

All day keys are `YYYY-MM-DD` in `America/Edmonton`, so two devices in different
timezones agree on what "today" is. Historical keys written under the old
device-local rule are **not** rewritten: both formats are `YYYY-MM-DD` and all
comparisons are lexicographic, so old records keep working.


---

# Assessment store (v1)

Separate from the learner profile, and deliberately so. `window.fbSave` writes
the profile with `setDoc`, a full document replace, so folding runs into it
would rewrite a child's entire history once per autosaved response — 45 replaces
per run of the record the write barrier exists to protect. The profile schema is
untouched by M2.

| Where | Key |
|---|---|
| Firestore | `french_game_assessment/{player}` |
| localStorage | `french_assessment_local_{player}` |
| IndexedDB (later) | `french_assessment_audio` / `clips` — device-local, never synced |

The collection name follows the convention already in the code
(`french_game`, `french_game_backup`) rather than the camelCase
`assessmentRuns` / `assessmentResponses` of master plan §9.1, which that section
labels conceptual: "Final database structure may differ, but it must support
append-only evidence, independent assessment history, content versions, and
conflict-safe sync." All four hold here.

## Shape

```js
{
  assessmentSchemaVersion: 1,
  learner_id: 'jenn',
  runs: { [run_id]: AssessmentRun },   // grow-only
  lastUpdatedAt: 0,
}
```

A run carries `run_id`, the learner, release and form, the `content_sha` frozen
at start, `status`, `section_order`, a `sections` map, `exposure`, `responses`
and `review`. It deliberately has **no `report` field**: a report is derived, and
storing it would make a computed value a merge input that two devices could
disagree about without either having measured it.

The first thirteen fields of a response record are
`assessment_rules.json → administration.response_storage`, verbatim and in order.
A test iterates the release's own list, so a release that adds a field fails
rather than being quietly unrecorded.

Timestamps are epoch milliseconds from `Date.now()`, matching `lastUpdatedAt`
and the round ledger's `at`. The `_utc` suffix comes from the release's field
names; the release does not specify a format, and nothing in the codebase
produces ISO strings.

## Why the merge is safe

Nothing in this store is a counter. Every value is either an immutable record
under a unique key or a value from a small ordered set that only moves one way,
so `mergeAssessmentStores` is a lattice join: commutative, idempotent and
monotonic by construction rather than by the `base + merged ledger` arithmetic
`state/merge.js` needs. The whole-profile overwrite that cost this project a
child's history is not merely avoided here — it is unrepresentable.

The rules that are not obvious:

| Field | Rule | Why |
|---|---|---|
| `responses` | union; on conflict the **earliest** submission wins, ties by device id, loser flagged | `pause_resume.resume` — a submitted item is never replayed as a new scored item, so the first answer is the one the assessment elicited |
| `review` | union; the **later** review wins; `invalidated` ORs | a re-score is an intentional correction, unlike a response; a merge must never un-invalidate |
| `status` | max by rank: `parent_invalidated > complete > abandoned > in_progress` | a parent's invalidation always wins, and a device that saw the run finish knows more than one that saw it start |
| `exposure.shown_count` | **max, not sum** | sum is not idempotent under redelivery, and the rule it serves needs only "was it shown". It can under-count two genuinely separate showings. |
| `sections[d].plan` | longer wins if the shorter is its prefix; otherwise earliest `routed_at_utc`, flagged `routing_conflict` | routing is a pure function of the entry responses, so devices agree unless they hold different subsets |

## Growth

`runs` is grow-only and never pruned, in a single document per learner. At two
or three assessments a year that is comfortable for many years, but it is the
same unbounded pattern as `roundLog` and should be watched rather than assumed
safe. Firestore caps a document at 1 MiB.
