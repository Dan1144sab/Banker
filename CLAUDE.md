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
- **`tests.html`** — browser-based tests: a logic suite for `banker-logic.js` and a DOM
  suite that drives the real `index.html` in an iframe. No test framework, just a small
  custom runner. See "Testing" below.
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
where the Claude Preview tool looks for it) with a `banker` config serving this directory
on port 8744 for the Claude Code preview tool.

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
- The real `applyHandicaps` wiring that `startGame()` uses to populate `G.raw`/`G.chdcp`
  (don't just test `netHandicaps` in isolation — `getStrokes()` and `calcResult()`
  consume what `applyHandicaps` stores, via `chdcpAt()`, so tests should exercise that
  real code path)
- Press/wager multipliers (`holeMult`, `calcMult`, `finalWager`)
- Stroke-index allocation (`getStrokes`)
- Hole results and zero-sum property (`calcResult`)
- Running totals across locked holes (`calcTotals`)
- The roster: `initRoster`/`playerInHole`/`holePlayers`, `nextUnplayedHole`'s
  boundary rule, `addPlayerToGame`, `setPlayerHidden`, `renamePlayers` (including
  a name swap), and `applyRoster` leaving locked holes alone
- Per-hole netting: a departure keeping everyone's dots, a lower player
  joining re-dotting only the holes still to play, and `netBaseAt()` never
  rising across all 18 (see "Netting is per hole" below)
- Hammer: low net per team, halves, natural-birdie double (and the cases that
  must *not* double), the throw/accept/decline state machine, undo, stacking
  presses and their undo window, a departure ending the game, late arrivals,
  renames, save/restore
- The settled-money guard: `totalsUnchanged`, `changedHandicaps`, and a
  `snapshotGame`/`restoreGame` round-trip that rolls back a save which would
  have turned a settled $10 loss into a push
- Who banks: `suggestedBanker` for hole 1, low net (ties, betting strokes, a
  departed low net, hole 15), and most-down with and without Hammer money
- Score entry: `cleanScoreEntry` (the 1-waits rule, 20+ refused, typing over),
  `isValidScore`, `nextOpenScore` wrapping, and `scoreEditImpact` for both Banker
  and Hammer money (and leaving `G` alone)
- Persistence: `serializeRound`/`parseRound`/`loadRound` round-trip a mid-round
  Away game, and `parseRound` refuses corrupt/mismatched saves without throwing

Aim new tests at *branches*, not function names — the gaps that were worth closing were things
like "`calcResult` skips a player who never wagered", "both strokes apply over
18+SI", "`activeHoles` ignores a stale `G.awayHoles` at home", and pressed
payouts flowing through `calcResult` (every earlier `calcResult` case had no
press at all, so `finalWager` was never exercised through a real payout).

The second suite on that page (**Setup Screen Layout Tests**) drives the real
`index.html` in an iframe loaded as `index.html?store=banker.test` (see "Losing a
round"). It covers the setup screen's scrolling and away-SI validation; plays a
hole and runs the whole mid-round editing flow (reopening setup, the locked course
toggle, adding a late arrival, marking a player out, validation, Cancel,
renaming); the New Game confirm, autosave and resume; and the Hammer flow (setup
toggle and team boxes, throw/accept/decline/undo, lock gating, presses, the
leaderboard toggle, a departure ending the game, summary, resume); and score entry
(auto-advance, the clear button) and the full scorecard's edit/warn/cancel flow.
Add DOM-level
coverage there for anything new on the setup screen, hole card or Hammer panel.

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
  *for that hole* (`chdcpAt(p,hi)`) is ≥ that hole's stroke index (SI), and a second
  stroke once it's ≥ `18 + SI`. See `getStrokes()`.
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
- **Roster: who is in play for which holes.** `G.roster[player] =
  {from:<first hole index in play>, to:<hole index they left, or null>}`.
  Everyone who tees off is `{from:0,to:null}`. A player who joins late gets
  `from` = `nextUnplayedHole()`; a player who leaves early gets `to` set to the
  same boundary. Nobody is ever removed from `G.players` — a player who left
  keeps every hole they played, their scores and their winnings, and is simply
  out of play for the rest. **Read a hole's participants through
  `holePlayers(hi)`, never `G.players` directly**, or a late arrival will be
  asked to wager on holes played before they showed up (same class of bug as
  reading `COURSE.holes` instead of `activeHoles()`). `rosterEntry()` falls
  back to "in for the whole round" for any player with no entry, so older
  games and tests that never set a roster behave exactly as before.
  `nextUnplayedHole()` is deliberately *the hole after the last locked one*,
  not the first unlocked hole — unlocking hole 3 to fix a typo must not drag
  the join/leave boundary backwards.
- **Netting is per hole, and the reference only ever moves down.** The scratch
  reference for a hole is the lowest *raw* course handicap among everyone who
  had joined the group **by that hole** — `netBaseAt(hi)`, with a player's
  strokes for that hole coming from `chdcpAt(p,hi)`. Because that set of
  players only grows as the round goes on, the reference can only fall. One
  mechanism, both house rules:

  - **Someone joins off a lower handicap than anyone playing.** From their
    first hole on, the reference drops to them, so the holes still to play are
    dotted exactly as they would have been had the whole group teed off
    together — `chdcpAt(p, hi)` for those holes equals
    `netHandicaps(all indexes)`. Holes already settled never see them, because
    their roster `from` is after those holes, so the money on them cannot move.
  - **Someone leaves.** Their roster `from` is untouched, so they keep counting
    towards the reference for the rest of the round. Nobody loses a dot they
    have been playing under all day.

  Worked example — Garrett 12, Dan 3.1, Ann 21, Sam 8 (raws 14/3/24/9, nets
  11/0/21/6), a scratch player joining at the turn:

  ```
  holes 1-9    reference 3 (Dan)   Garrett 11 · Dan 0 · Ann 21 · Sam 6
  holes 10-18  reference -1 (Pro)  Garrett 15 · Dan 4 · Ann 25 · Sam 10 · Pro 0
  ```

  `netHandicaps([12,3.1,21,8,0])` is `[15,4,25,10,0]` — the back nine matches a
  full-group start exactly, and the front nine does not move at all.

  **Why not a single frozen reference for the whole round** (an earlier
  attempt, `G.netBase`): it keeps settled holes still, but a late arrival below
  it nets out *negative* (a 0 index against a base of 3 plays off −4) instead
  of becoming the scratch player they actually are, and the group is never
  re-dotted around them. Per-hole netting gives the same guarantee without that
  distortion. Don't reintroduce a round-wide base.

  **Why not simply re-net to whoever is currently in play**: that takes strokes
  *away* when the low player leaves. Nets 11 and 6 re-netted to 5 and 0 means
  Garrett no longer strokes on an SI 8 hole — an edge he played under all day,
  gone through no action of his own. Pairwise gaps survive over a full 18 but
  not hole by hole, and a round settles hole by hole.

  `G.raw` is the durable number every netting is derived from; `G.chdcp` is
  only the rest-of-round figure, for the leaderboard's CH and the scorecard.
  **Read strokes through `chdcpAt(p,hi)`, never `G.chdcp`** — same class of
  rule as `activeHoles()` over `COURSE.holes` and `holePlayers()` over
  `G.players`. `chdcpAt()` falls back to `G.chdcp` when `G.raw` has no entry,
  so older games and tests that only set `G.chdcp` behave as before.

  Editing an **Index** moves only that player's raw, and therefore their own
  settled holes; changing the **tee** moves everyone's. Those are the only two
  things that reach back into locked holes, and the mid-round note says so.

- **`calcScores()`** computes each player's front/back/total gross strokes (summed from
  locked holes' `strokes` field) and their **net score to par through the holes
  played**: per locked hole, gross − strokes off the player's **full** course handicap
  (`fullStrokes()`, from `G.raw`) − par. The Round Summary shows it as +3 / −2 / E
  under a "Net Thru N" header (N = locked holes; plain "Net" before any).

  This is deliberately *not* `getStrokes()`: that nets to the group's low player
  (who plays off 0) and is what the **bets** use; a score to par needs the real
  handicap. A plus handicap gives strokes back on the easiest holes (SI 18 first).
  Separate again from `calcTotals()`, which sums the $ betting results, not strokes.

## Who banks, and the bet amounts

- **Banker defaults** (`suggestedBanker(hi)`, applied by `applySuggestedBanker()` at
  the top of `renderGame()` to an unlocked hole with no banker yet):
  - Hole 1: none — the group flips a tee (the card says so).
  - Holes 2–15 (`LOW_NET_BANKS_THRU`): the **outright** low net on the hole before,
    using the betting strokes (`getStrokes`).
  - Holes 16–18: whoever is **down the most, Banker + Hammer combined**.
  - No default until the hole before is locked, on any tie, when nobody is down, or
    if that player isn't in play on this hole. It's only a default — tapping another
    name overrides it, and the override sticks (a hole that has a banker is never
    re-defaulted). When it picks someone who'd already wagered on the hole (e.g. the
    banker left mid-hole), only the new banker's own bet is cleared.
- **Bet amounts** (`BETS`, used for both the limits and the wager pills) skip $15,
  $350 and $450.

## Entering and fixing scores

- **New holes default to a $5–$20 limit** (`DEFAULT_MAX_BET` in `initHoles`).
- **Hole card auto-advance.** The score-box `input` handler runs the typed value
  through `cleanScoreEntry()`: a 2–9 is complete; a **1 waits** (almost always the
  start of 10–19 — a hole in one is rarer, and the scorer can tap on); 10–19 is
  complete; anything over `MAX_SCORE` (19) keeps only the last digit typed, so typing
  over a "4" with a "5" gives 5, never 45. On a complete score, focus moves to
  `nextOpenScore()` — the next player in card order with no score, **wrapping to
  the top** — or the keyboard is dismissed if all are in. The handler deliberately
  does not re-render the card (that would drop focus); it only updates the
  leaderboard, Hammer panel, lock button and the row's ✕ clear button.
- **Full scorecard** (Round Summary → "Show Full Scorecard", `fullCard`): all 18
  holes with Out / In / Tot / Net Thru, horizontally scrolling with the name column
  sticky. Scores on **locked** holes are inputs; a `change` is validated
  (`isValidScore`), then `scoreEditImpact()` (pure: totals before/after, `G`
  untouched) decides — no settled Banker or Hammer money moves → apply silently;
  otherwise a danger modal lists each player's before → after and only "Change it"
  applies. Unlocked holes are read-only here (edit them on the hole card); "·" =
  not in play that hole.

## Mid-round setup editing

The game screen's **Setup** button (`openSetupEdit()`) reopens the same
`#setup` screen with `editMode = true`, to add a player who joined late, mark
one out who left early, or fix a name/Index/tee/SI typo. What changes in that
mode:

- The **Home/Away toggle is locked** (`.lk` on `#coursepills`, plus an early
  return in its click handler). Everything else on the screen is editable.
- The player-count stepper is swapped for **+ Add Player**; each row bound to a
  player already in the game (`data-player`) gets an **In play checkbox**
  (`inPlayToggle()`), with the hint *"Uncheck to remove a player"* under the
  roster. Those rows can only be unchecked, never removed — their holes have to
  stay on the card. A row added in this edit has no history, so it gets an `✕`
  remove button instead.

  This was an IN/OUT **button** first, and it tested fine but read badly: a
  button labelled "IN" is ambiguous about whether it names the current state or
  what tapping it will do, and users hesitated. A checkbox is unambiguously
  state, which is the point — if you restyle this column, keep that property.
- **Nothing is committed to `G` until Save.** `G.tee` and the away
  Rating/Slope/SI are mutated or read straight off the DOM, so `openSetupEdit()`
  snapshots them into `editSnap` and `cancelSetupEdit()` restores them.
- Validation still runs: the existing blank/duplicate-name and Index rules,
  plus `chkEditRows()` — at least two players in play, at most six. The ceiling
  counts players *in play*, not rows, so a round where two left and two joined
  is a legitimate six-player card.
- Re-saving does **not** move an already-departed player's exit hole, or an
  already-added player's join hole — `saveSetupEdit()` only calls
  `setPlayerHidden()` when the flag actually changes. Without that, every
  later save would drag their boundary forward and silently pull them back
  into holes they missed.
- **Every save is guarded against moving settled money.** `saveSetupEdit()`
  takes a full `snapshotGame()` first, applies the edit, then checks: if no
  pre-existing player's handicap changed (`changedHandicaps()` comes back
  empty, i.e. this was a pure join/departure) but a running total did
  (`totalsUnchanged()` fails), the whole save is rolled back via
  `restoreGame()` and the user is told, rather than silently rewriting a hole
  that was already paid out. An Index or tee edit legitimately moves settled
  holes, which is why the guard only bites when no handicap moved. The
  baseline for the comparison is taken **after** the rename step — a rename
  only moves keys, never money, and taking it after means the keys line up.
  The comparison is on **raw** course handicaps (`G.raw`), not netted ones: a
  join legitimately shifts the netting of holes still to play but moves nobody's
  raw, so the guard stays strict for exactly the case it should. With per-hole
  netting it should never fire; it is a net, not control flow, and
  `#editsettled` on the setup card shows the user the same numbers before they
  change anything.
