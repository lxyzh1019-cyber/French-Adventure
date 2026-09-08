# iPad test checklist

Everything in Milestone 1 passes 88 unit tests and 15 browser tests, but none of
it has run on a real iPad. Headless Chromium is not iPad Safari: autoplay rules,
the on-screen keyboard, speech voices and storage eviction all behave
differently, and this release touches all four.

Each check is written as **Do → Expect → If not**. They are ordered by how much
they tell you, so if you stop after fifteen minutes you have still learned the
things that matter most.

**Time:** about 10 minutes for Part 1, 30 for everything.

---

## Before you start

- [ ] **Export a backup.** Parent Summary → enter password → **Export backup**.
      Saves a JSON file of both girls' profiles.

      *Why:* this test writes to their real records. Thirty seconds of
      insurance. If anything goes wrong, Parent Summary → import restores it.

- [ ] **Open the app from the Home Screen icon**, not a Safari tab, so you are
      testing the way the girls actually use it.

- [ ] **Note the star counts** for Jenn and Jess from the player-select screen.
      Write them down — several checks below compare against these.

      Jenn: ⭐ __________   Jess: ⭐ __________

---

# Part 1 — Does their progress survive?

This is the whole point of the release. Progress had been lost several times;
these checks confirm it cannot happen the same way again.

### 1.1 A normal session keeps its points

**Do:** Open the app → tap Jenn → play one full round of Quick Quiz →
return to the hub.

**Expect:** Her star total went *up* by the round's points and never flickered
to 0. The status line under the hub reads **"Synced to cloud"**.

**If not:** If the total dropped or reset, stop and tell me — that is the
original bug and it should be impossible now.

---

### 1.2 Force-quitting mid-round loses nothing

**Do:** Start a Word Match round → match two or three pairs → **force-quit**
(swipe up from the bottom and flick the app away) → reopen → tap Jenn → start
Word Match again.

**Expect:** The board comes back with the same tiles in the same positions and
your matched pairs still matched. Stars unchanged.

**If not:** A blank board or a shuffled one means the resume fix regressed.
A *changed star total* is more serious — tell me.

---

### 1.3 Airplane mode: she can still play, and it says so

**Do:** Turn on Airplane Mode → open the app → tap Jenn.

**Expect:** She can play normally. The status line says
**"Working offline · progress saved here, will sync"**. Her existing stars are
still shown, not zero.

**Then:** Play a short round → turn Airplane Mode off → wait ~10 seconds.

**Expect:** The status changes to "Synced to cloud" and the round's points are
still there.

**If not:** If it showed 0 stars while offline, that is important — tell me
immediately and do not play further.

---

### 1.4 The two-iPad check (needs both)

**Do:** On **iPad A**, Airplane Mode on, play a round as Jenn.
On **iPad B**, Airplane Mode on, play a *different* round as Jenn.
Turn Airplane Mode off on **both**. Wait ~30 seconds. Open the hub on each.

**Expect:** **Both rounds' points are present on both iPads.** The total should
be roughly her starting total plus *both* rounds, not just the larger one.

**If not:** If only one round survived, the merge is not working — tell me which
iPad's round was lost.

---

# Part 2 — Is it actually Canadian French?

**This is the one genuine unknown.** The code now asks for `fr-CA` and picks the
best French voice the device has — but most iPads ship only `fr-FR`. If yours
does, the girls are still hearing France French, and no amount of code fixes
that. Only the device can tell us.

### 2.1 Find out which voice is installed

**Do:** You need the Safari console for this, which needs a Mac:

1. On the iPad: Settings → Safari → Advanced → **Web Inspector** ON.
2. Connect the iPad to a Mac by cable, open the app.
3. On the Mac: Safari → Develop → *[your iPad]* → select the app page.
4. In the console, type `currentVoiceInfo()` and press Enter.

**Expect:** An object like
`{requested: "fr-CA", resolved: "fr-CA", name: "Amélie", isPreferred: true}`.

**Read it as:**
- `isPreferred: true` → a real Canadian French voice. Ideal.
- `resolved: "fr-FR"` → France French. Working as designed (French beats an
  English voice reading French), but **not what was asked for**. Tell me and I
  will note it honestly rather than claiming Canadian French.
