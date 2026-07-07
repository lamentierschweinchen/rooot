# Queue → design lane (Jul 7) — elements to build, data all ready

*From the coordinator. Owner asked what to queue while the game plays. Each below has its
data live on the wire already — these are RENDER tasks, not data tasks.*

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
