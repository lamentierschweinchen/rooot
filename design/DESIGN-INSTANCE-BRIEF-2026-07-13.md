# ROOOT — Design instance brief (2026-07-13)

You are the **design lane** for ROOOT, running as your own session. This brief is
self-contained: context, worklist, laws, and the exact workflow. The coordinator
(a parallel session) integrates and merges; the owner approves pixels.

**Clock:** live match tomorrow — **France–Spain, Tue Jul 14, 19:00 UTC** (fixture
`18237038`). Hackathon deadline Jul 19, 23:59 UTC.

---

## What ROOOT is (north star, owner-confirmed today)

A **fan experience** in a printed **paper + cloth** world — match programme, ticket
stub, woven scarf. Root once, cheer constantly, call rarely. The **market is a plain
number**; the **crowd is a real counted roar** — never a percentage, never blended.
At full time the fan **keeps what they lived**: woven scarf, pin, sealed poster —
on-chain provenance, worthless to flip.

**The "golden tide on a night pitch" thesis is RETIRED.** If you see tide/night-pitch
language anywhere (docs, REFERENCES.md headlines), it's drift being fixed by the
coordinator — the built product and `design/PAPER-AND-CLOTH.md` are the truth.
Platform value = the genuinely interesting data it generates + the engagement
mechanism. Plain words always: call things what they are.

## Where the product lives

**Everything ships from `apps/web/public/*.html` + adapter JS** (stands-adapter,
stats-adapter, loom-adapter, seat-adapter, match-read, crowd-sim). The
`apps/web/src/` TypeScript tree is dead/being archived — **never work there**.
Surfaces: `index.html` (landing) · `gate.html` · `ground.html` (hub) ·
`terrace.html` (the stands) · `woven-loom.html` · `stadium.html` · `cabinet.html` ·
`showcase.html` (judge door).

Run it: `npm run dev` in `apps/web`, browse the pages directly. Live data comes from
the stands service; most surfaces also run honestly empty pre-kickoff.

## Read before touching pixels

1. `design/references/` + `design/PAPER-AND-CLOTH.md` — the binding visual law.
2. `scratchpad/design-state.md` — the fresh surface-by-surface audit (what's
   polished vs rough, with file:line).
3. `design/COPY-BRIEF.md` — per-surface copy proposals with the offending strings.
   **Note:** the owner reviews copy **on the surface, as pixels** — never as an md.
   The brief is your instruction set, not the review artifact.
4. `design/FRESH-EYES-AUDIT.md` — the Jul-10 teardown (some items fixed since).

## The worklist (priority order)

### 1 · Showcase thesis rewrite — BLOCKER
`showcase.html:103` sells "Live market belief runs as a golden tide on a night
pitch"; `:144` "the golden tide". The product has neither. Rewrite the thesis in the
real paper/cloth language (COPY-BRIEF §1 has a proposed line). The judge's front door.

### 2 · Jargon purge, surface by surface (owner approves each)
The betting-app tells, clustered on the most-viewed panels — replace with plain words:
- **Gate** — "DE-VIGGED" caption on the market bar; draw labeled "X" → "Draw".
- **Stadium market card** — subtitle "THE 1X2 · DE-VIGGED"; also its pre-KO empty copy.
- **Terrace** — "XP 0" (`terrace.html:256`); the decimal-mean crowd scoreline set in
  score type near the real score (a mean dressed as a scoreline — banned form; make it
  a counts statement); "TAP ANYWHERE TO CHEER" never retires after first cheer.
- **Ground** — dial hint "LOOM · THE TIDE" (dead language); "ANONYMOUS TEST SEAT"
  footer leak; unexplained `◈` glyph; "XP 0 · 0–0" token; the duplicate seam-score
  under the masthead.

### 3 · Cabinet fixes
"ROOTED FOR · · SINCE '26" flag tiles render **empty** (broken slot — render bug);
"LOCKED · 1+" ghost-pin notation is cryptic → say what unlocks it, plainly.

