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
| `totalStars` | number | Lifetime star points. Never decreases. |
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

## Round draft

Written on a short debounce during a round and on session timeout; cleared when
a round ends.

| Field | Meaning |
|---|---|
| `v` | Draft format version (currently 2). |
| `attemptId` | Identity for this round attempt. |
| `committed` | Question instances already scored, so a resume cannot score one twice. |
| `qIndex`, `questions`, `currentQ`, `lives`, `roundScore`, `roundBasePoints`, `roundSpeedPoints`, `roundTopicTally` | Round position and progress. |
| `feedbackOpen` | Whether the feedback overlay was showing. If so the answer was already scored, and resume advances past it. |
| `matchPairs`, `matchMatched`, `matchFrOrder`, `matchEnOrder`, `matchSelected` | Word Match board and selection. |
| `scrambleAnswer`, `scrambleSource` | Scramble tiles. Rebuilt on resume if they cannot spell the target. |
| `builtWords`, `listenInput` | Sentence Builder and dictation input. |

## Dates

All day keys are `YYYY-MM-DD` in `America/Edmonton`, so two devices in different
timezones agree on what "today" is. Historical keys written under the old
device-local rule are **not** rewritten: both formats are `YYYY-MM-DD` and all
comparisons are lexicographic, so old records keep working.
