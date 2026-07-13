# Coordinator brief — Jul 9 · deltas to your ROADMAP + what's now BUILT

Your `ROADMAP.md` is sharp and we're aligned — especially §2 (ground-is-home, the dial) and
§3 (the cabinet). This is just the **deltas** from a design session with the owner today, plus
the engine that's now built on my side for you to wire against. Not a re-spec — your roadmap holds.

## Built + ready to plug in — the demo engine (new files, live under `?demo=1`)
The crowd + match now exist as globals any surface reads — the SAME shape the real backend uses,
so you wire once and it works for sim or live:

- **`window.__stands`** (simulated crowd, `crowd-sim.js`) — the real pub/sub interface:
  commands `root/cheer/predict/momentReact`; subscriptions `onState{rooted,roar,faithSide,connected}`,
  `onConsensus{all,byRoot,market}`, `onVerdict`, `onMoment`, `onMomentResult`. Two partisan camps
  that diverge from the market (the two buses), roar + crescendo, faith on the trailing end,
  verdict/predict moments. All behaviour is a `TUNE` block (tune by feel later).
- **`window.__match`** (`match-read.js`) — `{ score, clock, market, teams, done, on(fn) }`. The
  one-true score/minute/market source.

→ **This solves your §4 "composite coherence (demo-blocker)":** frame/loom/stadium all read
`window.__match` for one score/minute — no postMessage bridge needed, every surface reads the
same global. Wire the ground-dial's centre + the crowd frame to `__match`/`__stands`.

Both activate on `?demo=1`, driven by a baked sui-col replay (I'm finishing the bake) → the whole
loop plays with **no server**. When there's a real crowd, `crowd-sim` swaps for the real
`__stands`; your surfaces don't change.

## Three fresh items from today (not yet in your roadmap)
1. **The odds card — the market made visible.** A live **1X2 chart** in the stadium: three lines
   (home-win / draw / away-win) drifting across the match — the Polymarket-candidates read. The
   data already flows (it's the de-vigged 1X2 that paints the loom's belief-ground); I'll expose
   it as a series (`__match.marketSeries`) for you to draw. This is the market's home on the pitch
   and keeps the two buses legible on every screen.
2. **The scarf IS the woven cloth — and it's tappable.** In the cabinet, each scarf = the loom
   cloth **frozen at full-time** (the keepsake). Tapping it re-opens that whole match — the loom
   already has a `?keepsake` freeze mode, so the scarf just links to it. The memento isn't a badge;
   it's the re-enterable record. (Your §3 has scarves-as-keepsakes; this adds tap-to-re-enter.)
3. **The cabinet closes the loop forward too.** Besides your record, it surfaces your **next
   fixture** ("SPA–BEL · 20:00 · you're SPAIN") → tap → that gate. Backward (scarf → that match)
   + forward (next fixture → next gate) = the season, not a one-match funnel.

## The dial, sharpened (owner, today)
Your §2 dial is right. One nuance: think of it as **one dial with THE STANDS at home** — full
crowd/fan experience in the centre; lean **left into THE LOOM** (the match), **right into THE
STADIUM** (the numbers); as you turn, the crowd goes full → framing → gone (full-screen lens).
The crowd is a presence you dial up/down, not a room you exit. Naming: **THE STANDS**, not
"terrace," on every surface (you already call it the stands in the roadmap — just keep it off the
`terrace.html` label).

## Coordinator lane — status on your §4/§6 asks
- **Composite coherence** → solved via `window.__match` (above). ✅ ready to wire.
- **Loom keepsake, fixture-aware (your call woven in)** → mine; ties to the relic receipts. Queued.
- **The mint (`relic.ts`) + cabinet on-chain backing** → devnet mint proven; I wire it into the
  full-time ceremony once the cabinet + pressing rooms exist. Owner runs any prod `fly secrets set`.
- **Feed-widening (pressure timeline · penalty-next-team)** → both doable (my lane); they need a
  server redeploy that clears live join-snapshots, so I batch them between live matches. NOT
  demo-blocking (the demo runs off the baked feed). Ping when you actually need either.

## One ask back
I'm holding off editing your surfaces while your WIP is open (gate/ground/stadium/terrace/
woven-loom uncommitted + `cabinet.html` in progress). **Ping when they're at a committed resting
point** and I'll wire the ground-dial's data + the odds card against the engine — surgically, on a
clean base, no clobber.
