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

# Part 5 — The assessment (new)

The assessment is separate from the games: no points, no hearts, no verdicts.
It opens from **Parent Summary → Independent check-in**, behind the parent
password, and never from the girls' hub. Exposure is permanent and each form is
45 items, so **do not open it to look around** — start it only when you mean to.

## 5.0 Before the words and writing parts — a grown-up job

> **For an accurate placement result, temporarily turn off Auto-Correction and
> Predictive Text in Settings → General → Keyboard.**

- [ ] **5.0** Done before the check-in, and turned back on afterwards.

This matters more than it sounds. One vocabulary item accepts `où`, and the
writing rubric scores `conventions` — exactly what predictive text supplies and
autocorrect erases. The app sets every attribute a web page can set
(`autocorrect`, `autocapitalize`, `spellcheck`, `autocomplete`), and the app
also says this on screen before those two parts — **but a web page cannot
disable the QuickType bar**. Nothing in the app has turned these off for you.

## 5.0b The device & feature check — do this first

Parent Summary → enter password → **🔧 Device & feature check**. It asks this
iPad whether it can do what the check-in needs, and it **spends no items and
changes no records**: no answers, no history, no stars, nothing synced. The
panel says so at the top.

- [ ] **5.0b-1 French voice** — tap *Check the voice*. It names what was asked
      for (fr-CA) and what this iPad will actually use. `fr-FR` is normal and
      expected; **no French voice at all** means the listening part cannot be
      done on this iPad.
- [ ] **5.0b-2 French audio plays** — tap *Play a French phrase*. If you hear
      it, tap **I heard it**. If you hear nothing, tap **I heard nothing** and
      tell me — the listening part depends on this and no test can hear it for
      you.
- [ ] **5.0b-3 Microphone** — tap *Ask for the microphone*. Safari asks the
      first time; allow it.
- [ ] **5.0b-4 Recording** — record two seconds, stop, play it back, and answer
      whether you heard it.
- [ ] **5.0b-5 Storage** — tap *Keep and read back a clip*, then *Delete the
      test clip*. Both should say Working. "Not working" here usually means a
      private window or Safari set to block site data, and speaking recordings
      would not survive.
- [ ] **5.0b-6** Tap **Done — clear the test clips**. The test recording is
      deleted.

This is a machine check. It does not replace the rest of Part 5: only you can
tell whether the French sounds right and whether a child can be understood.

## 5.1 Starting

- [ ] **5.1** Parent Summary → enter password → **Start / resume — Jenn**.
      The overlay closes and the check-in fills the screen.
      Jenn gets form A, Jess gets form B.

## 5.2 Listening — the two-play rule

- [ ] **5.2a** Tap **Play**. You hear French; **no French text appears** on
      screen. If you can read the sentence, stop — that is a reading item now.
- [ ] **5.2b** Tap **Play again**. After the second play the button greys out.
- [ ] **5.2c** On one item tap **I heard nothing**. It does not use up a play,
      and the item is skipped rather than marked wrong.

## 5.3 Answering

- [ ] **5.3** Choose an answer. It is outlined in blue and **nothing tells you
      whether it is right** — no tick, no colour change, no sound. Tap **Next**
      and the following question appears. This is deliberate.

## 5.4 Pausing and resuming

- [ ] **5.4a** Tap **Pause** mid-section. Close the tab completely.
- [ ] **5.4b** Reopen and resume. Same form, same part, same question, and the
      questions already answered are not asked again.
- [ ] **5.4c** If you have both iPads: pause on one, resume on the other. The
      answers from the first are there.

## 5.5 Speaking — the microphone

- [ ] **5.5a** On a speaking prompt tap **Record**. Safari asks for the
      microphone the first time; allow it. The button becomes **Stop** and
      pulses.
- [ ] **5.5b** Tap **Stop**, then **Hear it back**. You hear her answer.
- [ ] **5.5c** **Refuse the microphone once** (Settings → Safari → Microphone,
      or deny the prompt). The app says this is *not a wrong answer* and moves
      on. It must not mark her down.
- [ ] **5.5d** Two prompts show a **picture** — a room, and a street map with
      French place names. The map has **no arrows** showing the route, and no
      picture has English labels on it. If you see a list of words like
      "school, park, library, bank", stop and tell me.

## 5.6 Writing

- [ ] **5.6** Type a sentence and submit. Nothing marks it. The screen says a
      grown-up reads it later — which is true: writing and speaking wait for a
      person, and the app never scores them.

## 5.7 What you should NOT see anywhere in the check-in

- [ ] **5.7** No stars, hearts, streaks, points, confetti, leaderboard, hints,
      translations, or "correct/wrong" messages. Any of these is a defect.

## 5.8 Where the recordings live

- [ ] **5.8** Her recordings stay **on the iPad that recorded them** and are not
      uploaded. If you record on Jenn's iPad, the review panel on Jess's iPad
      will show the prompt waiting for review with no audio — that is expected,
      not a fault. **Review speaking on the day it is recorded**: iPadOS clears
      unused site storage after about a week.

## 5.9 The report

Parent Summary → enter password → **📊 Show check-in report**.

- [ ] **5.9a** Five parts are listed — Listening, Reading, Vocabulary and
      grammar, Writing, Speaking — each with where it sits and how much to read
      into it.
- [ ] **5.9b** **Pronunciation appears once, inside Speaking**, as observations
      with no level and no score. Until you have listened to at least two
      recordings it says so instead.
- [ ] **5.9c** Writing and Speaking say *waiting for an adult to read or listen*
      until someone has. That is correct: the app never marks them.
- [ ] **5.9d** There is **no total, no average and no overall score** anywhere,
      and nothing that reads like a school grade or a placement. If you see one,
      that is a defect — tell me.

---

# Reporting back

Tell me:

1. **Anything in Part 1 that failed** — that is data safety and it comes first.
2. **What `currentVoiceInfo()` said** — or "no Mac" / "unsure".
3. **Part 5.2a and 5.5d** — whether any French text appeared during a listening
   item, and whether the two pictures looked right to you. Those two are the
   ones a test cannot check for me.
4. Anything else that looked wrong, however small.

If something is broken, **stop and tell me before letting the girls use it**.
Their backup from the first step means nothing is lost either way.

---

## Result

Date tested: ______________  ·  iPadOS version: ______________

Jenn ⭐ before: ________ after: ________   Jess ⭐ before: ________ after: ________

Auto-Correction / Predictive Text turned off before the check-in?  ☐ yes  ☐ no

The two pictures (room, street map) looked clear?  ☐ yes  ☐ no — what was unclear: ______

`currentVoiceInfo()` said: ________________________________________________

Problems found:
