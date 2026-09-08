# Known risks

Accepted or deferred risks, with the fix specified so each can be picked up
deliberately rather than rediscovered.

---

## 0. Progress loss — FIXED, and how it worked

**Status:** fixed. Recorded here because it happened repeatedly and the shape of
it is worth remembering.

**What went wrong.** Jenn's and Jess's progress was wiped several times. It was
not random. The chain:

1. WebKit deletes all script-writable storage — `localStorage` included — after
   about **7 days without the app being used**. They play once or twice a week.
   A home-screen web app keeps its own counter rather than Safari's, but is not
   exempt.
2. With no local copy, the app started from `DEFAULT_STATE()` — every counter
   zero.
3. The cloud read is asynchronous, and a failure was swallowed by a
   `console.warn`. Worse, a *missing* document and a *failed read* were
   indistinguishable: `if (snap.exists()) onData(...)` simply called nothing in
   both cases, so the app could not tell "she has no saved progress" from "we
   could not reach the server".
4. Any save then ran `setDoc(ref, state[player])` — **a full document replace**,
   not a merge — writing the empty profile over her real one.

A save needed no user action to fire: tapping a name starts a 10-second
play-time timer that saves. On a warm start, where the Firebase SDK was already
cached, the startup save fired *before* any read at all.

The only reason this was ever recoverable is that the daily backup refuses to
write when `totalStars` is zero and never overwrites an existing day, so the
previous day's snapshot survived. That is why the "restore from backup" button
exists and has been needed.

**Why it can't happen again — six layers, no single point of failure:**

1. **A write barrier.** `syncMeta[player].loadState` is `pending`, `loaded` or
   `absent`. `saveState` will not write to the cloud while `pending`; the
   session is held on the iPad and flushed once the profile is known.
2. **A failed read is never mistaken for an empty one.** `fbInit` now reports
   the *outcome* of the read. Only a positive server confirmation sets `absent`;
   an error leaves the barrier closed indefinitely.
3. **`fbSave` refuses to blank a populated profile.** If a write carries no
   stars, it reads the stored document first and discards the write if that one
   has any. Costs a read only in the suspicious case.
4. **Backups happen earlier.** A snapshot is taken as soon as a profile is
   confirmed, not only after a completed round, and a placeholder profile is
   never archived.
5. **Durable storage is requested** via `navigator.storage.persist()`
   (iOS 17+), making eviction less likely to start the chain at all.
6. **It is visible.** While the profile is unconfirmed the status line reads
   "Working offline · progress saved here, will sync". No silent degradation.

7. **An empty profile is never created.** A learner with no cloud document who
   has not played has nothing worth saving, so nothing is written until she
   earns something. Once a document exists it is written normally, so a
   deliberate clear still takes effect.
8. **Writes merge rather than replace.** Two devices' work is combined, so no
   session can overwrite another (see below).

Layer 1 alone is sufficient. The rest exist so that a mistake in layer 1 is not
catastrophic.

Covered by `tests/browser/data-loss.test.js`, which reproduces the original
failure — evicted storage plus a slow cloud read — and asserts 1,240 stars
survive. Against the old code that test reports `expected: 1240, actual: 0`.

**Sync no longer picks a winner.** Conflict resolution used to score each
profile for how "rich" it looked and replace the whole thing with whichever
scored higher, so if both iPads were used between syncs one girl's entire
session was discarded. `src/state/merge.js` combines them instead, under three
properties that are each tested:

- **commutative** — `merge(a,b)` equals `merge(b,a)`, so the order snapshots
  arrive in cannot change what the devices converge on;
- **idempotent** — redelivery of the same snapshot changes nothing;
- **monotonic** — no counter is ever lower than it was in either input.

Star totals are rebuilt from the merged per-day ledger rather than taking the
maximum. Two iPads that each played one round offline from 1000 stars end at
1050, not 1030 — a maximum would have silently dropped the smaller session.

A remote update arriving *during* a round is also queued and merged at round
end. It used to be dropped outright.

**Two related bugs fixed at the same time:**

- `clearProgress('today')` ran `s.topicStars = {}`, erasing *every* topic star
  ever earned rather than today's, and doing it to **both** girls regardless of
  which was selected.
- The weekly rollover capped history at 4 entries while the rest of the code and
  the docs said 8, silently discarding half of it.

---

## 1. Firestore has no authentication — learner data is publicly writable

**Status:** deferred by decision (M1). Not fixed.

**What is true today.** The app calls Firestore directly with no sign-in step
anywhere in the codebase. For the reads and writes it performs to succeed, the
project's security rules must allow unauthenticated access. That means the two
documents holding Jenn's and Jess's progress — `french_game/jenn` and
`french_game/jess` — along with every document under `french_game_backup/`, are
readable **and writable** by anyone who opens the page and reads the project id
out of the source.

The Firebase project is also shared with an unrelated `chore-tracker`
application, so the exposure is not limited to this app's data.

**What is *not* the problem.** The `apiKey` in the client config is a public
identifier, not a credential. It is designed to ship in the browser and
removing it would achieve nothing. Firebase access control is enforced entirely
by security rules, which is exactly what is missing here.

**Blast radius.** Someone with the URL could read both children's activity
history, or overwrite or delete their progress. There is no personal
information beyond first names and study statistics, and the daily backups
under `french_game_backup/` would allow recovery from a malicious wipe — but
those backups are writable too.

**The fix.**

1. Add Firebase Anonymous Auth and await `signInAnonymously()` before the first
   Firestore call.
2. Key documents by the authenticated uid rather than by the literal strings
   `jenn` / `jess`, keeping a device-local mapping of which learner a uid is.
3. Replace the open rules with identity-scoped ones, so a signed-in user can
   only touch their own documents.
4. Migrate the two existing documents to their new uid-keyed paths, keeping the
   originals until the migration is verified.

Steps 1, 2 and 4 are code. Step 3 must be done in the Firebase console by the
project owner.

---

## 2. Skills are identified by their French word string

**Status:** recorded, not fixed in M1.

`findVocabWord(fr)` and the `failedWords` map key entirely off the French text,
so the same word appearing at two levels collides and cannot carry separate
progress. Stable skill ids are needed before per-skill mastery tracking can be
trusted.

Deferred deliberately: the identifier scheme has to match the content packages
that define the skills, so inventing one now would conflict with them.

---

## 3. Content packages are not yet delivered

**Status:** blocking M2 and M3. Nothing to fix in code.

The assessment (Release A) and the four-chapter story (Release B) are content,
not code, and neither exists. M2 cannot start without A; M3 cannot start
without B.

`npm run check:content -- <dir>` validates a package the day it arrives — the
day it arrives is much cheaper than three days into implementing against a
broken one. It enforces the contracts in the master plan plus two amendments
this project added:

- **every item carries `zh`** — all 461 existing vocabulary entries do, and the
  contracts never mention it, so without this it would silently disappear;
- **no assessment item exposes `zh`** — a translation is support, which the
  plan's own Level 0 rule forbids during assessment.

It checks structure and internal consistency only. It cannot tell you whether
the questions are any good, and passing it is not evidence of educational
validity.