- `resolved: null` → no French voice at all. Tell me.

**No Mac?** Skip it. Instead, play a round and listen: a Canadian voice says
"trois" with a noticeably different vowel. If you are unsure, that is a fine
answer — record "unsure".

### 2.2 The audio works at all

**Do:** In Quick Quiz, tap the 🔊 button on several words. Find a word with an
apostrophe if you can — `aujourd'hui`, `j'ai mangé`, `l'école`.

**Expect:** Every one speaks. **Apostrophe words especially** — those buttons
were completely dead before this release.

**If not:** A silent button on an apostrophe word means that fix regressed.

---

# Part 3 — What this release changed

### 3.1 Every level opens

**Do:** On the hub, tap through **L1 … L7**.

**Expect:** All seven open and start a round. None shows a 🔒 or a "0/2"
counter. One has a ⭐ — that is the suggested level, not a lock.

**If not:** Any padlock means the gate removal did not deploy.

### 3.2 Impossible scramble words are solvable

**Do:** Play Scramble at L2 or higher until you meet `sœur`, `œil`,
`arc-en-ciel` or `aujourd'hui`.

**Expect:** Every tile you need is present — including the **œ** tile, the
**hyphen**, and the **apostrophe**. The word can actually be built.

**If not:** A missing œ or hyphen tile means the word is unsolvable. Note which.

### 3.3 Running out of lives is honest

**Do:** In Quick Quiz, deliberately answer wrong until all three ❤️ are gone.

**Expect:** The screen says the round does **not** count as finished and has
**not** used one of today's rounds. Points earned are still kept.

### 3.4 Clearing today does not clear everything

**Do:** Parent Summary → password → **🗑 Today**. Check both girls' stars.

**Expect:** Only today's activity goes. Total stars, moons and earlier days are
untouched — **for both girls**.

**If not:** If either child lost stars or a moon, tell me immediately.

### 3.5 The microphone stops when you tap it again

**Do:** In a Quick Quiz, tap 🎤. Tap it a second time.

**Expect:** The first tap shows **⏹ Stop**. The second stops it and the button
goes back to 🎤. Leaving it alone also returns it to 🎤 on its own after a few
seconds of silence.

**If not:** If it stays on **⏹ Stop**, or a second tap does nothing, say so —
this is the one the girls complained about.

### 3.6 A mishearing does not cost a life

**Do:** In Listen & Speak, tap 🎤 and say something that is clearly not the
word. Look at the hearts before and after.

**Expect:** What the device heard appears in the box for you to accept or fix.
No heart is lost, and no answer is submitted, until you tap **Check ✓**.

**If not:** If a heart disappears before you tapped Check, tell me.

---

# Part 4 — iPad behaviour

- [ ] **4.1 Rotate** the iPad in a round. Layout adapts; nothing is cut off.
- [ ] **4.2 Buttons** are big enough for a 10-year-old; no accidental double-taps
      registering twice.
- [ ] **4.3 Keyboard** — in Listen & Spell, the keyboard opens without hiding the
      input, and closes cleanly.
- [ ] **4.4 Accents from the iPad keyboard** — hold `e` → `é`, hold `c` → `ç`.
      Type an accented answer; it is accepted. Type it *without* the accent; you
      should get **"So close — check the accents"**, not a flat wrong.
- [ ] **4.5 Audio after silence** — leave the app idle 30s, then tap 🔊. It still
      speaks (iOS sometimes suspends audio).
- [ ] **4.6 Screen lock** — lock mid-round, unlock, return. The round resumes
      where it was.
- [ ] **4.7 App switch** — swipe to another app for a minute, come back. Same.

---

# Reporting back

Tell me:

1. **Anything in Part 1 that failed** — that is data safety and it comes first.
2. **What `currentVoiceInfo()` said** — or "no Mac" / "unsure".
3. Anything else that looked wrong, however small.

If something is broken, **stop and tell me before letting the girls use it**.
Their backup from the first step means nothing is lost either way.

---

## Result

Date tested: ______________  ·  iPadOS version: ______________

Jenn ⭐ before: ________ after: ________   Jess ⭐ before: ________ after: ________

`currentVoiceInfo()` said: ________________________________________________

Problems found:
