# DESIGN NOTE — make the loom feel ALIVE while it weaves

*Coordinator → design. Owner note from the live BRA–NOR debut (Jul 5). This is a
DESIGN concern (the motion/feel of the surface) — logged for you, not built by
me. The data side of the same screenshot is handled separately (see below) so
you have real signal to animate against.*

## The owner's note (verbatim intent)
Watching it live: the loom needs to **feel alive while it's weaving** — there
should be **basically a constant motion element**, always something breathing,
even in a quiet passage. Right now, between events, it can read as static.

## Why this is yours, and what's already in the vocabulary
The living-and-breathing idea is already sketched in `LOOM-NEXT.md` (the three
timescales: STITCH seconds / ROW minute / MOMENT events; "idle breathing =
ink-character shimmer confined to the last ~2 minutes of rows"). This note is
the owner asking to **make that real and constant** — the shuttle, the live
edge, the last few rows should always be in gentle motion, so a quiet 0–0 stretch
still feels like a loom running, not a frozen image. How (shimmer, shuttle
travel, thread settle, dye breathing, a heartbeat on the live edge) is your call.

## What I changed on the DATA side (so the motion has truth to ride)
Separately, and already deployed — these give the surface real, frequent movement
to animate with instead of dead-flat cords:
- **The pressure cord now has live fuel.** The wire sends danger/high-danger as
  ~25 events per 18s; they were reaching only the tempo rail, so the pressure
  cord sat dead at centre (the "straight line" the owner saw). It's now routed to
  the cord — it will meander with real pressure. Design against a *moving* cord.
- **Possession is honestly blank live** (`POSS —`, not a fake `0%`). The
  continuous possession % lives in TxLINE's undecoded `Stats` block (pending the
  ScoreStatKey email), so the gold possession cord has no live source yet — treat
  it as absent/awaiting, don't animate fake territory.
- **Belief updates in slow steps** (StablePrice lags the match ~60s), so the
  bands genuinely hold flat for a while between real ticks — the "constant motion"
  can't come from belief alone; it has to be the loom's own life (breathing/shuttle).

## The ask
A always-on motion layer that reads as a running loom, tasteful and honest (motion
never invents data — it's the *cloth* breathing, not the numbers moving). Gate it
on the owner's eye like the other sheets.
