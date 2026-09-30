# French Adventure — Design rules

The single source of design rules for this app. Every screen change follows this file. Source: the French Adventure design system (synced from `src/styles.css` at 030beda, then extended; Patch 1 rules included).

A French learning game for Jenn and Jess, played on iPad in short sessions. The look is a dark night sky with bright, friendly colours: each girl has her own colour, and indigo means "French".

## Content fundamentals

- Short, playful words. French words are the star: show them big, in the display face.
- Each player is always shown in her own colour: `jenn` for Jenn, `jess` for Jess. Never swap them, and never use one girl's colour for a general state.
- Rewards speak in `gold` (points, stars, moons, the week leader).
- Right and wrong speak in `correct` and `wrong`, always with a ✓ or ✗ mark. **Never show a mistake in `jenn`** — that tells Jess her sister's colour means "wrong".

## Visual foundations

**Surfaces.** Three dark layers, from back to front: `bg` → `surface` → `surface2`. Cards sit on `surface`; things you tap (choices, tiles, secondary buttons) sit on `surface2`. Text is `text`; secondary text is `text-muted`.

**Accent colours.**

| Token | Means |
|---|---|
| `french` | Main action and "French" itself: primary buttons, game time, French words |
| `purple` | Training mode |
| `green` | Study mode, online |
| `correct` / `wrong` | Right and wrong answers, errors (with ✓ / ✗) |
| `gold` | Points and rewards |
| `jenn` / `jess` | The two players — nothing else |

**Text on colour.** Use `french-text` for indigo text, never `french`. Use `on-green` for text on green fills, never white.

Accents are often used as soft tints (12–20% opacity fill plus a 30–45% border) behind rows and badges, for example a Jenn leaderboard row.

**Type.** Two fonts, `Fredoka One` and `Nunito` 400/600/700/800. Self-host them in the app (`src/fonts/`) so it looks the same offline; fallback `system-ui, sans-serif`, never `cursive`. Nothing smaller than `text-min` (0.75rem = 12px), uppercase labels included.
- `display` (Fredoka One): titles, questions, French words, numbers, primary buttons.
- `sans` (Nunito): body, choices, inputs, labels. Use weight 700–800 for anything a child taps or reads fast.
- Sizes in rem, base 16px. Title and question sizes scale with the screen; the tokens store the largest size.

**Shape.** Soft and round, in four steps: `radius-sm` for tiles and tags, `radius-md` for buttons, choices and inputs, `radius-lg` for cards and panels, `radius-full` for dots and pills. The app still uses 11 different corner sizes; move them to these four.

## Layout

**Page.** Content is centred, capped at `page-max` (`page-max-wide` on iPad landscape), with a `space-4` side margin. Designed iPad-first; phones get one column below `bp-phone`.

**Spacing.** Use only `space-1` … `space-5`. Inside a card: `space-3`–`space-4`. Between cards: `space-4`. Between sections: `space-5`.

**Screen pattern.** Header → one main task → actions at the bottom. One screen, one job. Button labels say what happens in words, not codes: "Play again · 2 left today", not "Play Again (2)".

**Per-girl content.** Jenn and Jess side by side in two equal columns from `bp-ipad` up, in both orientations; stacked below it. Same order and rows in both columns so a parent can compare across.

**Alignment.** Left-align text, titles and controls within a section. Centre only single hero items (a question, a French word, a result).

**Buttons.** At least `tap-min` tall on touch screens, `touch-action: manipulation` so a fast second tap never zooms, and hover styles only inside `@media (hover: hover)`. The primary (indigo) button carries a thin light border so it never reads as Jess's blue. In a group, one primary action; a destructive action (reset, delete) sits apart, last, in `wrong`, never next to the password field or other buttons of equal weight. Never use `jenn` or `jess` for a button that is not about that girl.

