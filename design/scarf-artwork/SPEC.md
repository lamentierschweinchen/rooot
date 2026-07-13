# Minted-scarf artwork — spec + wiring notes (design → coordinator)

**What this replaces.** `services/stands/src/mint/cover.ts` ships a branded
gradient placeholder as the on-chain asset image (its own docstring says the real
per-match scarf is the design lane's job). This folder is that artwork.

**What it is.** `scarf-svg.mjs` — one pure, dependency-free ESM function:

```js
scarfSvg({
  home:  { tri: 'FRA', color: '#0055A4' },   // manifest team code + first colour
  away:  { tri: 'ESP', color: '#AA151B' },
  score: { h: 2, a: 1 },                     // final score at crystallize time
  dateISO: '2026-07-14',                     // fixture date
  serial: '001',                             // edition Nº (existing serial source)
}) → '<svg …>'                               // self-contained, ~6KB
```

Composition per `design/PAPER-AND-CLOTH.md`: cloth (team-ink halves, woven ribs,
fringe, black selvages, **gold FT seal line**) mounted on paper (cream grain,
plate frame, hallmark row). Only fixture facts render — no fake liveliness, no
FIFA marks, team codes only. Pale team colours are auto-darkened to stay legible
(same rule as the gate masthead).

**Wiring (coordinator's side, ~15 min):**
1. Copy `scarf-svg.mjs` to `services/stands/src/mint/scarf-svg.ts` (it is plain
   ESM; add types or keep as .mjs import — no deps either way).
2. In the claim-mint path (`seat/mint-scarf.ts` on `your-seat`, or wherever
   `makeCoverPng`/`cover.ts` is called): `Buffer.from(scarfSvg(opts), 'utf8')`
   uploaded with **contentType `image/svg+xml`** — Irys + Metaplex metadata and
   explorers render SVG images fine. Keep the gradient as the fallback if any
   field is missing (never invent a score).
3. Remove/downgrade the HONEST LABEL note in cover.ts once wired.

**Samples** (both committed beside this file, screenshots in
`design/checkins/2026-07-14-design/17-*.png`, `18-*.png`):
- `sample-fra-esp.svg` — tomorrow's fixture, FRA 2–1 ESP · Nº 001
- `sample-sui-col.svg` — SUI 1–2 COL · Nº 018

**Known v1 limits (say the word and I iterate):**
- Type is system Arial Black, not Anybody/Doto — embedding WOFF2 as a data URI
  adds ~30KB and pixel-perfect brand type; deferred until you confirm the
  direction.
- The weave is pattern-suggested (ribs + warp), not the loom's true event-woven
  cloth. A future version can take the match's event list and weave the real
  marks in — same function shape, more inputs.
