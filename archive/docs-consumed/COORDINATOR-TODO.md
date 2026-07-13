# Coordinator's list — the wire, the data, the chain, the deploys

*My working backlog (owner asked me to keep one). The design lane's queue is
`design/QUEUE-jul7.md`; the owner-facing checklist is the Artifact. This is what's on ME.
North star: `design/experiments/thesis-jul6.src.html` — "lose the match, win the stands."*

## State (live now)
Loom (woven-loom) + stadium + count all live, airtight-on-join, themed, event-dedup
fixed, HT-freeze + ET-belief fixed. Server records both streams (locally). All five
fixture defaults on today's game. `__stats` carries every computable family + the XI.
**Jul 7 shipped:** free kicks weave only when they LED TO DANGER (correlation, not the
mostly-empty FreeKickType); **THE SHOOTOUT MODE** — the loom becomes a penalty board on
StatusId 12 (`window.__loomShootout`, verified vs the real SUI–COL 4–3; join-replay
already covers penalty-kick so it's airtight). Design briefed to elevate the board.
**Jul 8:** owner flagged the loom as too busy — re-curated events via a `WEAVE` knob in
loom-adapter.js. Injuries OFF (never in design's legend; ~7-12 crosses/match — the clutter);
now weaves design's legend set + subs. By-second placement kept (design's demo uses decimal
minutes → the sub-minute x is intended). Verified vs recorded col-gha via server replay mode.
OPEN: free kicks kept ON but owner leans redundant — one flag flips. Legend needs a SUB key.
NOTED: `/live` default is still the finished SUI-COL (18202783) while other games go live —
the stale-default (#11); proper fix needs the /fixtures endpoint (a server change, best done
between matches so it doesn't clear live join-snapshots).
**Jul 8 — landed design's night session** (`7b4ae2e`, deployed, unrouted): THE GATE
(`/gate`), THE STANDS (`/terrace`), THE GROUND composite (`/ground` — crowd frames a tabbed
loom/stadium), + the **CONTROL card** (stadium G1 gap — verified live on my `__stats`
attacks.danger/possessionPct). Loom got an embed mode. Wiring still owed (my lane), in order:
1. **gate + terrace/composite scoreline + market → `__loom`** (real match data, no cold-start).
2. **composite embeds → live match** — thread `match`/`ws`/`loomfeed` into the iframes; gated
   on #11 (else it shows the dead default, worse than the demo).
3. **crowd frame → `__stands`** — COLD-START: no real crowd yet, so sample beats empty until
   there is one; also gated on design's 3 open Qs (mini-preds? gamification? crescendo?).
4. **gate lock → `__stands`/on-chain** = THE GATE (#12).

---
## P0 — now / next
- [ ] **XI server broadcast** — deploy the stands server (fly) at SUI-COL FT so the
  `lineup` message goes live for the next match. (Client + parser + cache already shipped.)
- [ ] **Server-side recording** — recorders run on my machine, session-bound. Move to the
  always-on server so an uncaptured match is impossible. TxLINE keeps no history; this is
  the one irreversible gap.
- [ ] **THE GATE locks** — pick-an-end + call-the-score must LOCK at kickoff and notarize
  (the thesis's "claim on the future starts when the future does"). `__stands.root/predict`
  exist; wire the kickoff lock + the on-chain record of both, labeled.
- [ ] **THE PRESSING mint** — at FT the relic (scarf + scorecard + stubs) crystallizes
  on-chain. Metaplex Core devnet mint is proven; wire it into the FT ceremony when design
  builds the room. Owner runs `fly secrets set` for any prod key (classifier blocks me).

## P1 — the product's actual argument + robustness
- [ ] **The three comparisons** — OPTIMISM GAP (predict − market) · FORESIGHT (belief −
  result) · UPSET (market − result). Wire them first-class, labeled, market≠crowd. This is
  the JUDGE; right now only raw streams surface, not the gaps that ARE the story.
- [ ] **Dynamic live-fixture default** — expose the server's active fixtures (a `/fixtures`
  endpoint or on `/health`) so `/live`, `/stadium`, `/count` auto-follow the live game
  instead of a per-day hardcode. Every default has a `TODO(P2)` marker.
- [ ] **Weave the ready threads** — INJURIES (side+player+outcome already parsed) and the
  HYDRATION/COOLING BREAK (Action=comment · Data.Text="Water-drinking break" → blue water
  thread; NOT a suspend fallback). Coordinator emits the events; design weaves.
- [ ] **Phone pass** — the friend hit it on iPhone. Real device test: cord tap-targets
  (~8-9px), touch-scroll on THE COUNT, dark mode, the DNS/VPN edge (offer a vercel.app
  fallback if custom-domain resolution bites more people).

## P2 — polish + the season
- [ ] **THE ALBUM** — matches-attended on a rail (the retention loop). Needs the match
  history / relic index. Design's room; I provide the record.
- [ ] **positionId → formation** — the XI carries the wire's raw position code; a map (→
  GK/DEF/MID/FWD or a formation) would let design draw a team-sheet shape. Nice-to-have.
- [ ] **Copy audit** — every string against the thesis feelings + the voice law (plain,
  adult, show-don't-tell). Shared with design; I flag data-driven strings.

## Submission (task #5 — by Jul 16)
- [ ] Tech doc (the architecture: one server, two buses, the honesty law, the seams).
- [ ] Demo video (the loop: GATE → MATCH → PRESSING → ALBUM).
- [ ] Repo cleanup + README; the honesty/feedback write-up.
- [ ] (Deploy — done; keep it green through the tournament.)

## Data limits (honest, not fixable by us)
- No disallowed-goal REASON (offside vs foul) on the wire — we show "overturned."
- possession% is a computed time-share, gated (never a false 100/0); territory is an
  attacking-pressure proxy, labeled as such.
- TxLINE coverage can start late (ARG-EGY H1 was never sent) — upstream; we flag + record.

## Tracking
Tracker: #5 submission · #8 THE STANDS · #10 XI · #11 durability · #12 GATE+PRESSING ·
#13 comparisons · #14 threads · #15 copy+device. Design queue: `design/QUEUE-jul7.md`.