### 4 · Gate fixes
**Lurker lockout:** `ready()` (`gate.html:272`) requires a score call — a pure lurker
can't enter. Lurking must be a complete experience (law). Let them through honestly.
Also: NOR-side flag sticker missing (ENG has one) — generalize for FRA/ESP tomorrow.

### 5 · Stadium de-dashboard — the weak room (Jul-19 scope, SKETCH FIRST)
Unlabeled "50 / 50" on the pitch halves; "TAP A GLOWING PLACE TO GO IN" instruction
bar (a legend = failed design); dead cream bands above/below the bowl; overall
diagram/dashboard read in a print-poster product. **Sketch-gate with the owner before
building** — this is taste work.

### 6 · Collect flow micro-copy (review-only for now)
The terrace full-time scarf now has a single **Collect** action (real walletless
on-chain mint, built today on branch `mint-claim-ui`): Collect → Collecting… →
Collected ✓ · "view it ↗" / failure: "Something went wrong — try again." Review the
states live once deployed; flag anything off. Don't rework its logic.

### 7 · Minted scarf artwork
The on-chain asset's image is a **placeholder gradient** (`services/stands/src/mint/cover.ts`)
while the beautiful scarf is CSS-woven in-page. Produce the real woven-scarf artwork
(export pipeline / static render per fixture) — **coordinate with the coordinator**
for the mint-side wiring; your part is the artwork + spec.

### 8 · Pulse split-reveal — verify or descope
PRODUCT promises a 6-emoji ambiguous react with split-screen reveal; the terrace has
reacts but the reveal is unverified. Check what actually renders; either polish to
promise or tell the coordinator to descope it in docs.

### 9 · Pre-KO warmth (nice-to-have)
Every hero surface is honestly bare before kickoff (loom = empty warp, stadium =
empty cards). If time allows: a "programme cover" pre-match state so a 0–0 opening
isn't blank — honest (fixture facts only), never fake liveliness.

### 10 · Demo-prep visuals (with coordinator)
Tomorrow's camera needs the poster states cued: sealed keepsake, populated cabinet,
mid-match terrace. The replay/service side is the coordinator's; flag what you want
staged visually.

## Laws (violations don't ship)

1. **Honesty.** Market number vs crowd roar, never blended, never a fake count, no
   fabricated players/events. Empty states stay honestly empty.
2. **Reference-driven.** Judged against `design/references/` — betting-app /
   dashboard / AI-gradient looks die in review.
3. **Plain words.** No DE-VIGGED, 1X2, XP, devnet, mint, glyphs needing legends.
4. **No FIFA marks.** Team names + unicode flags; "the tournament".
5. **The crown jewels are done — don't restyle them:** loom sealed keepsake, cabinet,
   gate ticket grammar, landing. Fix only what the worklist names.
6. **Don't touch:** `contracts/`, `services/stands/` (except coordinating on #7),
   `apps/web/src/` (dead), the Collect button logic, `fixture.json` (coordinator's).

## Workflow (owner-gated — this is how the owner works, non-negotiable)

- Branch: **`design-pass-jul14`** off `main`. Commit freely there.
- **Per surface:** implement → run it → screenshot every state you changed →
  `design/checkins/2026-07-14-design/` → present pixels to the owner → owner
  approves → coordinator merges. **Nothing reaches main unseen.**
- Sketch-gate anything taste-level (stadium #5) before building.
- Verify like a user: dev server, console clean, **mobile viewport first** (this is
  a phone product), reduced-motion respected.
- Report short: conclusions, file paths, screenshots. No file dumps.

## Coordination

The coordinator session is running parallel lanes tonight (fixture cutover, service
deploy, docs reconciliation, archive sweep). If you need a seam changed
(service data, mint pipeline, fixture manifest) — ask via the owner rather than
editing outside your lane. `stadium.html` stat-card player names were empty in prior
games — that's a **data** bug (lineups lost on restart), already being fixed
service-side; don't design around it as if permanent.
