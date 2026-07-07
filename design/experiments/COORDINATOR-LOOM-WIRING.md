# Coordinator brief — wire the Living Loom to a live match

## What this is
The Living Loom is the chosen live surface: the match **woven in real time** — continuous
throughlines (belief · possession · pressure · tempo · crowd) with events woven in as
highlights (an embroidered ball at each goal + a GOOOOL eruption). Prototype:
`apps/web/public/loom-proto.html` (self-contained; preview:
https://claude.ai/code/artifact/ae8f2e46-c93b-4da5-ae6a-4ea4fa5f8b87). It boots on the
ARG–CPV replay by default and now exposes a global **`window.__loom`** feed API. Your job:
connect the live TxLINE streams (your lane — token, SSE, existing parsers) to that API and
validate it against the next live fixture. The rendering/design lane owns the loom internals;
you own the wire → `__loom.*`.

## The interface — `window.__loom`
Call `__loom.live()` once to switch to live mode (freezes the replay controls; the clock is
driven by the wire). Then push as data arrives:

- `__loom.clock(minute, running)` — match clock, decimal minutes (scores `Clock.Seconds/60`).
  Drives the live edge / the shuttle. Call on every clock tick + clock_adjustment.
- `__loom.odds({minute, pHome, pDraw, pAway})` — one **de-vigged 1X2 tick** (sums to 1), from
  the `1X2_PARTICIPANT_RESULT` StablePrice rows; `minute` = match minute at the tick's `Ts`.
  THE belief throughline — push every tick.
- `__loom.pressure(minute, side, weight)` — a danger/possession-grade. `side` 1=home/part1,
  2=away/part2. Weights: possession .5 · attack 1 · danger 1.5 · high_danger 2. → pressure cord.
- `__loom.possession(minute, side)` — one possession-family event (count per side/min) → the
  possession share cord.
- `__loom.tempo(minute)` — call once per wire event of any kind (event-rate → tempo rail).
- `__loom.event({minute, kind, side, type, et})` — a woven highlight. `kind` ∈
  goal|shot|card|var|corner. Goal: `type` ∈ shot|head|own (GoalType), `et` truthy in extra
  time — a goal auto-triggers the ball weave + GOOOOL eruption. **Only emit on CONFIRMED**
  (goal confirmation ladder) to avoid phantom eruptions; a `possible` goal → push
  `{kind:'var'}` (held-breath) and replace later.
- `__loom.score(argGoals, cpvGoals)` — authoritative score (Score.Participant{1,2}.Total.Goals);
  optional if you rely on goal events, but keep it truth-aligned.

**Side truth:** the odds envelope has no home/away field — use your latched
`participant1IsHome` (`sniffParticipant1IsHome`) so part1→side 1 and pHome map to the team the
loom labels ARG (home = left). Team labels are still hardcoded ARG/CPV in the prototype
(follow-up); for the test, home→left/ARG, away→right/CPV.

## Mapping (from docs/DATA.md — already worked out)
BELIEF ← 1X2_PARTICIPANT_RESULT de-vigged → `odds` · POSSESSION ← possession/safe/attack/
danger/high_danger (per side) → `possession` · PRESSURE ← danger + high_danger (weighted) →
`pressure` · TEMPO ← every scores action → `tempo` · EVENTS ← goal(confirmed,+GoalType) ·
shot(+Outcome) · yellow/red_card · var/var_end · corner → `event`. CROWD selvage sparks stay
specimen (no wire) for now.

## Honesty (non-negotiable)
Market ≠ crowd, never blend. Push only what the wire says; never synthesize ticks between real
ones (the loom interpolates the *curve* for rendering, but only across real pushed points).
On a genuine **suspension** (empty price vector) stop pushing — the belief holding flat is honest.

**⚠️ Correction — do NOT cut the belief at 90'.** The earlier "90'-level settlement/death → stop
pushing odds" note was wrong, and I verified it against the capture: the `1X2_PARTICIPANT_RESULT`
market **keeps pricing the winner all the way through extra time.** In ARG–CPV it reads H≈0.91 on
ARG's 92' ET goal → a cream, **draw-heavy ≈0.55 at 103–110** (honest: 2–2, heading to penalties)
→ ≈0.94 on the 111' winner. So for any knockout that goes to ET, **keep pushing every real tick to
~120'** — the loom now weaves ET in real belief (it no longer greys out after 90'). Belief only
"dies" at the *true* final settlement/suspension: hold it at the last real value then, don't null it.
(Group-stage games simply stop sending ticks at full time — same rule, no special-casing needed.)

## Wiring shape (suggested)
After your `parseOddsMessage` / `parseLedgerMessage` (+ possession/danger extraction), add a
thin adapter that calls `__loom.*`. Simplest for the test: host `loom-proto.html` and call
`frame.contentWindow.__loom.odds(...)` etc., or inline the loom into a route and call
`window.__loom` directly.

## Test plan
1. **Dry run first:** replay a captured bundle (`arg-cpv-20260703.jsonl`) through the same
   adapter — validate without live pressure.