- `saveSetupEdit()` order matters: **renames first** (`renamePlayers()` rebuilds
  every name-keyed map in one pass, so an A→B/B→A swap can't collide), then
  adds, then hidden flags, then `applyHandicaps()`, then `applyRoster()`.
  `applyRoster()` clears wager/press/score slots for out-of-play players on
  **unlocked holes only** — locked holes are never touched.

Editing an Index or the tee changes raw course handicaps (`G.raw`) and therefore
strokes on holes already locked (everything is recomputed through `chdcpAt()`).
That's deliberate, and the mid-round note on the setup card says so.

### Testing the edit flow

The mid-round flow is DOM-level, so its coverage lives in the second suite in
`tests.html`, driving the real `index.html` in an iframe. Two things to know
before adding to it:

- **The suite is one long sequential script sharing one iframe**, so state
  carries from block to block. Each new block starts a fresh round (click
  `#newbtn` **then `#mok`** to confirm the New Game prompt, trim with
  `#pcminus`, fill the rows, click `#teeup`) rather than inheriting whatever the
  previous block left behind. The first block leaves a
  *six*-player away game, which is a real trap: it sits on the six-player
  ceiling, so `+ Add Player` is disabled and any "add a player" assertion
  silently fails.
- A hole is locked directly (`h.locked=true` after setting banker/wagers/
  strokes) rather than by clicking Lock, which keeps the fixtures short. That
  is fine for roster and netting assertions, but if you are testing the lock
  button itself, drive the real button.
- `hammerSVG()` contains a `<text>HAMMER</text>` element, so any button holding the
  graphic has "HAMMER" in its `textContent`. Assert on a child span, not the button.

## Hammer (team side game)

Opt-in on the setup screen (`#hmtoggle`), **even player counts only**. Teams are
the top half vs bottom half of the setup rows — boxed on screen as Team 1 /
Team 2 so the scorer sees them form while typing names. Base bet defaults to
$20 (`HAMMER_BASE`, which also seeds the `#hmbase` input) **per man**. It is entirely separate money from Banker:
`hammerTotals()` never feeds `calcTotals()`. The game leaderboard shows
**Banker only by default**; a "Tap to Include Hammer" toggle (`lbMode`; reads
"✓ Hammer Included" when on) switches it to one
combined total per player with the Banker/Hammer split underneath. The summary
screen is titled **Round Summary** (it can be opened any time mid-round) and
has **one "Settle Up" box** (`renderSettleUp()`, `#smcard.hmsm`, dark Hammer-box
style, headed by the 🏦 bank icon, plus the hammer graphic only when Hammer
was played): Hammer team totals, then a table of Banker / Hammer / Settle up per
player, ranked by settle-up. Without Hammer it's the same box with Total only.

In the game panel, teams are named by their players ("Ann & Ben +$20"), never
"Team 1/2" — the gold/green box colour carries each team through to its throw
button (a large hammer graphic, no text) and its PRESS button. The setup screen's
row boxes still say TEAM 1 / TEAM 2, since names aren't typed yet.

State is `G.hammer` (null when not playing): `{base, teams:[[..],[..]],
presses:[{team,from}], from, log:[18 x [events]]}`. `from` is the hole index
Hammer starts on — read it via `hammerStart()` (saves from before mid-round
starts have no `from` and mean 0). **A hole's Hammer state is
replayed from its event log** (`hammerState()`), so undo is just popping the
last event — keep it that way rather than storing derived fields.

Rules as implemented (agreed with the user):
- Each team's **low net** plays; a tie halves. A net birdie from the other team
  halves a natural birdie.
- **Natural birdie** = gross birdie or better (strokes received don't matter)
  by someone on the **winning** team → doubles the hole once, eagles included.
  "Gross" was our reading of "a birdie made without the aid of a handicap
  stroke" — flagged to the user, not objected to; confirm before changing it.
- Either team may throw first; after an accept **only the team that accepted**
  can throw back. Each accept doubles. **Declining** concedes the value
  *before* that throw and ends Hammer on the hole (no birdie double, no scores
  needed). The hole can't be locked while a throw is unanswered.
- A team that is **down** on locked holes may **press**: doubles every hole from
  `hammerPressFrom()` (the next unplayed hole, never before `hammerStart()`) to 18. **One press per hole** (by either team) — the press
  button disappears until that hole is locked. Presses on later holes stack. The
  latest press can be undone until a hole it covers is locked.
- Roster: **a player who arrives after Hammer started plays Banker only**,
  never Hammer. **If any team member leaves, the Hammer game is over** from the
  hole they left (`hammerEndsAt()` = earliest team member's roster `to`;
  `hammerLive(hi)` is `hammerStart() <= hi < hammerEndsAt()`). Holes before that still
  count; no throws or presses after it. Putting the player back in play
  revives it.
- **Starting Hammer mid-round** (the game's Setup button): the toggle stays open
  while `hammerSetupOpen()` — no Hammer yet and a hole left to play, or a
  Hammer none of whose holes is locked yet (`hammerEditable()`). Turning it on
  shows a team picker (`#hmpick`): two boxes of name chips, tap a name to move it
  to the other team; rows carry `data-team`, and Save is disabled until
  `validHammerTeams()` (even, non-empty). Everyone in play after the edit can
  be picked, including players added in the same edit. Save builds it with
  `initHammerTeams(teams, base, nextUnplayedHole())`, so **holes already
  played have no Hammer at all** — `hammerHole()` is null before `from`, and
  `saveSetupEdit()` rolls back if Hammer totals (like Banker totals) move. The
  same window lets the scorer re-team, change the stake, or switch it off.
  Once a Hammer hole is locked the section is read-only (`.lk`). The tee-off
  setup still uses row order (top half vs bottom half), not the picker.

Teams are stored by name, so `renamePlayers()` remaps `G.hammer.teams`, and
`snapshotGame()`/`restoreGame()` and `serializeRound()`/`loadRound()` all carry
`G.hammer`. Setup-screen state before tee-off is `hmSetup` in `index.html`.

## Losing a round: confirm, autosave, resume

The round lives in `G` (memory) and is **autosaved to `localStorage`** (key
`banker.round.v1`) from `renderGame()` and the score-box `input` handler, once
`gameLive` is true (set by `startGame()`/`resumeRound()`, cleared by a confirmed
New Game). Pure pieces are in `banker-logic.js` (`serializeRound`, `parseRound`,
`loadRound`, `roundSummary`); storage and UI are in `index.html`.

- **New Game** (`#newbtn`) shows an in-page modal (`showModal()`) when a round is live,
  with *Keep playing* focused by default; confirming erases the saved round. A
  `snapshotGame()` is *not* enough for this — it omits course/tee/Away rating & slope,
  which `serializeRound()` adds.
- **On load**, `offerResume()` offers Resume / Start new; Start new asks a second time
  before erasing. A missing, corrupt or other-version save is ignored (`parseRound`
  returns null). **Anything new added to `G` must go into `serializeRound`/`loadRound`
  (and `snapshotGame`/`restoreGame`).** An optional field that old saves simply lack
  (like `hammer`) doesn't need a version bump — `loadRound` defaults it. Bump
  `SAVE_VERSION` only if an existing field changes shape.
- **`beforeunload` only fires when saving failed** (`saveOk` false: private mode, quota),
  because with autosave a reload is recoverable and prompting on every refresh is noise.
- **`?store=<key>` on the URL** uses a separate storage key and disables the unload
  prompt. `tests.html` loads the iframe as `index.html?store=banker.test` so tests never
  touch a real round. Any test that clicks `#newbtn` mid-round must then click `#mok`.

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
  it. The old cream `.smcard` (since replaced by the Settle Up box) had `overflow:hidden`
  (for its rounded corners) and was silently collapsing to `offsetHeight:0` with 6 players, hiding the entire leaderboard with no
  visual indication anything was wrong. Fix/pattern: every direct child of a scrolling
  flex column (`.smtitle`, `.hmsm`, `.smscore`, `.smstats`, `.smlog`, `.smbrow`) needs
  explicit `flex-shrink:0` so content height wins and the container scrolls instead.
  When adding a new child to `#summary` (or any similar scrolling flex column), give it
  `flex-shrink:0` too.
