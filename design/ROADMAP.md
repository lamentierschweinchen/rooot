# ROOOT — the build list

*The whole app, current as of Jul 8. Widened from the surface-polish roadmap to the full picture:
the rooms, the shell that holds them, the profile you keep, and the chain underneath. ~11 days to Jul 19.*

## Where we are
The rooms are built and strong, the honesty is clean, and the thesis thread runs end-to-end —
**choose a side + call the score → live the match → walk away with a keepsake carrying your own
proven call.** What's thin now is **the app *around* the rooms**: how you move between them, and
the profile where what you keep actually lives.

---

## 1 · The rooms (surfaces) — mostly built
- **The door** `gate.html` — choose your side + call the score. ✅ persists your call, walks you in.
- **The ground** `ground.html` — the home: a crowd frame around a dial between the loom & the stadium. ⚠️ still a prototype — needs to become the real hub (see §2) + one-true-score coherence.
- **The stands** `terrace.html` — the immersive terrace. ✅ reworked: colour fields, tifo + YOU tile, roar-as-field, full-time scarf.
- **The loom** `woven-loom.html` — the match woven live → the keepsake. ✅ THE PRESSING (full-time seal + your call woven in).
- **The stadium** `stadium.html` — the pitch as the stat map, 7 places/cards. ✅ mostly; **GOAL re-cut + CONTROL plate-register in flight now**.

## 2 · THE APP EXPERIENCE — the shell that holds the rooms  ← the new focus
*Today each room is its own page; nothing ties them into one app. The ethos (lurk; the game is the
game; minimal chrome) says navigation must be **ambient**, not a tab-bar.*

**Proposed model — the ground is home; the rooms are lenses you turn to:**
- **Enter** through the door (once per match) → you land in **the ground**.
- **The dial** — swipe / tab the centre between **the loom** (live cloth) and **the stadium** (stat map); the crowd frames it top + bottom.
- **Enter the crowd fully** — tap your end → the full **terrace**; back returns to the ground.
- **The cards** — inside the stadium, tap a place on the pitch → its card; swipe between cards; close → the pitch.
- **A quiet corner** — your scarf/emblem in a top corner → **your cabinet** (§3). Always one tap away, never in the way.
- **Full time** — the loom + the stand seal into keepsakes → they land in your cabinet.

**To build:** the ground as the real hub (not a prototype); the enter-crowd gesture; consistent
back/close everywhere; the corner→cabinet affordance; composite coherence (one score/minute across
frame/loom/stadium). *This is the biggest structural gap.*

## 3 · THE PROFILE — your trophy cabinet  ← new build
*"Keep what you lived." The payoff of the whole thing — a personal shelf of what you were there for.*
- **Holds:** your kept **scarves** (one loom keepsake per match), **stand keepsakes**, **pins / relics**, your **record** (calls made + how they resolved), affiliation history.
- **Feel:** a quiet print shelf — the calm register, not a dashboard. Collectible-grade; each item crops out on its own.
- **Chain:** the relics/mints live here (provenance, devnet-proven); coordinator wires the mint.

## 4 · The seams (connecting the rooms)
- **Composite coherence** — one score/minute across frame/loom/stadium (postMessage bridge). *demo-blocker; folds into §2.*
- **Door → keepsakes** — your call woven in. ✅ terrace; loom via coordinator (fixture-aware, from relic receipts).
- **Keepsake → cabinet** — a sealed keepsake lands in your cabinet.
- **The checkpoint rhythm** — half-time ✅ (reads the door's call); OT / pens re-calls still to build.

## 5 · Polish + craft
- **Stadium** — GOAL re-cut to "symbol + count"; CONTROL into the lush plate register. *in flight.*
- **Loom** — living/breathing motion; shootout-board elevation (woven knots, the held breath).
- **Copy crystallisation** — the poetry earns its place once surfaces settle.
- Optional: socket the generated per-team balls (`design/generations/balls/`) over the team-coloured SVG.

## 6 · The chain — coordinator
- The mint (`relic.ts`) + the cabinet's on-chain backing; feed-widening (pressure timeline, penalty-next-team).

---

## Priority to Jul 19
1. **Stadium polish** (GOAL + CONTROL) — *in flight now.*
2. **The app shell / navigation** — make the ground the real hub + the room-to-room flow (§2). The biggest gap.
3. **The profile / trophy cabinet** (§3) — the thesis payoff.
4. **Composite coherence** — folds into #2 (the hub needs one truth).
5. **Copy + craft + loom motion.**
6. **Chain / mint** — coordinator, as the cabinet lands.

## Done this session (Jul 8)
Honesty pass · STARTING XI card · whistle + loom SUB key · THE PRESSING (loom keepsake) ·
THE STANDS rework (immersive terrace) · door→terrace seam (your call, kept) · bench dugout backdrop +
injury→sub rule.

## Who does what
- **Me** — the render/experience: the rooms, the shell/nav, the profile, the polish.
- **You** — taste gate; the generate-loop when a genuinely new emblem is needed (most are done + socketed).
- **Coordinator** — wiring, the mint, feed-widening.
