# ROOOT — Frontend design-state triage (2026-07-13, for the Jul-14 19:00 UTC live demo)

READ-ONLY audit. Judged against `design/REFERENCES.md` (print/cloth/atmosphere, anti-betting-app,
anti-dashboard, anti-AI-gradient) + the Jul-10 `FRESH-EYES-AUDIT.md` teardown + freshest pixels in
`design/checkins/2026-07-11-prod/` and `design/checkins/2026-07-11/`.

## 0 · THE STRUCTURAL FINDING (read this first)

**The demo ships from `apps/web/public/*.html` + adapters — NOT the `apps/web/src/` TypeScript app.**
- `public/*.html` (gate, ground, stadium, terrace, cabinet, woven-loom, showcase) were heavily edited
  Jul 11; they pull data via `stands-adapter.js`, `stats-adapter.js`, `match-read.js`, `crowd-sim.js`,
  `loom-adapter.js`, `seat-adapter.js`. `STATUS-DESIGN.md` states the design lane owns
  `apps/web/public/*.html`. The Jul-10 fresh-eyes audit walked ONLY these files. The landing
  (`index.html`) links to `/gate` and `/demo` (public pages).
- `apps/web/src/` (stage/, loom/, relics/, ledger/, crowd/ [empty], mint/ [empty], data/) was last
  touched **Jul 4**. Per `vite.config.ts` its only build entries are `index.html` + four **dev
  harnesses** (`stage-dev.html`, `loom-dev.html`, `relic-dev.html`, `app-dev.html`). No public page
  imports `/src/`. `index.html` loads no src module (inline fixture script only).
- **Implication:** the brief's mental model (L3 = `src/stage`, L5 = `src/crowd`, L4 = `src/relics`,
  L4b = `src/mint`) describes a track that is NOT what the judge walks. `src/crowd/` and `src/mint/`
  are **empty directories**. The shipping "stage/crowd/relics/loom" all live as standalone HTML pages.
  Worth the owner confirming which track is canonical — but for tomorrow, audit = the HTML pages.

## 1 · SURFACE-BY-SURFACE (shipping = public/*.html)

