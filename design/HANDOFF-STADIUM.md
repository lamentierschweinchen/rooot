# HANDOFF — the stat-center is ready to deploy (design lane → coordinator)

*Jul 7 2026. The stadium stat-center is built, verified, and self-contained. This is
everything you need to put it in front of a live match. Nothing here touches
`contracts/` or `main.ts` — it's a static page that consumes your published feed.*

## What it is
`apps/web/public/stadium.html` — the pitch **is** the stat map. Tap a place → zoom into
its family card; ‹ dots › page between cards; ✕ back out. The whole stadium (bowls +
pitch) **recolours to the two teams** at runtime, split at the possession share. Reads
`window.__stats` via `stats-adapter.js` (already loaded on the page), falls back to an
ARG–CPV replay when there's no feed.

## To deploy for the live test
1. **Add the fixture to the `FIX` table** in `stadium.html` (one line — it's the only
   thing gating correct teams/colours; without it the page defaults to USA–BEL):
   ```
   '<matchId>': ['HOME','HOME NATION','#homePrimary','AWAY','AWAY NATION','#awayPrimary'],
   ```
   Primary = the shirt colour used for that end's bowl + pitch half.
2. Serve `/stadium.html?match=<matchId>`. It auto-connects to the adapter; cards fill as
   events arrive and read **honest-empty at kickoff**.
3. No build step — the stadium image is inlined (`plate/gens/stadium-data.js`, a data-URI)
   so the canvas recolour works even opened straight from disk. All assets are already in
   `apps/web/public/plate/gens/` (goal-empty, arc, book-ledger, dugout, subboard,
   stretcher, pens-goal, freekick, throwin, glove-new, stadium-data.js).

## Live now vs. pending
- **Live:** stadium map · possession/territory recolour · scoreboard · GOAL-MOUTH ·
  SET PIECES (corners + free-kicks) · THE BOOK (counts) · THE BENCH (subs + injuries,
  real roster names) · PENALTIES · card-nav.
- **Two fields would light up the rest** (both already on the wire, just not surfaced):
  - `cards.list: [{player, type, minute}]` per side → THE BOOK shows *who + when* (right
    now it shows a chip per count, no name). Data is there: `yellow_card`/`red_card`
    carry `Data.PlayerId` (→ roster name) + `Clock`.
  - `throwIns` count per side → SET PIECES throw-in row (shows `—` until then). On the
    wire as `throw_in` events (`Participant` + `Clock` + `Data.ThrowInType`).
- **Not built yet (show a "· NEXT" toast):** CONTROL (possession/territory/danger detail)
  and THE STANDS (the fan experience) — both in progress on the design side.

Ping the design lane for anything you want surfaced differently; the card sockets read
the `BRIEF-STATS.md` shapes exactly and won't change shape as the to-adds land.
