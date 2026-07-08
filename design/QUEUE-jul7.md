# Queue → design lane (Jul 7) — elements to build, data all ready

*From the coordinator. Owner asked what to queue while the game plays. Each below has its
data live on the wire already — these are RENDER tasks, not data tasks.*

## SHIPPED · THE SHOOTOUT MODE — a first pass is LIVE, elevate it
Owner (Jul 7): *"now we're in penalties. i'm not really sure we have a mode for it. but we
need one if we don't."* → built + deployed. When a match goes to pens the loom frame BECOMES
a board (`L.shootout(state)` in woven-loom.html — a minimal wired version I stood up so it's
not vaporware). **Your canvas now — make the drama land.**
- **Data — live now:** `window.__loomShootout` (also passed to `L.shootout(st)` each kick):
  `{ active, order:[{side:'home'|'away',scored:bool}], home:[…], away:[…],
  tally:{home,away}, firstUp:'home'|'away', done, winner }`. Order is chronological,
  interleaved; home/away are each side's kicks in sequence. Verified against the real
  SUI–COL shootout (SUI won 4–3; winner resolves only on the final kick).
- **What's there:** two rows of stitched knots (filled = scored, hollow = missed), a running
  tally, the winner in gold. Themed (HOME/AWAY, paper/ink/gold). Deliberately plain.
- **Elevate:** the held breath before a deciding kick; motion as each knot lands; make the
  dots feel WOVEN (cross-stitch, like the cloth) not CSS circles; the winner reveal; graceful
  overflow past 5 (sudden death). Maybe the finished cloth sits behind the board as the
  climax. (A "SUI to kick next" tension needs `penalty_shootout_team` widened into the feed —
  ping me and I'll wire it; it's a server change so I've held it.)

## FYI · LOOM EVENTS RE-CURATED (owner flagged the cloth as too busy, Jul 8)
Owner: the loom had drifted busy — it was weaving injuries (~7-12 red crosses a match),
which were never in your legend. Pulled them. The cloth now weaves your legend set exactly
(goals·shots·cards·corners·VAR·offsides·free-kicks) **plus subs** (owner asked to keep subs).
Coordinator side only — your render wasn't touched. One thing for you: **the legend has no
SUB entry** but subs now weave (the green-up/red-down arrow glyph) — add a "SUB" key to the
legend so the vocabulary matches. (Injuries stay OUT of the legend.) Curation lives in one
`WEAVE` config in loom-adapter.js if you want a family flipped.

## P0 · THE STARTING XI — the owner's flagged "big miss"
WHO is playing, shown **before a ball is kicked** — owner's placement: **by THE BENCH**
(it gives that card something to hold pre-kickoff, before subs/injuries exist).
- **Data — live now:** `window.__stats.lineups` = `{ home: [...], away: [...] }`, each a
  `{ name: "Hakimi, Achraf", number: "2", positionId: 2, captain: false }` × 11 (the
  announced XI, `starter===true`, correctly sided). Arrives on join, before any event —
  so the card fills the moment the page opens pre-match. null until the wire names them.
- **Render:** the two elevens (number · name), captain marked; a formation read is optional
  (positionId is the wire's raw code — no formation map yet; number+name is the core).
  Reads as a team-sheet, in the host palette + the stadium register.
- (Coordinator: parser + 'lineup' feed + join-cache all shipped; server broadcast goes live
  at SUI-COL full-time. Nothing else needed from me.)

## The rest, roughly in order
1. **THE STANDS — the crown jewel.** Still unbuilt. `design/BRIEF-STANDS.md` has the
   direction (two terraces of real people). Data: `window.__stands` (root/cheer/predict/
   consensus/roar/faith) — all live server counts.
2. **CONTROL card** (the pitch spot that's a "· NEXT" placeholder): possession%/territory/
   danger detail. Data: `__stats` `possessionPct` (gated), `territory`, `attacks{danger,
   highDanger}` — live.
3. **Goal card in the SET PIECES register** + **SET PIECES showing all symbols** (from
   FEEDBACK-jul7-stadium.md #1) — stats printed under each symbol.
4. **THE PRESSING** — the full-time ceremony + the keepsake it crystallizes into (the mint
   is proven on devnet; coordinator wires it when the room exists).
5. **woven-loom polish** — the living/breathing motion the owner wants; and eventually THE
   COUNT / THE STANDS folded into the new woven world (right now they live at /stadium).

Ping the coordinator for any signal you want shaped differently — all of the above is wired
and waiting.
