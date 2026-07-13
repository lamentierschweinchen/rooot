# BRIEF — the FAN SECTION data hooks (predictions · stands · full stats)

*Coordinator → design. For tonight's prototype. Three static-page hooks, same
pattern as `window.__loom`: include the script, read the object, subscribe. The
server already handles everything — this is pure render-against-data. All tested.*

## How to include (opt-in, like the loom)
```html
<script src="/stands-adapter.js"></script>   <!-- window.__stands : the crowd mechanisms -->
<script src="/stats-adapter.js"></script>     <!-- window.__stats  : live match stats     -->
```
They activate on `/`, `/live`, `?loomfeed=1`, `?site=1` (or their own `?standsfeed=1` / `?statsfeed=1`),
and connect to the live match via `?match=<fixtureId>`.

## 1 · PREDICTIONS + THE STANDS — `window.__stands`
```js
__stands.root('home'|'away')        // pick your end
__stands.cheer()                    // tap the roar (batched)
__stands.predict(homeGoals, awayGoals)   // your scoreline — auto-stamped vs the live market
__stands.momentReact(momentId, token)    // one feeling at a drama moment (token from the open palette)

__stands.onState(v => …)      // { rooted:{home,away}, roar:{home,away}, faithSide, connected } — THE ENDS + THE ROAR
__stands.onConsensus(c => …)  // THE CROWD SAYS: c.all + c.byRoot.{home,away,neutral} (mean scoreline, outcome split, modal, DOUBTERS)
__stands.onVerdict(v => …)    // your prediction resolved at FT: 'exact' | 'outcome' | 'wrong'
__stands.onMoment(m => …)     // THE PULSE: a drama window opens { momentId, kind, side, minute, palette[], closesAtMs }
__stands.onMomentResult(r=>…) // the split reveal: r.byEnd.{home,away}.{top, pct, hist} — "their 💀 vs your 🚀"
```
This is every one of the "four things the crowd does" in sheet 013 — the ends,
the crowd-says (fans vs market + doubters), the roar (+ faith), the pulse.
The doubters cut = `1 − byRoot.home.outcome.homeWin`. Market ≠ crowd: never blend them.

## 2 · FULL STATS — `window.__stats`
```js
__stats.onStats(s => …)   // fires on every update; s is also live at window.__stats
```
`s.home` / `s.away` (per side), `s.minute`, `s.pending`:
```
shots:{ total, onTarget, offTarget, blocked, woodwork }   corners   freeKicks
cards:{ yellow, red }   goals   varReviews   attacks:{ danger, highDanger }
territory: 0..1   ← honest PROXY (share of attacking pressure), NOT ball possession
possessionPct | fouls | offsides : null   ← PENDING the TxODDS stat legend (the email)
```
**Honesty for the stats panel:** everything above `territory` is real off the wire.
`territory` is labelled as pressure/territory share, not possession. The three
`null` fields render as **"awaiting TxODDS stat catalog"** — do NOT show 0 or fake
a number. The moment the legend email lands, they fill in live.

## Notes
- Default fixture in both adapters is tonight's; pass `?match=<id>` to target a specific game.
- Each adapter opens its own socket — fine for the prototype; a shared fan-data
  connection is a later consolidation if we want it.
- Bundled-app alternative: `src/data/crowd-client.ts` is the TS equivalent of
  `__stands` if any of these become React components instead of static sheets.
