# DESIGN NOTE — added time (45+N / 90+N) + the half "restart"

*Coordinator → design. Owner's live note: the loom must handle added time and not
hang after halftime. The HANG is fixed (coordinator, deployed). The distinct
"45+N" look is yours — here's the model + the hook I feed you.*

## The wire clock (ground truth, from the captures)
`Clock.Seconds` is **monotonic** and counts within each half, then **caps and
HOLDS** at the boundary with `Running:false`, then continues in the next phase:
```
H1:  0' ───► 45'  (caps at 45', Running:false through 1st-half stoppage + HT)
H2:  45' ──► 90'  (starts again at 45', continues to 90', caps, holds)
ET1: 90' ──► 105' …  ET2: 105' ──► 120' …  then PENS
```
So the timeline never runs backward — the second half genuinely IS 45'→90'. The
"restart at 45'" you described is just the wire continuing; no reset needed.

## What I fixed (deployed)
The ticking clock now **respects `Clock.Running`**: it freezes at the 45'/90' cap
and through the break, then resumes clean (before, it inferred "running" from the
phase, kept ticking past 45', overshot, and jumped on resume — the halftime hang).
It also never extrapolates more than ~2.5' past the last wire sync. **No more hang,
no refresh needed.** With no design change, the loom now simply *pauses* at 45'
during stoppage + HT, then continues — already continuous and correct.

## The "45+N" tint — your part (I feed the phase)
The adapter now calls `window.__loom.phase({ phase, running, minute })` on every
status (a no-op until you implement `L.phase`). With it you can render added time
distinctly:

- **STOPPAGE** = `running === false` AND `minute` is at the cap (≈45 or ≈90) AND
  `phase` is still `FIRST_HALF` / `SECOND_HALF` (not a break). Render the live edge
  as **"45+N" / "90+N"** in its own tone; tick N locally from your own timer
  (the wire won't give it — it holds at the cap). Weave stoppage events into a
  short distinct band, then let the cloth continue at 45'→90' for the half.
- **HALF-TIME / BREAKS** = `phase` is `HALF_TIME` / a break status → a held state
  (the clock's frozen; show the interval).
- Phases you'll see: `FIRST_HALF · HALF_TIME · SECOND_HALF · EXTRA_TIME · PENALTIES`
  (the 13-code StatusId ladder normalized). ET caps the same way at 105'/120'.

Honesty: the wire doesn't send a stoppage length, so "N" is your local
extrapolation from real time at the cap — label it as the live estimate, and it
snaps to truth the moment the next half's clock starts.

## Ask
Implement `L.phase(...)` to give stoppage its own tone + the "45+N" edge, and let
the timeline read the half boundary. The hang is already gone; this is the polish.