2. **Live:** point at the next fixture — nearest is **Brazil–Norway, Jul 5 20:00 UTC**
   (18187298). Keep **USA–Belgium Jul 7** as the polished debut; tonight is a rehearsal.
3. Verify: clock advances the live edge · belief ground shifts on real ticks · possession &
   pressure cords move · a real goal weaves the ball + fires GOOOOL ONCE (not on the
   unconfirmed/`possible` emission) · tempo rail thickens in busy spells · no phantom events ·
   suspensions hold the belief.
4. Hand back anything the API is missing (e.g. `__loom.suspend()` for held-breath, team
   color/label injection) — the design lane adds it.

---
## Wire gaps caught on the live BRA–NOR wire (Jul 5) — three one-liners

The loom now renders the full gated icon lexicon (goal-mouths by outcome, cards,
subs, corner flags, VAR span). Confirmed live: WS opens, real 1X2 → belief,
themed BRA–NOR. Three adapter (`loom-adapter.js`) gaps make three icons degrade:

1. **Card colour.** `yellow-card` and `red-card` both emit `{kind:'card'}` with no
   colour, so red renders yellow and the ten-men narrowing never fires. Fix:
   `L.event({minute:mn, kind:'card', side:sideNum(ev.side), type: k==='red-card'?'red':'yellow'})`.
   The loom already reads `type:'red'` → red card + narrows the cloth.

2. **Substitutions not pushed.** No `substitution` case. Add:
   `else if (k === 'substitution') { L.event({minute: mn, kind: 'sub', side: sideNum(ev.side) }); }`
   (side = `ev.side` or `ev.detail.Participant`). The loom draws the in/out arrows.

3. **ET belief still greys at 90'.** Line ~69 `if (t.period === 'et' || etPhase) break;`
   drops ET odds — but the 1X2 prices the winner through extra time (verified in the
   ARG–CPV capture; see the correction note above). Keep pushing ET ticks; the loom
   weaves ET honestly now (real de-vigged H/D/A to min 120).

None block tonight's watch — belief, possession, pressure, goals (+ball/GOOOOL),
shots-by-outcome, corners, yellows all flow. These three just complete it.

### Live-watch findings (BRA–NOR, Jul 5) — confirmed gaps, priority order

4. **PENALTY GOALS not computed as goals — the big one (owner-flagged).** During BRA–NOR a
   scored penalty produced no goal on the loom (no ball weave, no GOOOOL, score stale until
   the next score row). You fixed `parseScoreMessage` for pens (commit 64d2854); the LEDGER
   goal event needs the same: when `penalty_outcome` = scored, emit the confirmed-goal event
   (`kind:'goal', type:'pen'`) so `L.event` fires. The loom now also accepts
   `{kind:'pen', outcome:'scored'}` and promotes it to a goal (belt-and-braces), but the
   adapter should send the real thing. Test bundle: `par-fra-20260704.jsonl` (69' pen).
5. **Substitutions: confirmed ZERO shown live** (gap 2 above) — bump priority; the loom's
   arrows render the moment you push `{kind:'sub', side}`.
6. FYI loom-side fixes shipped (v20): live clock now interpolates 1 min/min between your
   `clock()` calls (the weave never stalls — keep pushing ticks, they snap it true), icons
   are ~25% larger, and scored-pen promotion per #4.

### New threads to weave — coordinator → design (Jul 6)

7. **INJURIES — data READY, design to weave.** The `injury` action carries everything in its
   **Data** block (its top-level `Participant` is absent, unlike other events): the **side**
   (`Data.Participant` 1/2), the **injured player** (`Data.PlayerId` → name via the same
   lineups roster as scorers), and an **Outcome** — `OnPitch` (treated, played on),
   `NotReturning` (came off for good), `OffPitch` (off temporarily). 365 in the sample.
   Coordinator side is wired: `parseLedgerMessage` now sets the injury event's `side` from
   `Data.Participant` and `detail` to the player name; the outcome rides on `ev.raw.Data.Outcome`.
   Adapter push (to add when you build the mark): `L.event({kind:'injury', side, ...})`.
   Design owns the visual — a stitched cross / "paused play" texture, named + side-coloured;
   `NotReturning` naturally pairs with the sub arrow. (Server-live on the next stands deploy.)

8. **HYDRATION / COOLING BREAK — a blue water thread (owner idea) — SIGNAL FOUND (Jul 7), ready to weave.**
   Concept: during a cooling break the clock keeps running but play stops, so weave those dead
   minutes as a blue water-coloured thread — same family as injury pauses / added time ("clock runs,
   ball doesn't"). TxODDS confirmed the signal: it is **`Action = comment` with
   `Data.Text = "Water-drinking break"`** (NOT a Stats key, NOT a dedicated action). Coordinator:
   parse `comment` envelopes for that exact Data.Text → emit a break event (starts at the comment,
   ends when play resumes / the next non-comment action) → adapter pushes it to the loom; design
   weaves the blue thread over those minutes. Ready to wire on the next stands pass — do NOT fall
   back to `suspend` (still fires for any stoppage; only the "Water-drinking break" comment is safe).