**Kids' screens — every level, every screen.** The main task (tap your name, pick a game, answer the question) sits in the first screen-height, never below the fold. No adult rules, formulas or raw counts (percent thresholds, "Games 0/3 · Tries 0/6"), no code names. Chinese stays exactly where the app shows it today (question hints, Sentence Builder, feedback popups, Study, My Words, Parent Summary) — it is placed there on purpose. Never remove or move Chinese text during a layout change; when two lines are merged, the Chinese from both is kept. Show each answer once. A finished round never looks like a failure: praise first, then what to do next. Answer choices must look tappable (filled `surface2` or a visible border), including in the check-in. Explain rules in kid words inside a "More" section; exact numbers go to the Parent Summary. Topic cards show only icon, name and stars. The big title appears only on the start screen; other screens use a slim top bar. Save/connection status shows as one small icon, and only calls attention when saving fails.

**Parent screens.** Reading comes first, admin second: show the answer (did she play, how well) before any control. Keep settings, data tools and resets in their own section or tab, grouped by job, with each button's explanation right under it.

**Motion.** Gentle float on avatars, a springy lift on player cards, a gold glow for the week leader. All of it stops under `prefers-reduced-motion: reduce`.

## Readability rules

These pairs fail today; the tokens below fix them.

- **Wrong answers, errors, "offline" and the countdown warning use `jenn`** (`.wrong`, `.wrong-part-highlight`, `.parent-fails`, `.lock-error`, offline dot, `.countdown-display.warning`). Fix: `wrong`.

- **`french` text on `bg`/`surface` is 2.3–2.8:1 — too dark.** French words on study cards use it. Fix: use a light indigo for text (the app already has `#c7d2fe`, 9.8:1 on `surface`), keep `french` for fills.
- **White text on `green` is 2.5:1 — fails.** Fix: use `bg` text on green buttons (7.0:1).
- **`text-muted` on `surface2` is 4.0:1** (secondary buttons). Fix: use `text` for small labels on `surface2`.
- **`jenn` / `jess` text on `surface` is 3.8–4.0:1.** Fine at 18px bold and up; avoid for small names.
- **`purple` text on `surface` is 2.6:1.** Use it for borders and fills only.

## Tokens

Defined in `src/styles.css` `:root`. Use the variable, never the raw value.

```css
:root {
  /* colours */
  --bg: #0f172a;
  --surface: #1e293b;
  --surface2: #334155;
  --text: #f8fafc;
  --text-muted: #94a3b8;
  --french: #4f46e5;
  --purple: #7c3aed;
  --gold: #f59e0b;
  --green: #10b981;
  --jenn: #e8445a;
  --jenn-dark: #c0293f;
  --jess: #3b82f6;
  --jess-dark: #1d4ed8;
  --correct: var(--green);
  --wrong: #fca5a5;
  --french-text: #c7d2fe;
  --on-green: var(--bg);
  /* spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  /* size */
  --page-max: 960px;
  --page-max-wide: 1100px;
  --text-min: 0.75rem;
  --tap-min: 52px;
  --bp-phone: 420px;
  --bp-ipad: 768px;
  /* radius */
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-full: 999px;
}
```

