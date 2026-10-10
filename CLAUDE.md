# Rolling Green Banker

A single-page golf betting/scoring app for the "Banker" game, built for Rolling Green CC.
Served via GitHub Pages at `dan1144sab.github.io/Banker`.

## Stack

Pure static HTML/CSS/JS. **No build step, no backend, no npm, no framework.**
Node is not installed on this machine — do not introduce npm/package.json/node_modules
or suggest `npm install` as a prerequisite. Everything runs by opening a file in a browser.

## Files

- **`index.html`** — the live app. GitHub Pages serves this by default at the repo root
  URL. Contains all CSS/markup plus a `<script>` with DOM wiring, rendering, and event
  handlers. Pulls in `banker-logic.js` for game logic.
- **`banker-logic.js`** — pure game logic, shared by `index.html` and `tests.html` via
  `<script src="banker-logic.js">`. Keep this file DOM-free (no `document.*`) so it can
  run standalone in the test page. Holds the constants (`COURSE`, `TEES`, `BETS`,
  `HOLES`) and the mutable game state object `G`.
- **`tests.html`** — browser-based test suite for `banker-logic.js`. No test framework,
  just a small custom runner. See "Testing" below.
- **`rg.png`** — Rolling Green CC crest logo, transparent background, black line art.
- **`banker.html`**, **`index2.html`**, **`index13.html`** — not served by GitHub Pages.
  `index2.html`/`index13.html` are byte-identical snapshots of an older `index.html`
  (pre handicap-calculator feature). `banker.html` is a differently-structured, older
  variant (different CSS naming, has a "lobby" screen). Treat these as stale/abandoned
  unless told otherwise — don't assume they need to stay in sync with `index.html`.

## Running locally

Simplest — just open the file:

```bash
open index.html
```

Or serve it (useful if you hit `file://` restrictions, or want a stable URL):

```bash
python3 -m http.server 8000
# visit http://localhost:8000
```

There's also a `.claude/launch.json` one level up (at the parent directory, since that's
where the Claude Preview tool looks for it) configured to serve this directory on port
8744 for the Claude Code preview tool.

**Preview-tool caching gotcha**: the Claude Preview browser aggressively caches
`banker-logic.js` across reloads — editing the file and calling `window.location.reload()`
in the preview is not enough; it can keep running the pre-edit script with no error.
`python3 -m http.server` doesn't send cache-busting headers, so after editing
`banker-logic.js`, navigate with a cache-busting query string
(`index.html?v=<timestamp>`) or `fetch('/banker-logic.js',{cache:'no-store'})` to confirm
the server itself has the new content before trusting what the preview page executes.

## Testing

Before committing, open **`tests.html`** in a browser (same way as `index.html` — no
server strictly required). It loads `banker-logic.js` and runs assertions covering:

- Course handicap formula (`courseHdcp`) and netting (`netHandicaps`)
- The real `applyHandicaps` wiring that `startGame()` uses to populate `G.chdcp`
  (don't just test `netHandicaps` in isolation — `G.chdcp` is what `getStrokes()` and
  `calcResult()` actually consume, so tests should exercise that real code path)
- Press/wager multipliers (`holeMult`, `calcMult`, `finalWager`)
- Stroke-index allocation (`getStrokes`)
- Hole results and zero-sum property (`calcResult`)
- Running totals across locked holes (`calcTotals`)

Green summary ("N passed, 0 failed") = safe to commit. Failures show an expected/actual
diff per case.

When adding new pure logic to `banker-logic.js`, add a matching test in `tests.html`
rather than only verifying by eye in the browser — see the `applyHandicaps` test for the
pattern of testing the real wiring, not a re-implementation of it.

## Game domain notes

- **Course Handicap formula**: `round(Index × (Slope/113) + (Rating − Par))`.
- **Netting**: players' course handicaps are netted down to the lowest player in the
  group, who always plays at 0 (scratch). Because `Rating − Par` is the same constant
  for every player on a given tee, it cancels out entirely when netting — so `Par`
  doesn't actually affect the net strokes used in play (see the "par term cancels out"
  test). This is why `Away` course entry only needs Rating + Slope, not Par.
