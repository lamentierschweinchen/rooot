# STADIUM-GAPS — punch-list for `apps/web/public/stadium.html`

*Audit Jul 7 2026. Target: the "THE GROUND — stat-center" prototype. Method: read the
file end-to-end, cross-checked every asset path against disk, every `el(id)` against the
DOM, and every stat **family** against `design/STAT-FAMILIES.md` (families ARE the
stadium's places — so the family list is the coverage checklist). Two gaps were flagged
in advance (CONTROL card, per-team balls); both confirmed below, plus the others found.*

**Bottom line:** all referenced assets resolve on disk and all JS↔DOM wiring is intact —
nothing is *broken*. The gaps are **unbuilt / unsurfaced** work, and almost all of it is
**[NEEDS-DESIGN]** (new graphic or a taste/layout call → owner's generate-then-wire loop).
There is **no [MECHANICAL] fix that is also asset-backed**, so per the fix-gate below Job 2
makes **no code changes**. See "What was NOT touched" for the reasoning.

Classification:
- **[MECHANICAL]** — safe now: unambiguous · asset-backed (wires an existing, cleaned,
  approved asset into a ready socket) · no taste call. *Only these get auto-fixed.*
- **[NEEDS-DESIGN]** — needs a new/cleaned graphic, or an aesthetic/layout/placement
  decision. Goes through the owner's loop; do **not** invent here.
- A few items are mechanically *safe* but **not asset-backed** (dead-code hygiene). Per the
  fix-gate ("unambiguous, asset-backed, no taste — else leave a TODO") these are left as
  TODOs, not applied.

---

## Family coverage matrix (the backbone)

Eight stat families (`design/STAT-FAMILIES.md`) = eight places. THE STANDS is the *crowd*
surface (its own lane), cross-linked from the pitch.

| Family | Hotspot | Detail card | State |
|---|---|---|---|
| THE RESULT (scoreboard) | masthead + `#board` (not tappable) | none | score shown; **`scorers` unused** → G8 |
| SHOOTING (goal-mouth) | ✓ ×2 (l.151–152) | ✓ `#sheet-goal` | complete — except **balls socket G2** + owner re-cut **G3** |
| THE DEAD BALL (set pieces) | ✓ `arc` (l.153) | ✓ `#sheet-arc` | complete — owner wants hero completed **G3** |
| CONTROL (pitch body) | ✓ `control` **soon-stub** (l.154) | **none** | **G1 — the headline gap** |
| THE BOOK (centre circle) | ✓ `book` (l.156) | ✓ `#sheet-book` | complete — symbol should be a **whistle** → G9 |
| THE BENCH (dugouts) | ✓ `bench` (l.157) | ✓ `#sheet-bench` | complete |
| PENALTIES (the spot) | ✓ `pens` (l.155) | ✓ `#sheet-pens` | complete |
| THE STUB (provenance) | **none** | **none** | **G7 — absent (likely relic lane)** |
| — THE STANDS (crowd) | ✓ `stands` **soon-stub** (l.158) | **none** | **G6 — cross-lane stub** |

---

## [NEEDS-DESIGN] — owner's loop (prioritized)

### G1 · CONTROL has no detail card *(known gap #1 — confirmed)*
- **What:** The CONTROL family (possession + territory + danger/pressure) has a pitch
  hotspot but **no detail sheet**. `danger`/`highDanger` were deliberately pulled off the
  pitch to live in this card, and the card was never built.
- **Where:** hotspot is a `soon` stub at `stadium.html:154` (`data-place="control"`, icon
  `◑`, positioned `left:62% top:58%`). No `#sheet-control` section exists. Not listed in
  the `CARDS` nav array (`l.406`). Tapping it hits the `SOON` fallback → toast
  "CONTROL · NEXT" (`open()`, `l.418-420`). `attacks.danger/highDanger` appear **only** in
  the FALLBACK object (`l.299`, `l.304`) and are rendered nowhere.
- **Why it matters:** it's one of the eight core families and the pitch already advertises
  the place — tapping a glowing spot that only toasts "NEXT" is the most visible hole.
- **Data is ready, art is not:** `stats-adapter.js` supplies `possessionPct`, `territory`,
  `attacks.danger`, `attacks.highDanger` per side (see `emptySide()` `l.40-47`,
  `onPossession`/`danger` handlers). What's missing is the **hero instrument graphic** — a
  "pitch body / territory-heat" plate to match `goal-empty.png` / `arc.png` /
  `book-ledger.png`. **No such asset exists** in `plate/gens/` or under
  `design/references/stats graphics gens/` (checked: no control/possession/danger/heat
  folder). Needs the owner to generate it, then a card built in the SET PIECES register.
- **Note on the hotspot:** it already exists as a stub, so "build the hotspot" is really
  "promote it from `soon` and confirm placement." Per `STAT-FAMILIES.md` CONTROL = "the
  pitch body"; the centre circle is already taken by THE BOOK (`l.156`), so the current
  right-of-centre spot may be deliberate — **placement is an owner call**, not a bug.
- **Classification:** **[NEEDS-DESIGN]** — hero graphic + card layout + placement.

### G2 · Per-team ball glyphs not socketed into the goal-mouth *(known gap #2 — confirmed)*
- **What:** Goals in the shot-map are drawn with an **inline two-tone SVG ball**
  (`ballEl`, `stadium.html:316`, used at `l.322`), a placeholder. The 16 per-team ball
  emblems are meant to replace it.
- **Where the assets are:** `design/references/stats graphics gens/balls/` — ARG, BEL, BRA,
  CAN, COL, CPV, ENG, ESP, FRA (+`FRA improved`), GHA, MAR, MEX, NOR, POR, USA. **`INDEX.md`
  of that folder marks their socket status `_pending_`** (row "Team balls ×16 … replaces the
  SVG glyph"). They are **not** in `apps/web/public/plate/gens/` and are byte-identical to
  the raw exports in `design/generations/balls/` — i.e. **not yet cleaned/keyed/copied** per
  the folder's own convention ("chosen file is cleaned … and copied into `plate/gens/`").
- **Why it matters:** goals are the emotional peak of the shot-map; a generic SVG there is
  the least "lived-in" mark on the card.
- **Why it is NOT a safe mechanical fix (do not wire now):**
  1. Assets aren't in `plate/gens/` and aren't confirmed cleaned — socketing needs the
     owner's clean-copy-and-key step first.
  2. **Coverage is incomplete:** balls are keyed by tricode, but the *current live default
     is SUI–COL* (`FIX` default `18202783`, `l.246`) and **there is no `SUI.png`**. COL is
     covered; SUI is not. A no-ball fallback must be decided.
  3. `ballEl(tc)` is called with `tc` = `'h'`/`'a'` (side), not a tricode — wiring means
     mapping `HOME.tri`/`AWAY.tri` → filename and choosing size/fallback (`.emb`/`.ball`
     sizing is hand-tuned). That's an aesthetic + asset-prep task.
- **Classification:** **[NEEDS-DESIGN]** — asset cleaning/keying + coverage decision + wiring.

### G3 · GOAL card not re-cut to the SET PIECES register *(owner feedback, Jul 7)*
- **What:** `design/FEEDBACK-jul7-stadium.md §1` — "set pieces read beautifully and should
  be the standard for the goal … stats printed underneath each symbol," and SET PIECES
  should carry **every** dead-ball symbol on its hero, "not just the corners."
- **Where:** `#sheet-goal` (`l.166-174`) is a shot-map + a 2-column footer — not the
  symbol-with-count-underneath register. `#sheet-arc` hero (`l.180`) overlays **corner
  marks only** (`ensureC('corH'/'corA')`, `l.379`); FK/throw-in live only in the list rows.
- **Why it matters:** the owner named the target visual language explicitly; this is the
  active design-lane iteration.
- **Classification:** **[NEEDS-DESIGN]** — layout re-cut (data is all live; nothing to wait on).

### G4 · Pitch hotspot caption chips still present *(owner feedback, Jul 7)*
- **What:** `FEEDBACK §2` — "in the stadium view we don't need to label the spots … remove
  the caption chips; let the symbol + count carry it."
- **Where:** every hotspot still renders a `.cap` (`l.151-158`); `render()` sets
  `capA`/`capH` to "AWAY/HOME GOAL" (`l.371`); CSS `.hot .cap` at `l.43`.
- **Why not auto-removed here:** looks mechanical, but it's a **layout/taste call the design
  lane is actively iterating** (does the pitch still read once labels go? do counts need
  restyling?). Out of this audit's safe-fix scope — belongs to the feedback loop.
- **Classification:** **[NEEDS-DESIGN]** (owner-requested; design lane owns execution).

### G5 · Score not vertically centred in the scoreboard *(owner feedback, Jul 7)*
- **What:** `FEEDBACK §3` — "numbers are slightly high, should be dead centre of the display
  (unless we add a small minute readout underneath)."
- **Where:** `#board` positioned `top:12.1%` on the stadium image (CSS `l.34`; element `l.149`).
- **Why not auto-fixed:** it's an eyeball-against-the-graphic alignment tuned to the
  scoreboard art, and the owner left it **conditional** on whether a minute readout is added.
  A taste decision, not a mechanical one.
- **Classification:** **[NEEDS-DESIGN]** — visual alignment / open product choice.

### G6 · THE STANDS is a soon-stub with no card *(cross-lane)*
- **What:** `stands` hotspot (`l.158`, icon `◍`) toasts "THE STANDS · NEXT"; no
  `#sheet-stands`. THE STANDS is the **crowd** surface (real counts — its own lane;
  `design/BRIEF-STANDS.md`, `count-live.html`), not one of the eight stat families.
- **Why it matters:** same "glowing place that only toasts NEXT" hole as CONTROL; and it
  must honor the honesty law (crowd counts NEVER dressed as %, never blended with market).
- **Classification:** **[NEEDS-DESIGN]** — cross-lane (crowd) design + data source.

### G7 · THE STUB family absent from the stadium
- **What:** THE STUB (provenance — fixture · venue · weather · kickoff · edition · on-chain)
  has **no place and no card** here. Its data isn't in `window.__stats` (it's provenance /
  relic data), so this is likely **by design** (it lives in the relic lane — see
  `back-sheet.html`).
- **Why it matters:** `STAT-FAMILIES.md` says "the families ARE the stadium's places," so a
  missing family is worth an explicit **confirm-intent** rather than a silent omission.
- **Classification:** **[NEEDS-DESIGN]** — cross-lane (relic); confirm it's intentionally elsewhere.

### G8 · THE RESULT has no card and `scorers` is unsurfaced
- **What:** THE RESULT is represented only by the always-on scoreboard (score number). The
  adapter derives **`scorers` per side** (name · type · minute — `deriveScorers`,
  `stats-adapter.js:110`), but stadium.html **never reads it** (0 refs to `scorer`).
- **Why it matters:** "who scored (and how — boot/head/OG)" is live and would enrich the
  result; whether THE RESULT deserves its own "ticket-front" card is a product/design call.
- **Classification:** **[NEEDS-DESIGN]** — surfacing decision (+ possible new card graphic).

### G9 · THE BOOK's symbol should be a whistle
- **What:** `STAT-FAMILIES.md` (and MEMORY) put a **whistle** at the centre circle for THE
  BOOK. The hotspot uses a unicode `▤` glyph (`l.156`). `plate/gens/whistle.png` **exists**
  and is cleaned/socketed per `INDEX.md`, but is **referenced nowhere** in stadium.html.
- **Why not auto-wired:** dropping an image into the hotspot ring (size, transparency,
  contrast on the pitch, whether it replaces the glyph or the card emblem) is a taste call.
- **Classification:** **[NEEDS-DESIGN]** — emblem placement/sizing.

### G10 · Detail cards silently cap at the hand-placed art
- **What:** THE BOOK shows **≤7 bookings/side** (`lines[]` + `slice(0,7)`, `l.333-334`);
  PENALTIES shows **≤6 attempts total** (`zones[]` + `slice(0,6)`, `l.349-350`, so a
  sudden-death shootout past 6 is truncated); THE BENCH has no code cap but the dugout art
  has 6 seats. These are deliberate limits tied to the ruled ledger / 6-zone goal / 6-seat
  dugout graphics.
- **Why it matters:** edge cases (busy card, long shootout) drop marks with no overflow
  affordance. Extending them means re-cutting the art or adding a "+N" affordance.
- **Classification:** **[NEEDS-DESIGN]** — art/layout to extend (fine as a known limit for now).

---

## [MECHANICAL] — but NOT asset-backed → left as TODO (not applied)

### M1 · Stale `SOON` map entries (dead code)
- **What:** `SOON = {book, bench, stands, control}` (`l.408`) is the fallback-toast label
  map, read **only** when a place has no `#sheet-*` (`open()`, `l.420`). `book` and `bench`
  now HAVE sheets, so their entries are **unreachable** — harmless but misleading (implies
  they're unbuilt). Only `control` and `stands` are truly "soon."
- **Fix (owner can apply in 5s):** drop the two dead keys →
  `var SOON={stands:'THE STANDS',control:'CONTROL'};`
- **Why left as a TODO:** the Job-2 fix-gate requires a fix be *asset-backed*; this is
  code hygiene, not asset-backed, and zero user-visible value — so per "when in doubt, leave
  a TODO" it is documented, not applied.
- **Classification:** **[MECHANICAL · not asset-backed → TODO]**.

---

## Housekeeping (not gaps — noted so nobody chases them)

- **Stale handoff note:** `HANDOFF-STADIUM.md` (17:42) lists `cards.list` (who+when) and
  `throwIns` as "pending." Both are now **implemented** in the file (`fillBook` renders
  `bk.player`/`bk.minute` `l.335`; throw-ins `l.383`). No action; the handoff is just older
  than the file.
- **Unused legacy assets in `plate/gens/`:** `glove-arg/cpv/verde.png` (superseded by the
  universal `glove-new.png`, `l.251`), `block-red.png`, and the alt stadium renders
  (`stadium.png`, `-hero`, `-tall`, `-neutral.png` — the page uses the inlined
  `STADIUM_IMG` data-URI with `stadium-neutral-tall.png` as file fallback, `l.296`).
  Harmless; a cleanup pass could prune them.
- **`youngserif.woff2`** sits in `plate/fonts/` but no `@font-face` declares it (only
  Anybody is used). Unused, harmless.
- **Live-first fallback behavior (cross-lane, adapter):** on any `/stadium*` path the
  adapter sets `window.__stats` to an empty aggregate immediately (`stats-adapter.js:58`),
  so the poller (`l.452-456`) swaps the rich inline `FALLBACK` (3–2 demo, `l.298`) for
  honest-empty within ~400ms and fills from the wire. Offline/no-WS therefore shows zeros,
  not the demo. This is intended ("honest-empty at kickoff", `HANDOFF-STADIUM.md`) and lives
  in the adapter lane — flagged only so it isn't mistaken for a stadium.html bug.

---

## What was NOT touched, and why (Job 2 = no code changes)

- The two known gaps (**G1 CONTROL card**, **G2 balls**) are the only **asset-backed**
  candidates, and both are **[NEEDS-DESIGN]**: G1's hero graphic doesn't exist; G2's balls
  aren't cleaned/socketed into `plate/gens/` and don't cover the live default (SUI). Wiring
  either now would mean inventing a graphic or making an asset/coverage decision — explicitly
  out of scope.
- The owner-feedback items (**G3–G5**) are visual/layout calls the **design lane is actively
  iterating** (`FEEDBACK-jul7-stadium.md`); editing them from this audit would collide with
  that loop.
- The only mechanically-trivial item (**M1**) is not asset-backed and near-zero value, so
  it's left as a TODO per the fix-gate.
- **Verification done (static):** every asset path in `stadium.html` resolves on disk; every
  `el(id)` has a matching DOM `id` (0 mismatches); the honesty layers are clean (possession
  = a team time-share, not crowd/market; no counts shown as %). No runtime edit was made, so
  there was nothing new to drive in a browser.