| Token | Use |
|---|---|
| `bg` | Page background behind every screen. Main text sits on it at 17:1. |
| `surface` | Cards and panels: leaderboard, player cards, session clock, inputs. |
| `surface2` | Raised layer: answer choices, letter tiles, secondary buttons, card borders, empty progress dots. Muted text on it is only 4.0:1 — use text for small labels here. |
| `text` | Main text on bg, surface and surface2. |
| `text-muted` | Subtitles, labels, stat captions, back button. 7.0:1 on bg, 5.7:1 on surface, 4.0:1 on surface2 (fails for small text). |
| `french` | The app's main colour: primary buttons (white text 6.3:1), game-time value, French words on study cards, focus tints at 12–20% opacity. As text on bg or surface it is only 2.3–2.8:1 — too dark to read; flagged, see README. |
| `purple` | Training mode: train tab, speak button border, the french-to-purple progress gradient. White text on it is 5.7:1; as text on surface only 2.6:1. |
| `gold` | Points, stars, moons, leaderboard title, week-leader glow, unlock banner. 6.8:1 on surface. |
| `green` | Correct answers, study mode, online status dot, green button. 5.8:1 as text on surface; white text on it is only 2.5:1 — flagged. |
| `jenn` | Jenn's colour: her leaderboard row, name, card hover border and progress dots. Also the offline status dot. 3.8:1 on surface — large or bold text only. |
| `jenn-dark` | Darker Jenn shade. Defined in the source but not used by any style yet. |
| `jess` | Jess's colour: her leaderboard row, name, card hover border and progress dots. 4.0:1 on surface — large or bold text only. |
| `jess-dark` | Darker Jess shade. Defined in the source but not used by any style yet. |
| `correct` | Correct answers and success. Always pair with a ✓ mark. Added by the design system; the app still uses green directly. |
| `wrong` | Wrong answers, errors, offline. Much lighter than jenn (2:1 apart) so it never reads as Jenn's colour; always pair with a ✗ mark. 7.7:1 on surface, 5.5:1 on surface2. Added by the design system; the app still uses jenn here. |
| `french-text` | French words and indigo text on bg or surface (9.8:1 on surface). Use french for fills, this for text. Already hard-coded in the app's daily-summary button. |
| `on-green` | Text on green or correct fills (7.0:1). Replaces white, which is only 2.5:1. Added by the design system. |
| `space-1` | Between an icon and its label; inside tags. |
| `space-2` | Between buttons in a row; between list rows. |
| `space-3` | Inside rows and small cards; between a section title and its content. |
| `space-4` | Card padding; page side margin; between cards. |
| `space-5` | Between sections on a screen; padding of large cards and overlays. |
| `page-max` | Content width cap on phones and iPad portrait. |
| `page-max-wide` | Content width cap on iPad landscape (≥768px wide, landscape). Overlays use it too. |
| `text-min` | Smallest text anywhere (12px), uppercase labels included. |
| `tap-min` | Minimum height of anything tapped on a touch screen — kids and parents alike. |
| `bp-phone` | At or below: phone layout, one column. |
| `bp-ipad` | At or above: iPad layout, two columns where content is per-girl. |
| `radius-sm` | Letter tiles, answer slots, tags, back button. Replaces the app's 6–12px corners. |
| `radius-md` | Buttons, answer choices, inputs, rows, tabs. Replaces the app's 12–16px corners. |
| `radius-lg` | Cards and panels: leaderboard, player cards, overlays. Replaces the app's 18–26px corners. |
| `radius-full` | Dots, pills, avatars. |

## Type styles

| Style | Family | Size | Weight | Use |
|---|---|---|---|---|
| `game-title` | display | 3.5rem | 400 | App title on the start screen. Scales 2rem to 3.5rem with the screen; drawn with the jenn → gold → jess gradient. |
| `question` | display | 2.8rem | 400 | The question on game screens. Scales 1.8rem to 2.8rem; up to 3rem on touch screens. |
| `french-word` | display | 2rem | 400 | The big French word on study cards (french colour) and the correct-answer word (green). |
| `screen-title` | display | 1.8rem | 400 | Player names on the select screen and the round-complete title. |
| `feedback-title` | display | 1.6rem | 400 | Right / wrong feedback headline. |
| `overlay-title` | display | 1.4rem | 400 | Titles of overlays and dialogs. |
| `hub-name` | display | 1.3rem | 400 | Player name in the hub header. |
| `section-title` | display | 1.1rem | 400 | Leaderboard title (gold), stat values, points. |
| `card-title` | display | 1rem | 400 | Small section titles, top-bar title. |
| `button` | display | 0.95rem | 400 | Primary button label and mini-game names. |
| `input` | sans | 1rem | 700 | Typed answers. 1.1rem on touch screens. |
| `name-strong` | sans | 0.95rem | 800 | Names in leaderboard rows, in the kid's colour. |
| `choice` | sans | 0.9rem | 700 | Multiple-choice answers. 1rem on touch screens. |
| `subtitle` | sans | 0.85rem | 600 | Subtitle under the game title, in text-muted. |
| `button-secondary` | sans | 0.85rem | 700 | Secondary button label. |
| `back` | sans | 0.8rem | 700 | Back button, in text-muted. |
| `label-caps` | sans | 0.75rem | 400 | Stat captions. Written in uppercase. Raised to text-min. |
| `micro-label` | sans | 0.75rem | 800 | Tiny status labels (session clock, connection bar). Written in uppercase. Raised to text-min. |
