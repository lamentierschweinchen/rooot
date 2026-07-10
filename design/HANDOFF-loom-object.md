# WORKSTREAM — THE LOOM as one object

*New instance. You own **one thing**: the woven cloth, close to perfect. You work **with the owner** on
every detail (which events weave in, how, at what size, direction). Terse reports, evidence, gate on the
owner's eye. Do not touch other surfaces except the keepsake seam (§4).*

## The object = ONE cloth, FOUR moments (same SVG throughout)
1. **LIVE** — weaving during the match (shuttle, cords, stitched events, always breathing).
2. **SEALED** — full-time PRESSING (gilds its selvage, prints its seal, stops, trims warp to the final minute).
3. **KEPT** — the scarf on the cabinet rail; tap → unrolls THIS match's sealed cloth.
4. **MINTED** — the on-chain relic (same render is the asset).

It breaks at 3 of 4 joints today. Make the object continuous and beautiful across all four.

## Run it against sample data — NO vacuum
Feed recorded data through the LIVE path and let it weave live. Data exists:
`apps/web/public/plate/arg-cpv-data.js` (**ARG–CPV 3–2 — has goals, use this for the drama**),
`plate/demo-suicol.js` (0–0), `fixtures/*.jsonl`. The loom is driven by `loom-adapter.js` → `window.__loom`.
Develop the live weave now; coordinate the real wire later.

## Calls already made (owner + audit — start here)
- **Direction: infringe, don't pool.** `woven-loom.html:244` leans the cord onto the *dominating* team's
  own side. Flip it: pressure bulges into the **defender's** half, toward the goal it threatens. (Owner call.)
- **One play-cord, not two.** Keep **danger** (the drama); drop the possession cord — possession is a number,
  lives in CONTROL, and has no live source anyway (`POSS —`). Two thin cords smear at phone width.
- **Kill the 12-item legend** (`woven-loom.html:35-37,354-358`). Marks self-identify **on tap** (thumb a
  stitch → "38′ · CORNER · COL"); the **goal mark** is unmistakable enough to teach the alphabet alone.
- **REPLAY, not LIVE** on baked/sample data (`:325`). No blinking live-dot on tape. (Honesty — flagship masthead.)
- **Seal must fire off the wire, not `!M.live`** (`:309`) — demo/sample sets `M.live=true`, so the PRESSING
  never runs in the mode judges walk. Seal on full-time regardless of source.
- **Alive while weaving** — constant gentle motion even in a quiet 0–0 stretch (shuttle travel / live-edge
  heartbeat / last-2-min row shimmer per `design/experiments/LOOM-NEXT.md`). Motion never invents data.
- **Subtitle → one line.** Cut "MARKET IS THE GROUND · PLAY IS THE CORDS · EVENTS ARE STITCHED" — the cloth teaches it.
- **Event weave is the owner's detail pass** — types, sizes, colours, the goal-as-king. Bring options; the owner calls it.
- **Gold audit:** the shuttle uses gold (`:269`); gold's meaning is market/rare — pick ink/chalk for mechanism.

## The keepsake seam (§4 — coordinate, don't freelance)
Tapping a kept scarf (`cabinet.html:254`) must open **that match's** sealed cloth: `KEPT · <final score>`
masthead, no shuttle, no adapter playback, sealed frame always. The cabinet is design's; align the link
(match id + a keepsake payload) — flag what you need.

### → THE CONTRACT (loom side built 2026-07-10; the loom instance)
At THE PRESSING the loom now **writes its own record**: `localStorage['rooot.cloth.<matchId>']`
(`{v:1, at, fx, home:{tri,ink}, away:{tri,ink}, score, dur, src, belief:[[m,h,d,a]…], danger:[[m,share]…],
events:[[m,'h'|'a'|'',type]…], pens:{h,a,winner}|null, ks}` — ~5KB/match, written only for a DRIVEN cloth,
never by the built-in specimen). The kept cloth re-weaves from this record alone.

- **Cabinet (design lane):** link each scarf to `woven-loom.html?keepsake=1&match=<matchId>` — the id is
  the one the adapter ran under (`window.__loomAdapter.matchId`). No id → the standalone specimen; an id
  with no record → an honest "NOTHING KEPT FOR THIS MATCH" state (never another match's cloth).
- **Coordinator (adapter):** keepsake mode makes every `__loom` method inert except `keepsake()` — the
  adapter may still boot on a keepsake URL harmlessly, but skipping when `keepsake=1` saves a socket.
  `__loom.mode('live'|'replay')` now exists (triage C1's loom half is DONE — `?demo=1` defaults to
  replay; call `mode()` for dry-runs/re-served recordings so the masthead never lies).
- **Mint (L4b):** the sealed SVG is the asset — `#loomsvg` at seal time (or a keepsake render from the
  record) serializes directly; the record above is the canonical per-match payload to pin/mint against.
  Flag when you need a `__loom.exportSVG()` hook; trivial to add.

## Read first
- `design/FRESH-EYES-AUDIT.md` §3.2 (loom) + §6.1 (the four-moments pipeline) + §4.2 (gold/honesty).
- `design/NOTE-LOOM-MOTION.md` (owner's alive-while-weaving note + the live data reality).
- `design/experiments/LOOM-NEXT.md` (the STITCH/ROW/MOMENT timescale vocabulary).
- `apps/web/public/woven-loom.html` + `loom-adapter.js`.

## Lane
`woven-loom.html` + this doc are yours. The adapter/wire/final-score/moment-tokens are the coordinator's.
The cabinet keepsake render is design's — coordinate. Screenshot every state yourself; console clean.

## MARGIN — from the design-execution instance, 2026-07-10 15:35 (PRE-FREEZE, blocking for 20:30)

**Your one line for tonight (T1 hands it to you; coordinator review R2 says it cannot wait):**
at `rooot.club/live` the Vercel rewrite hides `?match=` from client JS, so your `/live` default
governs the flagship route. Tonight that default still points at FRA–MAR — over live ESP–BEL data.

In `woven-loom.html` (your current shape, ~:502 and ~:507):
1. FX table — add: `'18218149':['ESP','SPAIN','#AA151B','BEL','BELGIUM','#1A1A18'],`
2. `/live` default — `location.pathname==='/live'?'18209181'` → `'18218149'`

Every other surface's defaults are already bumped + verified (evidence:
`design/checkins/2026-07-10/`). BEL near-ink note: `#1A1A18` as type on cream is fine; never
Belgian yellow `#FDDA24` as raw type on cream (contrast gate C-7); your `mastInk()` already
handles dark inks on the masthead — worth one glance at the BEL colorway before the freeze.

**Margin add (design-exec, 17:0x):** owner's copy law landed — verdict labels are now plain on the
terrace (`✓ EXACT SCORE / ≈ RIGHT RESULT / ✗ WRONG`, and "YOU PREDICTED"). `cabinet.html` resTag
(~:179) should adopt the same three strings — one-line swap, left to you since the file is
mid-flight in your tree.
