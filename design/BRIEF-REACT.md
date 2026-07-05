# BRIEF — REACT / the Pulse (the drama-moment surface)

*Coordinator → design. The mechanism is BUILT, typechecked, and dry-run-proven
(services/stands/src/dev/react-dryrun.ts, 32 checks). This brief is the surface
schema: the data you get, the three views to make beautiful, and the one thing
only you can decide (the glyphs). Nothing here waits on the loom being locked —
it's its own surface. Spec of record: docs/MECHANISMS.md §4.*

## The mechanic in one breath

A DRAMA MOMENT happens (a goal, a red, a VAR check, a near-miss, a market lurch,
full-time). A **~25s window** opens. Every fan picks **ONE feeling** from a small
curated set. At close, the two ends are revealed **split**: *their* top feeling
vs *your* top feeling. Across the match, the moments stack into a **MOOD QUILT** —
a keepsake of how it felt, end against end. No feeling is ever right or wrong;
this is expression, not a guess (the mechanic the owner killed twice — do not
re-add scoring).

## What the server owns (done) vs what you own

- **Server (done):** detecting the moment off the real wire, opening/closing the
  window, one-react-per-fan, the per-end histogram, the honesty (empty when
  silent, tokens validated), crystallizing into the record. Kill switch:
  `DISABLE_MOMENTS=1`.
- **You:** the glyphs, the copy, the layout, the motion, the quilt. The feelings
  arrive as **stable tokens**; you map each token → a glyph. That mapping IS the
  vocabulary — keep it AMBIGUOUS / multi-context, never literal to the event
  (the same glyph should be pickable by an ecstatic and a gutted fan; the split
  is the story).

## The client API (apps/web `StandsCrowdClient`, already wired)

```ts
// 1 · a window opens — show the picker + a countdown to closesAtMs
client.onMoment((m) => {
  // m: { momentId, kind, side, minute, opensAtMs, closesAtMs, palette: string[] }
  // kind ∈ goal|possible|var|red|penalty|near-miss|swing|full-time
  // side = the end it favours (scorer on a goal) or null (red/var/full-time)
  // palette = the 6 tokens to render as glyphs for THIS kind
});

// 2 · the fan picks one (call again to change it until the window closes)
client.momentReact(momentId, token); // token must be one of m.palette

// 3 · the window closes — reveal the split, then add a tile to the quilt
client.onMomentResult((r) => {
  // r: { momentId, kind, minute, byEnd: { home: End, away: End } }
  // End = { top: string, pct: 0..1, hist: Record<token, count>, n: number }
  // an end with n:0 was SILENT — render that honestly, don't fill it
});
```

A fan reacts as the end they rooted; unrooted fans can't be placed, so
`momentReact` is a no-op for them (like cheer). A mid-window joiner receives the
open moment automatically on connect.

## The feeling palettes — YOUR glyphs go in the right column

Tokens are frozen (contracts/crowd.ts `FEELING_PALETTES`); the glyphs are yours.
Fill these in your surface (a token→glyph map). Suggested feel in brackets — override freely.

| kind | tokens (fixed) |
|------|----------------|
| `goal` | euphoria · relief · disbelief · anguish · tension · pride |
| `possible` | hope · dread · held-breath · disbelief · nerves · faith |
| `var` | injustice · vindication · confusion · impatience · dread · hope |
| `red` | justice · outrage · shock · fear · glee · disbelief |
| `penalty` | nerve · terror · hope · dread · faith · disbelief |
| `near-miss` | agony · relief · so-close · phew · awe · frustration |
| `swing` | momentum · worry · belief · doubt · surge · slipping |
| `full-time` | elation · heartbreak · pride · emptiness · relief · disbelief |

## The three views to make beautiful

1. **THE PROMPT** — the window is open. The kind sets the frame (a goal feels
   different from a VAR wait). Six glyphs, a shrinking countdown to `closesAtMs`,
   your own pick held lit. Fast, thumb-first, gone in 25s.
2. **THE REVEAL** — the split. `byEnd.home.top` vs `byEnd.away.top`, each with its
   `pct` and the shape behind it (`hist`). This is the spectacle: "their 💀 vs
   your 🚀." A silent end (`n:0`) is a real, honest state — the away stand didn't
   flinch — give it a treatment, don't hide it.
3. **THE MOOD QUILT** (keepsake) — one tile per moment in match order, each tile
   the two ends' dominant glyphs + minute. The whole cloth is how the match
   *felt*, side against side. This is the crystallized `feel.moments` layer of
   the sentiment record (contracts/sentiment.ts `MomentFeeling[]`), so the quilt
   the fan keeps IS the data product — same source, live and forever.

## Honesty (non-negotiable, already enforced server-side)

- No correctness, ever. A feeling is not scored, ranked as right, or resolved.
- Silence is data. An end with no reactors reveals empty; never synthesize a mood.
- Curated set only. The server drops any token outside the open moment's palette.

## Notes / open follow-ups (coordinator)

- Shootout penalty kicks aren't auto-triggered yet (they'd fire faster than a 25s
  window) — the `penalty` palette exists for when we shape that. Flag if you want it.
- `feel.roar.peak` still null (needs roar-over-time capture) — separate follow-up.
- Live debut: hold for your surface + owner's nod. Backend is inert to current
  clients until then; validate alongside the loom on the next live match.
