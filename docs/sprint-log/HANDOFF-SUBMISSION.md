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

## How to work — the failure mode to kill (owner, 2026-07-17)

Past instances **"just worked away and produced useless results."** The owner wants
a thinking partner, not a task-runner. The loop, every time:

1. **Orient + verify** on prod (phone width) before touching anything.
2. **Think** — form your own view of what matters and why.
3. **Suggest** — bring the owner a short, opinionated plan: what, in what order,
   what you'd push back on, and how each piece serves the coherent product (a
   paper-and-cloth match programme, honest at the core, fun on the surface).
   Sketches/pixels for anything visual.
4. **Agree scope together**, then execute in **small steps** — each verified at
   runtime, each sense-checked against the vision before moving to the next. If a
   step stops making sense mid-way, STOP and say so; don't finish it beautifully in
   the wrong direction.
5. **Check in with evidence** (screenshots) at every unit. Nothing ships unseen.

Your **first deliverable is not code** — it's your read + proposed plan after the
prod walk. Challenge this brief where the product disagrees with it.

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
- Two external reviews, complementary lenses (both preserved as evidence):
  - **UX walkthrough** (390×844, pre-fixes): `design/reviews/2026-07-16-cold-ux/report.html`
    — 4.6/10; visual language praised, structural complaints drive T2.
  - **Site analysis** (infra/SEO/trust, Jul 17): `design/reviews/2026-07-17-site-analysis.md`
    — its 3 criticals are verified-real on prod TODAY (hero 404, stale "TONIGHT"
    copy, missing landing favicon) and drive the top of T1. Its verdict on the
    voice + honesty framework: "the moat — don't touch."
  Don't re-fix what's already fixed — verify against prod first. Known ghosts: the
  share mechanic is already decided-in (below), the post-match state is decision 4
  (the analysis independently confirms it), and the "scarf missing from the
  SCARVES shelf" sighting (Nº 027, post-fix) needs a **fresh-device verify** — it
  may be an album-refresh race after mint, not the old bug.

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

## The TODO, ranked — propose your sequencing to the owner before executing

**T1 — broken or credibility-killing (all verified, all bounded):**
1. **Landing hero 404** — `/plate/gens/stadium-hero.png` is the landing's CSS
   background and doesn't exist; the fold is a beige void. Restore/repoint + a
   fallback color so a missing image can never void the fold.
2. **Landing favicon** — favicon.svg exists and is linked on /demo + /gate, not on
   `/`. One line.
3. **The between-matches posture** (decision 4, widened by the site analysis): the
   stale-fixture whiplash covers the LANDING ("TONIGHT 21:00" ×3) and GATE ("GAME
   STARTS AT 21:00") too, not just /live. Full-time state everywhere: "FULL TIME —
   see how it wove → the programme", next match when known, fixtures retire after
   the whistle.
4. Sweep every fan-visible surface for prototype copy ("sample shown until wired",
   "live wire · waiting", etc.) — real states or honest quiet copy.
5. **Cabinet trust:** (a) verify with a FRESH device that a collect lands on the
   SCARVES shelf immediately — the Jul-17 reviewer's Nº 027 (post-fix!) didn't →
   suspect an album-refresh race after the mint resolves; (b) the "first match
   awaits" empty-state contradiction while a card sits below.
6. Cheer must give visible feedback everywhere it's offered — the signature action
   can't be dead.
7. Every Collect entry resolves: pending → success receipt or recoverable failure.
   No silent stalls on any path.

**T2 — trust + polish:**
8. The ground: ONE coherent timeline — score, minute, my prediction, crowd average,
   presence, cheers, minutes-watched must never contradict each other.
9. Legibility/contrast pass at 390px: tiny tracked caps, gold-on-cream (the 9px
   "TONIGHT" strip likely fails WCAG AA), edge clipping, fixed-chrome overlay
   starvation, visible labels for the selected confidence pips. (Known: team-sheet
   overflow at exactly 375px — pre-existing.)
10. Kill the full-page black-wipe transitions on small taps (they read as crashes).
11. Label the stadium hotspots + fix clipped card bottoms.
12. **The three positioning lines** (copy, high leverage): the door says what it is
    in one line (the demo already has it: "Follow the games live. Predict, cheer,
    and collect." + second-screen framing); a **no-stakes line** near the market
    numbers ("a reading, never a wager — no stakes here"); an **ownership line** at
    collect ("minted to your passkey on Solana devnet — yours on any device with
    your Face-ID"). Plus the small loom key (bands = the market's read, knots =
    your calls, selvage = your side).
13. Cold-start stands: replace "FROM 1 PREDICTION · 0 here" with honest
    tournament-wide aggregates (real totals only — pooling/invites are the
    roadmapped friend layer).
14. The scarf share (decision 2) — share text in the voice: "I called ENG 1–2 —
    scarf Nº 027."
15. **Web basics batch** (cheap, mostly config): robots.txt + sitemap.xml; 301
    www→apex (or canonical); compress og.png (912 KB → <300 KB); searchable title +
    `SportsEvent` structured data; immutable caching for `/plate/*`; PWA manifest +
    apple-touch-icon.
16. Minimal trust footer → one about/contact/terms page in the programme voice
    (table stakes for anything on-chain).

**T3 — submission materials:**
17. Refresh `docs/SUBMISSION-tech-doc.md` (still Jul 14): the woven keepsake, fan
    personalization (root + calls in the cloth), the on-chain capture mint, the
    sealed-replay architecture.
18. The 60–90s video (Jul 18).
19. Submission form: live link, repo, tech doc, night report + devnet explorer
    links, video.

*Roadmap, not now (BACKLOG): reminders/push/.ics, desktop device-frame + side
panel (sketch-gate if time appears), localization.*

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

Start with the prod walk, then bring the owner your plan — your sequencing of
T1/T2/T3, what you'd cut or add, and why each piece serves the programme. Agree it,
then work in small verified steps, pixels at every check-in, `main` green, deploy as
batches land. The product is already good — your job is to make the first ten
minutes prove it, without ever working ahead of the shared plan.
