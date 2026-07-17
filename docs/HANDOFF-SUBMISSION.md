# ROOOT — Submission Handoff (the one brief)

*2026-07-17 · deadline **Jul 19, 23:59 UTC** · you are the closing instance*

You own the final push. This file is the single source of truth for scope, state,
decisions, and pitfalls. Read order: **this → `AGENTS.md` (laws + lanes) →
`docs/PRODUCT.md`**. Everything else in `docs/`/`design/` is reference or history —
consult when needed, don't re-audit it. Before changing anything, spend 15 minutes on
**rooot.club** on a phone-sized viewport and form your own read of the current state.

## The product, two lines

A free, live World Cup fan experience: a paper-and-cloth **match programme that comes
alive** — the market's read (a plain %) beside the crowd's roar (real counts, never
blended), and at full time the fan keeps what they lived: a woven scarf minted to
them on Solana devnet, walletless (passkey), theirs forever.

## Calibration (owner steer — overrides older doc tone)

**Honesty means the data core is real** (feed / taps / chain). It does **not** mean
affidavit copy, label-policing, or blanked demo names. Percentages for fan
predictions are fine; lively sample data is fine; "predictions" not "calls"; US
English. When an honesty instinct fights fun, default to fun; take genuine values
calls to the owner. Law 8 is hard: the generated art IS the surface — overlay data
onto it, never rebuild it in code; if data won't fit, request a regen.

## State — verified live on prod (rooot.club)

- **Collect flow end-to-end:** gate → surfaces → loom weaves the real recorded
  ENG-ARG feed (~30s) → seals → COLLECT (Face-ID passkey) → devnet mint where the
  on-chain image is the fan's real woven cloth (788×2034 capture) → cabinet renders
  it from the on-chain album. Owner's proof scarf: Nº 025.
- **Stadium in replay:** real final stats (corners 1/6 authoritative, fouls 15/11 as
  a bar, possession 44/56 vs territory 38/62 as distinct metrics), full team sheets +
  named events (recovered lineups), THE MARKET prints the resolution (ENG 0 · DRAW 3
  · ARG 96).
- **Scarf unroll:** quick 0.8s ease-out reveal (not a match-paced replay).
- Anchors + sentiment records land on devnet; night report:
  `docs/night-reports/18241006.md`.
- Prod deploy status at handoff: **Vercel and Fly both current with `main`.**
- The last cold UX review (390×844, taken BEFORE most fixes above):
  `design/reviews/2026-07-16-cold-ux/report.html` — scored 4.6/10 with the visual
  language praised; its structural complaints drive the TODO below. Don't re-fix
  what's already fixed — verify against prod first.

## Owner decisions — locked 2026-07-17 (don't relitigate)

1. **Friend layer → roadmap** (`BACKLOG` §11). Not in the submission.
2. **Social share IS in, minimal:** a SHARE action on the kept scarf (post-collect +
   cabinet) — native share / copy-link carrying the minted PNG + rooot.club.
3. **Confidence dial stays:** one line at the gate saying what it does + surface it
   on the full-time card. No new mechanics.
4. **/live between matches must be honest — no fake "LIVE".** Build the
   between-matches front: the **last match's end-results programme** (sealed cloth,
   final stats, the market's resolution — ENG-ARG `18241006` is the one complete,
   polished match) plus **"next match at …"**; possibly a "browse previous" shelf.
   The judges' guided path is `/demo`. Design latitude is yours — sketch-gate the
   direction with the owner before building (he reviews pixels, not prose).
5. **Demo video: yes** — 60–90s, time-boxed **Jul 18**. Product polish first.

## The TODO, ranked

**T1 — credibility (do first, all bounded):**
1. Sweep every fan-visible surface for prototype copy ("sample shown until wired",
   "live wire · waiting", etc.) — replace with real states or honest quiet copy.
2. Cabinet empty-state contradiction: it says "your first match awaits" with empty
   scarf pockets while a match card sits right below. Reconcile the resolve logic.
3. Cheer must give visible feedback everywhere it's offered (the UX review tapped
   and nothing moved — the signature action can't be dead).
4. Every Collect entry resolves: pending → success (receipt) or recoverable failure.
   No silent stalls on any path (loom, terrace, demo).

**T2 — trust + polish:**
5. The ground: ONE coherent timeline — score, minute, my prediction, crowd average,
   presence counts, cheers, minutes-watched must never contradict each other.
