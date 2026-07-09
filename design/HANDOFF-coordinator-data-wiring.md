# Data wiring — design → coordinator handoff

*From: **design lane** (owns `apps/web/public/*.html` + `design/`) · Date: 2026-07-09 ·
For: **coordinator** (data / adapters / bake / `contracts/` / `main.ts`) ·
Aligns with: `docs/superpowers/specs/2026-07-09-your-seat-identity-retention-design.md` (YOUR SEAT).*

Two asks to make the shipped design surfaces read **real** data instead of sample. Both live in your
lane. I don't touch `contracts/`, `apps/web/src/main.ts`, the bake, or the engine adapters — I wire my
HTML surfaces to whatever interface you expose. **P0** is a small, independent unblock; **P1** is your
YOUR SEAT MVP with the exact read shape my cabinet needs (so we don't discover a mismatch late).

---

## Already working — please don't re-do

- `window.__match` — score, clock, market 1X2, `marketSeries` ✓
- `window.__stats` — shots, corners, freeKicks, throwIns, cards **counts**, goals, attacks
  (danger/highDanger), territory, possessionPct, fouls, offsides, penalties, varReviews, lineups/XI ✓
- `window.__stands` — rooted home/away, roar, faithSide ✓
- The starting **XI carries player names** ✓

My surfaces already consume all of the above correctly. The only gaps are below.

---

## P0 — event player-names are `null` in the bake  ·  *quick; unblocks THE BOOK + THE BENCH*

**Symptom (verified live just now in `?demo=1`):** events carry `minute`/`type` but **every name is `null`**.

```js
__stats.home.cards.list[0]  → { player: null,  type:'Yellow', minute:50 }   // want: player
__stats.home.subs.moves[0]  → { inName: null, outName: null,  minute:45 }   // want: inName / outName
__stats.home.scorers[0]     → null                                           // want: scorer name
```

The **XI kept its names**, so this reads as a **re-bake regression that dropped only *event* names** —
not a render bug (my surfaces print exactly what they're given).

**Impact:** `stadium.html` → **THE BOOK** renders every booking as `– 50′`, and **THE BENCH** renders
subs as `– → –`. Two otherwise-finished cards look broken purely on this.

**Ask:**
1. Re-bake the SUI–COL demo (`plate/demo-suicol.js`) with event player-names attached to
   `cards.list[].player`, `subs.moves[].inName`/`outName`, and `scorers[]`.
2. Confirm the **live** adapter (`match-read.js` / the stats adapter) passes those names through on the
   FRA–MOR premiere path too.
3. If the upstream feed genuinely lacks event names, say so — I'll design an honest name-less fallback
   (minute + type only). But please check first: the names **showed earlier this session**, so the data
   likely exists.

**Done when:** in `stadium.html?demo=1&match=18202783`, THE BOOK shows real surnames on bookings and
THE BENCH shows real in/out names. I'll screenshot to confirm at runtime (build-green ≠ done).

---

## P1 — a read interface for the cabinet + a `?demo=1` stub  ·  *your YOUR SEAT MVP #1 & #5*

`cabinet.html` is fully built visually but **100% hardcoded sample** ("sample shown until wired"). To
swap sample → real I need the data behind a JS interface my static HTML can read — **exactly like
`__stands` / `__match`** — **and a demo stub** so I can build + verify on the replay like every other
surface (I can't build against an interface that only exists on live/claimed).

### `window.__seat` — identity (already in your spec; I read these)

```js
window.__seat = { profile: { displayName, sides:[tri…], since }, status, claim(), on(fn) }
```

### `window.__album` — the room's data (name it whatever; these are the fields the cabinet renders)

```js
window.__album = {
  record:  { lived, calls, nailed, loudestNight },   // the 4 record tiles (numbers + a tri)
  scarves: [                                          // the rack, newest first
    { home, away, hc, ac, hi, ai, score, comp, date, call, result, serial }
    // result: 'hit' | 'miss' | 'neutral'
  ],
  next:    { home, away, kickoff, side } | null,      // NEXT UP fixture (null → I hide the block)
  on(fn)                                              // re-render on change
}
```

### The demo stub — `demo-seat.js`

Load it under `?demo=1` alongside `demo-feed.js` / `crowd-sim.js`. It should populate `__seat` +
`__album` with the sample **that cabinet.html currently hardcodes** — so this is literally "expose the
existing values through the interface." Copy these verbatim:

```js
window.__seat = {
  status: 'anon',
  profile: { displayName: 'lukas', sides: ['SUI','ARG'], since: "'26" },
  claim(){ /* stub: resolve to a fake pubkey */ }, on(){}
};
window.__album = {
  record: { lived: 12, calls: 34, nailed: 21, loudestNight: 'ARG' },
  scarves: [
    { home:'ARG', away:'CPV', hc:'#2049AA', ac:'#C8504D', hi:'#F3ECDB', ai:'#F3ECDB', score:'3–2', comp:'WORLD CUP', date:"08 JUL '26", call:'ARG 3–2', result:'hit',  serial:'014' },
    { home:'SUI', away:'COL', hc:'#D52B1E', ac:'#E8B10A', hi:'#F3ECDB', ai:'#1A1815', score:'1–1', comp:'GROUP F',   date:"04 JUL '26", call:'SUI 2–1', result:'miss', serial:'009' },
    { home:'BRA', away:'NOR', hc:'#F7D117', ac:'#BA0C2F', hi:'#1A1815', ai:'#F3ECDB', score:'0–1', comp:'GROUP C',   date:"01 JUL '26", call:'the upset', result:'hit', serial:'003' }
  ],
  next: { home:'SPA', away:'BEL', kickoff:"SAT 20:00", side:'SPAIN' },
  on(){}
};
```

Once the stub exists, I rewrite `cabinet.html` to render entirely from `__seat`/`__album` (drop the
hardcoded arrays), keeping the demo visually identical — then the live path fills the same interface
from the fan's owned assets per your spec, and the cabinet is real for free.

### Claim hook

The loom's full-time **PRESSING** ceremony is built on my side; when `__seat.claim()` exists I wire the
"take your seat to keep it" tap to it. No new UI needed from you — just the method.

**Done when:** `cabinet.html?demo=1` renders the sample **entirely from the interface** (nothing
hardcoded), and changing a stub value changes the page. I'll verify at runtime.

---

## Explicitly NOT blocking

- **Seven virtue pins → real counters** is **post-MVP in your own spec** (§9). Pins stay sample for now
  — honest, the footer says so. When you reach it, the 7 counters they need are: matches **rooted**,
  scorelines **nailed**, **upsets** vs market, total **cheers**, moment **reads**, matches **lived**,
  **outnumbered** ends. (Thresholds live in `design/GEN-PROMPTS-FLAGS-TROPHY.md`.)
- Flags are done (cabinet + gate); SPA carries the modern constitutional arms — owner confirmed keep.

## Coordination note

`contracts/` and `apps/web/src/main.ts` are yours; if wiring `demo-seat.js` into the `?demo=1` loader
touches `main.ts` or the gate/ground `document.write` blocks, that's your edit — tell me if you'd rather
I add the `<script>` tag to my surfaces once the file exists. Ping me the moment the stub lands and I'll
wire + screenshot the cabinet the same day.
