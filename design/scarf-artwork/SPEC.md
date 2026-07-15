# Minted-scarf artwork v2 — spec + wiring notes (design → coordinator)

**What this replaces.** `services/stands/src/mint/cover.ts` ships a branded
gradient placeholder as the on-chain asset image. This folder is the real artwork.
**Status: v2, owner-gated "iterate first" — do NOT wire until the owner approves
the v2 samples** (`design/checkins/2026-07-14-design/19-*.png`, `20-*.png`).

**What it is.** `scarf-svg.mjs` — one pure, zero-dep ESM function (plus
`scarf-fonts.mjs`, a generated base64 module of the site's own woff2 subsets):

```js
scarfSvg({
  home:  { tri: 'FRA', color: '#0055A4' },    // manifest team code + first colour
  away:  { tri: 'ESP', color: '#AA151B' },
  score: { h: 2, a: 1 },                      // final score at crystallize time
  dateISO: '2026-07-14',
  serial: '001',
  events: [                                   // OPTIONAL — [] or missing → plain cloth
    { kind: 'goal',   minute: 23, side: 'home' },
    { kind: 'yellow', minute: 64, side: 'away' },   // 'red' likewise
  ],
}) → '<svg …>'                                // self-contained, ~51 KB
```

**v2 over v1:**
- **Brand type rides inside the asset**: Anybody 900 + Young Serif as data-URI
  `@font-face` (the exact subsets from `apps/web/public/plate/fonts/`). Verified
  applying in BOTH document context and `<img>` context in Chromium (shot 20) —
  the path explorers/wallets use. Engines that refuse SVG-image fonts fall back
  to the Arial Black stack = the v1 look, never a break.
- **Event-woven cloth**: goals = gold-ringed medallions, core in the scorer's
  ink, placed at their minute along the cloth with the minute printed beneath
  (marks nudge off the score cartouche / apart from neighbours — the printed
  number stays true). Cards = satin ticks at the top selvage in their colour.
  No events supplied → plain cloth. Never a mark for an event that didn't happen.

**Wiring (after owner approval, ~15 min):**
1. Copy `scarf-svg.mjs` + `scarf-fonts.mjs` into the service (plain ESM, no deps).
2. Where `makeCoverPng`/cover.ts is called in the claim-mint path
   (`seat/mint-scarf.ts` on `your-seat`): upload
   `Buffer.from(scarfSvg(opts), 'utf8')` with **contentType `image/svg+xml`**.
3. Map events from the match record at crystallize: goals with minute + side
   (yellow/red if cheap). If the record lacks them at mint time, pass `[]`.
4. Keep the gradient as last-resort fallback if any required field is missing
   (never invent a score). Then downgrade cover.ts's HONEST LABEL note.

**Samples committed beside this file** (regenerate: `node scarf-svg.mjs`):
`sample-fra-esp.svg` (FRA 2–1 ESP, 3 goals + a yellow) · `sample-sui-col.svg`
(SUI 1–2 COL, 3 goals + a red).

**Still open beyond v2 (owner's call):** weave the full Tier-1 lexicon (shots,
corners, subs as true textile techniques) instead of goals+cards only; Doto for
numerals (not in the repo's font set today).
