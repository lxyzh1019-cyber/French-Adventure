# French Adventure

A French learning game for Jenn and Jess, played on iPad in one or two
20-minute sessions a week.

## Editing the app

**`index.html` at the repo root is a generated file. Do not edit it.**
GitHub Pages serves it, so it must stay committed — but every change belongs
in `src/`:

| What you want to change | File |
|---|---|
| Page markup | `src/index.html` |
| Styles | `src/styles.css` |
| Game logic, vocabulary, screens | `src/app.js` and the modules under `src/` |

```bash
npm install       # once
npm run dev       # live preview at localhost, hot reload
npm run build     # regenerate index.html from src/
npm run verify    # tests + "index.html matches src/"
```

Then commit both `index.html` and your `src/` changes together.
`npm run deploy` runs the build and stages both for you.

### If you hand-edited index.html in an emergency

That is a legitimate thing to do — editing `index.html` on github.com fixes
the live app in under a minute when something is badly broken. The app is
fine; the repo is just inconsistent, and CI will go red to say so.

To put it right: make the same change in `src/`, run `npm run build`, and
commit. CI goes green. Nothing is lost.

## Layout

```
index.html          generated - do not edit
src/
  index.html        page markup
  styles.css        all styles
  app.js            game logic
  state/            persistence, sync, Firebase bootstrap
tests/              node --test
scripts/            CI guards (drift, inline handlers)
```

## Checks

- `npm test` — unit tests, plus a check that every function named by an inline
  `on*` handler is exported onto `window`. Under ES modules that is no longer
  automatic, and a missing export means a silently dead button.
- `npm run check:drift` — rebuilds and compares against the committed
  `index.html`. Fails if they differ in either direction.
- `npm run test:browser` — end-to-end checks in a real browser: every game
  mode renders, an interrupted round resumes, French apostrophes reach the
  speech API, every level is reachable, and a stored profile survives a load
  with nothing lost.

All three run in CI on every push and pull request. `npm run verify:all`
runs the lot locally.

## Known risks

See [`docs/known-risks.md`](docs/known-risks.md).