| Surface | File | Exists | Wired | Polish | The specific gap |
|---|---|---|---|---|---|
| Landing | index.html | Y | Y (fixture manifest) | **Polished / on-ref** | Bauhaus-pop overhead pitch, ADMIT ONE ticket, huge ROOOT, grain, flag-block color fields. Strong. Depends on `fixture.json` being swapped to the right match. |
| Gate | gate.html | Y | Y (live+demo) | **Polished / on-ref** | Ticket-stub grammar is right. Persisting Jul-10 blocker: `ready(){if(side && touched)}` (gate.html:272) — **can't enter without setting a score**; pure lurker locked out. Jargon: "DE-VIGGED", draw labeled "X". NOR side has no flag sticker (ENG does). |
| Ground (hub) | ground.html | Y | Y | Rough-polished | Dial grammar good (LOOM/THE STANDS/STADIUM). But dial hint "LOOM · THE TIDE" = dead night-look language; `◈` cabinet glyph unexplained; footer "ANONYMOUS TEST SEAT" leaks; "XP 0 · 0–0" token; embedded terrace still shows a 2nd seam-score under the masthead. |
| The Stands / Terrace | terrace.html | Y | Y (live) | **Polished (crown jewel) w/ rough edges** | Two Ben-Day halftone ends on black/paper = exactly on-ref. Crown-jewel panel much improved: now labeled "FAN PREDICTIONS" vs "THE MARKET" + sample "FROM n FANS". Remaining: decimal-mean "NOR 1.3–1.3 ENG" still set near the real score; "XP 0" jargon (terrace.html:256); "TAP ANYWHERE TO CHEER" never retires. |
| NEXT GOAL? live-call | terrace.html | Y | Y (live) | **Polished / honest** | Replaces the killed guess-the-crowd quiz. Real crowd split ("NOR 3 · ENG 6 · NO MORE 1 — 9 CALLS IN") + real outcome + personal verdict ("ENG SCORED · YOU CALLED ENG ✓"). No fabricated counts. Good. Note: PRODUCT's rare press-hold "R-O-O-O" call is simplified to this tap-call. |
| Loom — live | woven-loom.html | Y | Y | Honest-empty pre-KO | Pre-kickoff = bare vertical warp (correct "yet to be woven"). Masthead now reads score + KICKOFF/MARKET OPEN (Jul-10 "LIVE lie" fixed). The poster only appears once the match progresses. |
| Loom — sealed keepsake | woven-loom.html | Y | Y | **Polished — THE POSTER of the product** | ESP 2–1 BEL sealed: red/oat-draw/black woven fields, red danger cord, gold-ringed goal medallions at their minutes, minute ruler, "KEPT". Jul-10 blockers (no seal, LIVE-on-keepsake, extrapolated cloth) appear FIXED. Single most beautiful artifact. |
| Stadium — pitch-map | stadium.html | Y | Y | **Rough — weakest core room** | Unlabeled "50 / 50" on the pitch halves (Jul-10 blocker unaddressed); "TAP A GLOWING PLACE TO GO IN" instruction bar still present (= a legend); large dead cream bands above + below the bowl; reads diagram/dashboard, not print-poster. Pre-KO especially bare. |
| Stadium — stat-card deck | stadium.html | Y | Y | Mixed | 6-card swipe deck (team sheet … goal-mouth … market). Goal-mouth is the model plate. MARKET card carries "THE 1X2 · DE-VIGGED" jargon in the subtitle + is empty pre-KO ("PRINTS AS THE MATCH PLAYS"). BOOK/BENCH still break on **null player names** (bake/data gap, flagged to coordinator, not a design fault). |
| Cabinet — full | cabinet.html | Y | Y | **Polished — best surface** | Identity card + stat tiles + NEXT UP ticket + three woven scarves w/ fringe + three-state verdict (✓ EXACT / ≈ RIGHT RESULT / ✗ WRONG) + struck-metal virtue pins. On-ref. Nit: "ROOTED FOR · · SINCE '26" flag tiles render empty (broken slot). |
| Cabinet — empty | cabinet.html | Y | Y | **Polished / honest** | Genuinely designed first-run: "YOUR SEAT IS OPEN", NEED pockets, "the season starts at the door", locked ghost pins. Nit: "LOCKED · 1+" cryptic notation. |
| Showcase (judge door) | showcase.html | Y | Y | **Rough — COPY BLOCKER** | Thesis still sells "**Live market belief runs as a golden tide on a night pitch**" (showcase.html:103) + "the golden tide" (:144). Product has NO night pitch, NO golden tide — it's cream paper + woven cloth + printed crowd blocks. Primed judge sees a mismatch. |
| Spot-tool | spot-tool.html | Y (dev) | n/a | dev tool | Hotspot-placement utility, not a user surface. |
| ROWS (share-link XI) | — | **MISSING** | — | — | No shipping surface. First item on the pre-agreed fallback ladder (shed first) → acceptable, but the "rows / group-chat object" pillar has zero pixels. |
| Relic MINT (scarf→NFT) | src/mint (empty) | **Not wired** | — | — | `src/mint/` empty. "On-chain forever" today = call-receipt / seat provenance (`seat-adapter.js` + `seat-passkey.js`, walletless), NOT a Metaplex relic mint. The keep→mint→case pipeline the loom implies is unbuilt. |
| FT "won the stands" verdict | terrace/cabinet | Partial | Y | rough | Verdict language now in terrace keepsake + cabinet + the NEXT GOAL verdict. The big PRODUCT whistle moment ("They won the match. We won the stands.") is thin as a staged beat. |

Reduced-motion: covered on all surfaces. Consoles: reported clean in Jul-10 audit `logs/` + STATUS (not re-run live here).

