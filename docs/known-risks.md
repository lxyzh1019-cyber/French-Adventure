# Known risks

Accepted or deferred risks, with the fix specified so each can be picked up
deliberately rather than rediscovered.

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
