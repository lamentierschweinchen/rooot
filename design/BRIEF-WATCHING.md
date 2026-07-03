# BRIEF — THE WATCHING EXPERIENCE (owner verdict, Jul 3 night)

**The verdict, verbatim:** "looks like ass at the moment… the design reads as
incoherent card not as interactive and responsive element… we need to think of
the whole thing as a watching experience so the events must be legible and
probably readable (as in a list of the game's events, expandable to smaller
events and how it changed the odds or whatever) plus a view of the social
components."

**The diagnosis, accepted:** we shipped a PRINT. Gate-passed as a print — but a
print is what you hang, not what you watch. The live page is a poster floating
in dead black: no way in, no narrative for someone joining at 60', nothing to
touch, no pulse. The memento law was written for pause/crystallization moments
and we let it swallow the live mode.

**The shift:** ROOOT live = a THEATRE with print DNA, not a print with a clock.
The frame, caption strip, serial — the full §10 anatomy — return at the moments
that ARE prints: pause, GOOOL freeze, half-time, full-time ("pause = a poster"
survives, sharpened). Live mode sheds the heavy chrome and becomes one coherent,
touchable, breathing surface.

---

## 1 · The page (one coherent object, not boxes floating in black)

Newsprint page ground everywhere — NO dead black around the experience (the
letterbox black was reading as unfinished; Press Black stays an ink, not a void).

**Phone (design target first, ~390px):** one column, top to bottom:
1. **Scoreband** (sticky, slim): tricodes + flag-blocks + score (Doto) + clock +
   phase chip + feed state. Always visible.
2. **The stage**: pitch + territories + ends, full-bleed width. In live mode the
   outer loud frame + caption strip are GONE — the stage meets the page like a
   broadcast window, keyline only. Ends stay (they're data).
3. **The cheer bar** (fixed at thumb): ROOT-your-end once → becomes the CHEER
   button (big, round, pop-ball energy) + both ROOTED counters + roar meter +
   `CHEERS COUNT DOUBLE` when faith is on. This is the touch surface — it must
   *feel* like hitting a drum, not clicking a form.
4. **THE LEDGER**: the match, readable (see §2).

**Desktop (≥900px):** two-column grid on the Newsprint page: stage left (~58%),
ledger right (~42%) scrolling independently; scoreband spans the top; cheer bar
docks under the stage. The current gigantic-poppy-poster-in-blackness dies.

## 2 · THE LEDGER (the readable match)

Data: `contracts/ledger.ts` (LedgerMsg stream via MatchCallbacks.onLedger —
already parsing live: goals, cards, subs, shots w/ Woodwork amends, corners,
free kicks, injuries, additional time, danger spells, `possible goal` checking
moments, breaks, shootout kick-by-kick, full-time).

**Anatomy of a row** (print-anatomy list, not a chat feed):
- minute chip (Doto, keyline box, right-aligned digits) · side tick (team-ink
  square, 8px, or neutral blank) · headline (Anybody, weight by magnitude) ·
  detail (Doto small, e.g. "WOODWORK") · **the swing chip** when the market
  moved: `82→91` in Doto inside a keyline pill, colored by the side that gained
  (team ink), with a tiny stepped arrow. Swing = two REAL ticks (OddsSwing) —
  absent when the market didn't speak. Devnet market runs ~60s behind the
  moment; the builder waits for the settled read (~2–3min) and stamps the chip
  in when it exists (rows update, honestly, like a wire report).
- **Majors always visible** (kickoff, goals, cards, breaks, pens, FT).
  **Minors fold**: between majors, a fold row — `▸ 7 MOMENTS · 3 SHOTS · 2
  CORNERS · DANGER 4'` (Doto) — tap to expand that stretch. Expanded minors are
  lighter (smaller type, no swing chip unless real).
- `possible` rows render as held breath: `GOAL? CHECKING…` pulsing dot-fray
  underline → replaced by the confirmed GOAL row (same wire id) or struck.
- amends re-describe in place (`SHOT` → `SHOT — WOODWORK`); discards strike
  through (never silently vanish — the ledger is a record).
- Goal rows are mini-mementos: thicker keyline, score line stamped
  (`ARG 1–0 CPV`), the swing chip mandatory once settled. A goal row should
  make you want the poster.
- New rows PRINT in: discrete slide-stamp (2 steps, ~90ms, ease none), the
  minute chip inks first. `prefers-reduced-motion`: instant.
- Auto-follow: pinned to newest with an unread-count chip when scrolled up
  (`▲ 3 NEW` — tap = jump). Ledger is REVERSE-chronological (newest at top).

**Builder** (`apps/web/src/ledger/`, pure + testable against replay):
consumes onLedger + onOdds; replaces by wire id (goal upgrades); collapses
danger spells (consecutive same-side danger rows within 90s = one row,
minute-span label); matches amend/discard by (kind, original Clock.Seconds,
side); correlates swings: before = last tick ≤ event tMs, after = first tick ≥
tMs + 150s (settle window, documented); publishes an ordered row list via
subscribe(cb).

## 3 · The social strip (the crowd is a fact, not a vibe)

From `CrowdClient/CrowdView` (contracts/ledger.ts): both ROOTED counters
(Doto, live-ticking, discrete steps), the roar meter per end (segmented blocks,
team ink, decayed server-side), faith badge on the trailing end. Counters and
roar are COUNTS — never percentages, never blended with market numbers (the
honesty separation is spatial: market on the pitch, crowd in the strip/ends).
Root choice: first-visit interstitial — two big end-panels (team ink, crest-free
flag-blocks) + "adopt an end for 90 minutes" for neutrals. One tap. Stored
locally + hello'd to the service.
No service reachable → the strip renders its own honest state: `STANDS OPENING
SOON — counts are local` with cheer still tappable (optimistic local count,
clearly italic/ghosted). Never fake a crowd.

## 4 · What stays law

Tokens/type voices/banned list unchanged (SYSTEM.md). Dot-fray unchanged.
Honest geometry unchanged. §10 memento anatomy returns at pause/GOOOL/HT/FT
freezes (the PAUSE button in the scoreband flips live chrome → full print frame
+ caption + serial, poster-ready — THAT's the collect moment; wire the button,
the poster crystallization itself is the relic printers' job later).
`stage-dev`/`relic-dev` harnesses stay as-is.

## 5 · Split

- **Lane A (watching shell):** apps/web/index.html + src/app/ (shell, scoreband,
  cheer bar, social strip, root interstitial) + src/ledger/ (builder + list UI)
  + the stage live-mode chrome switch (frame/caption only in posed states).
  Does NOT touch src/data/ or main.ts (coordinator wires at the end).
- **Lane C (live plumbing):** src/data/ — ReplaySource + stands ingest forward
  parseLedgerMessage into onLedger; crowd-client.ts implements CrowdClient over
  the stands WS; services/stands Fly deploy (token via secrets; if flyctl is
  unauthenticated: build everything, skip deploy, report the blocker as an
  owner action item). Does NOT touch src/app/, src/ledger/, stage/, main.ts.
- **Coordinator:** contracts (done, d30724a), main.ts wiring, the gate, deploy.