## 2 · TOP 5 HURTING "BEAUTIFUL & FUN" (worst first)

1. **Stadium is the weak room** — unlabeled 50/50, "TAP A GLOWING PLACE" instruction bar, dead cream
   bands top+bottom, dashboard/diagram read. It's 1 of 3 dial destinations, so ~1/3 of the live loop.
   The Jul-10 "kill the glyphs / label the numbers / let places be the data" ask is largely open.
2. **Showcase copy sells a product that wasn't built** — "golden tide on a night pitch" on the judge's
   front door. Cheapest fix, high damage: rewrite the thesis in the real print/cloth language.
3. **Pre-kickoff emptiness is back-loaded** — at 0' the loom is bare warp, the stadium is 50/50 + empty
   cards, market says "prints as the match plays". The winning states (woven-loom poster, populated
   cabinet, roaring ends, NEXT GOAL verdict) only exist once a match runs. A live 0–0 demo looks empty
   for its first stretch.
4. **Residual jargon + unlabeled numbers** — DE-VIGGED, 1X2, XP, decimal-mean scorelines under the real
   score. Small individually; together they are the exact betting-app/dashboard tell the brand forbids,
   and they cluster on the two most-looked-at panels (gate market bar, terrace crown-jewel).
5. **Small polish/honesty leaks** — cabinet ROOTED-FOR flag slot empty; "ANONYMOUS TEST SEAT" in the
   ground footer; dial "THE TIDE" dead language; `◈` glyph needing prose; gate lurker-lockout. Each
   chips the premium feel.

## 3 · DEMO-BLOCKING (Tue Jul 14 19:00 UTC) vs NICE-TO-HAVE (Jul 19)

**Demo-blocking:**
- **`fixture.json` is stale** → matchId 18222446 ARG–SUI, kickoffUtc 2026-07-12T01:00Z (a *past* game;
  git: "cutover ARG-SUI for the 03:00 game"). Landing/gate/loom mastheads read this manifest. Must be
  swapped to tomorrow's actual match or the front door shows the wrong/finished fixture. **Ops/content,
  not design — but #1 blocker.**
- **Showcase thesis copy** — if judges open `/demo` walkthrough, rewrite the "golden tide / night
  pitch" lines (showcase.html:103,144) to the built language. ~15 min.
- **Have the beautiful states ready on demand** — a sealed-loom keepsake + populated cabinet + a
  mid-match terrace, so the poster moments show even if the live match sits 0–0 early (the ARG–CPV
  five-goal replay + a sealed keepsake exist — cue them).

**Nice-to-have (Jul 19):**
- Stadium: label the 50/50, kill the instruction bar, fill the dead bands, de-chrome toward the print
  language (biggest craft win, bigger job).
- Purge DE-VIGGED / 1X2 / XP; stop setting crowd means in score type.
- Cabinet ROOTED-FOR flags; ground "TEST SEAT" + "THE TIDE"; gate lurker path; "LOCKED · 1+" voice.
- ROWS + relic-MINT — both on the fallback ladder / out of demo scope; leave shed.

## 4 · HONEST READ

~75–80% of the way to a beautiful demo. The **kept-world** surfaces — cabinet (full + empty), sealed
loom keepsake, gate, landing — are genuinely beautiful and dead-on the references; the loom keepsake
and cabinet are demo-*winning*. The **live-world** is more uneven: terrace is strong and the NEXT GOAL
call is honest + fun, but the stadium drags and every hero surface is bare until the match runs.

**Single biggest visual gap:** the **stadium** — the one room still reading as a diagram/dashboard
instead of the print-poster world every other surface nails, and it's a third of the live dial.
**Single biggest demo *risk* (distinct from the gap):** the beauty is back-loaded to a match in
progress, so a live 0–0 opening looks empty — mitigate by cueing the sealed keepsake / replay / full
cabinet rather than relying on the live wire to reach the poster states on camera.