6. Legibility pass at 390px: tiny wide-tracked caps, beige-on-beige metadata,
   edge-clipped tabs, fixed chrome starving overlays. (Known: team-sheet panel
   overflows at exactly 375px — pre-existing.)
7. Kill the full-page black-wipe transitions on small taps (they read as crashes).
8. Label the stadium hotspots (they look decorative; the cards behind them are the
   product's best information design) + fix clipped card bottoms.
9. Front door: one plain line that this is a **second screen** ("keep the broadcast
   on — this is the crowd and programme beside it"). Loom: a small printed key
   (bands = the market's read, knots = your calls, selvage = your side).
10. The between-matches `/live` front (decision 4).
11. The scarf share (decision 2).

**T3 — submission materials:**
12. Refresh `docs/SUBMISSION-tech-doc.md` (still Jul 14): add the woven keepsake,
    fan personalization (root + calls in the cloth), the on-chain capture mint, the
    sealed replay architecture.
13. The 60–90s video (Jul 18).
14. Submission form: live link, repo, tech doc, night report + devnet explorer
    links, video.

## Pitfalls — learned the hard way, don't relearn

- **Verify at runtime like a user** (law 7). Static-serve `apps/web/public` (the
  `loom-verify` config in `.claude/launch.json`), phone width, console clean,
  screenshot. **Restart the server / hard-reload after JS edits** — a cached adapter
  cost us an hour. Owner sees pixels at every check-in; nothing ships unseen.
- **Replay architecture:** `/live`, `/loom`, `?replay=1` → the baked
  `plate/demo-engarg.js`, **hard-bound to 18241006** (`?match` is deliberately
  ignored in replay — a Codex fix; don't "repair" it). `?demo=1` → SUI-COL
  (`demo-suicol.js`). Four adapters carry replay branches: `loom-adapter`,
  `stats-adapter`, `match-read`, `stands-adapter`.
- **Seat stack order matters:** `nacl` → `seat-passkey` → `seat-adapter` on any
  surface that mints. The cabinet is read-only and loads `seat-adapter` alone.
  `seat-adapter` owns `window.__seat`/`__album`; no surface fetches `/seat/*` raw.
- **Mint:** fallback order capture → scarf-svg → gradient; the capture re-renders
  the DEPLOYED loom, so it needs prod sealing to work. Mints are idempotent per
  (pubkey, matchId) — an early gradient mint under an old passkey won't upgrade.
- **Bake:** `scripts/bake-engarg.ts` (release gates: terminal FULL_TIME + the real
  1–2 final). Lineups were recovered via `scripts/recover-engarg-lineups.ts`.
  `fixtures/*.jsonl` are local-only (gitignored) — never commit them.
- **Secrets (law 5):** `.secrets/` never in git/argv/logs; the TxLINE token is read
  in-process only. Fly secrets that must survive: `ROOOT_SCARF_COLLECTION` (losing
  it empties every cabinet), `HELIUS_RPC_URL` (DAS album).
- **Deploys are manual:** `vercel --prod` (repo root) for the surfaces;
  `flyctl deploy --config services/stands/fly.toml` **from repo root** (Docker
  context needs `contracts/`). Stands is currently in replay-safe mode; it does not
  need touching for T1/T2 work.
- **Flagged and consciously deferred** (BACKLOG §12 — don't rediscover as new):
  mint lacks ownership-proof auth (devnet-acceptable); capture-fail mints the
  scarf-svg (law-8 tension, owner call pending); album fails open without the
  collection env; PRF-less devices can't claim; 2.6MB hero feed; 2nd-half odds pin
  near 48' (cosmetic).

## Commands

```
npm run typecheck                        # root: whole repo, must stay green
cd apps/web && npm run dev               # vite dev (or static-serve public/)
npx tsx scripts/bake-engarg.ts           # re-bake the replay feed (gates enforced)
vercel --prod                            # deploy surfaces (manual, owner-sanctioned)
# feed truth (authoritative finals):
node -e 'global.window={};require("./apps/web/public/plate/demo-engarg.js");const f=global.window.__DEMO_ENGARG;console.log(f.filter(m=>m.msg.type==="score").pop().msg.ev.raw.Score)'
# owner album (read-only):
curl -s "https://rooot-stands.fly.dev/seat/album?pubkey=FkcC9Ai4Zbgg1nP1HEHrrffVaRrdNS69Nn8RWXCehtEn"
```

Work T1 → T2 → T3 in order, check in with pixels, keep `main` green, and deploy as
batches land. The product is already good — your job is to make the first ten
minutes prove it.