- **Strokes per hole**: a player gets a stroke on a hole if their net course handicap
  (`G.chdcp`) is ≥ that hole's stroke index (SI), and a second stroke once it's ≥ `18 +
  SI`. See `getStrokes()`.
- **Press multiplier**: par-3 holes are 3x press, par-4/5 are 2x. A player press and a
  banker press both multiply (and compound if both are active) — see `calcMult()`.
- **`G` is global mutable state** (players, holes, handicaps) shared between
  `banker-logic.js` and `index.html`'s inline script. Tests in `tests.html` mutate `G`
  directly between cases, so each test should set up the `G` fields it depends on rather
  than assuming a clean slate.
- **Per-hole par/SI come from `activeHoles()`, not `COURSE.holes` directly.**
  `COURSE.holes` is Rolling Green's hardcoded layout (par + stroke index per hole,
  verified against the club's card: `9,13,3,7,11,1,17,15,5,4,16,10,8,2,14,18,12,6`).
  Away courses only collect Rating/Slope for the handicap formula, but stroke-index
  allocation (`getStrokes`) still needs a real per-hole SI, so the Away section also
  collects a full 18-hole SI sequence (validated as a permutation of 1–18 via
  `isValidSISequence`) and `startGame()` builds `G.awayHoles` from it via
  `buildAwayHoles()` (same pars as Rolling Green, custom SI). `activeHoles()` returns
  `G.awayHoles` when set, else falls back to `COURSE.holes` — always read holes through
  `activeHoles()[hi]`, never `COURSE.holes[hi]` directly, or Away games will silently
  play with Rolling Green's stroke indexes.
- **`calcScores()`** computes each player's front/back/total gross strokes (summed from
  locked holes' `strokes` field) and their net score (`total - G.chdcp`). This is
  separate from `calcTotals()`, which sums the $ betting results, not strokes.

## CSS/layout gotchas

- Inputs used as flex children (`.ni`, `.hi`) need `min-width:0`. Without it, flex items
  default to `min-width:auto`, which for `<input type="number">` is wider than for text
  inputs — causing overflow past the container edge in a `display:flex` row even though
  `flex:1` is set on both. Hit this when the Away course's Rating/Slope boxes overflowed
  past the course-pill edges above them.
- `rg.png` is transparent-background black line art. To show it in white on a colored
  background (e.g. the selected/green state of the Course pill), use
  `filter: brightness(0) invert(1)` rather than swapping image assets.
- **Full-screen scroll pattern**: `html,body{overflow:hidden}` is set globally (the
  `#game` screen is a fixed `height:100vh` app shell), so any other screen that needs to
  scroll (`#setup`, `#summary`) must do it on *itself*, not rely on body scroll. The
  working pattern is on the `.active` rule: `height:100vh;overflow-y:auto` (not just
  `min-height:100vh` — a `min-height` lets the element grow past the viewport with
  nothing to scroll it, which is exactly the bug that made 6-player setup unable to
  reach "Tee It Up"). Copy this pattern verbatim for any new full-screen view.
- **Flex children with `overflow:hidden` can get squashed to 0 height instead of
  scrolling.** `#summary.active` is `display:flex;flex-direction:column;height:100vh`.
  Per the flexbox spec, a flex item whose own `overflow` is not `visible` gets an
  automatic minimum size of `0` — so when total content exceeds the viewport, the flex
  algorithm shrinks that item toward 0 *instead of* letting the container scroll past
  it. `.smcard` has `overflow:hidden` (for its rounded corners) and was silently
  collapsing to `offsetHeight:0` with 6 players, hiding the entire leaderboard with no
  visual indication anything was wrong. Fix/pattern: every direct child of a scrolling
  flex column (`.smtitle`, `.smcard`, `.smscore`, `.smstats`, `.smlog`, `.smbrow`) needs
  explicit `flex-shrink:0` so content height wins and the container scrolls instead.
  When adding a new child to `#summary` (or any similar scrolling flex column), give it
  `flex-shrink:0` too.
