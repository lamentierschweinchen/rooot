# BRIEF — THE STANDS (coordinator's aesthetic direction)

*The stands are untouched, and they might be the crown jewel. This is the thinking,
not the pixels — you render it, the owner judges the frame. Grounded in the real
crowd data (stands-adapter) and the honesty law. Jul 7.*

---

## The one idea

**The stands are two facing TERRACES that fill with real people — a tifo you are
part of.** The crowd is not a number on a panel; it's a *crowd you can see*. You
take a seat, and your end sings, feels, and believes — all real, all yours.

Everything else on ROOOT is the match as an object you *keep* (the cloth, the plates,
the stadium of stats). The stands are the one place that is the match as something you
*join*. That's why they can be the jewel: they're the only room where the fan is
inside the thing, not holding it. Make them feel **occupied** — warm, loud, human —
against the cool print of everything above.

## Why a terrace (and not a dashboard)

The delete test is merciless here. A "crowd panel" with two big numbers is honest but
dead. A terrace is honest AND alive: **every rooted fan is one tile.** The count isn't
told to you, it's *shown* — the end literally fills as people arrive. 3,891 is a wall
of people; 12 is a thin front row. Same truth, but you feel it. And it composes as
Bauhaus without trying: two committed host-colour fields facing across the cloth, a
mosaic grain, bold and flat. No pinstripes — the ends ARE the colour.

## The six moving parts (each: the data · the honest rule · the feel)

1. **Your seat — "Who are you with?"**
   One plain question, asked once, then it gets out of the way. Tap an end → your tile
   lights in that terrace, your colour. *Data:* `root(side)`. *Rule:* plain copy, no
   "STAND WITH ARG" branding. *Feel:* you're now *in* the picture, not looking at it.

2. **The rooted terrace — a mosaic of real people.**
   Each end fills with tiles, one per rooted fan (`counts.home/away`). Density = the
   real count; the wall grows as people join. *Rule:* counts, NEVER a %. A near-empty
   end reads as a near-empty end — honest. *Feel:* the pre-match filling-up is its own
   quiet drama.

3. **The roar — your end surges.**
   When you cheer, YOUR terrace pulses with light/colour — the collective voice made
   visible. *Data:* `cheer()` → `roar` rate (a decayed rolling rate, breadth not spam).
   *Rule:* the surge lands on YOUR end only, never doubled — no faith multiplier. *Feel:*
   a stand catching a song. Two ends can roar at once; the louder wall glows brighter.

4. **The pulse — a wave of feeling across the terrace.**
   The six human feelings (muscle · fire · fear · prayer · disappointment · anger) ripple
   as coloured surges through the end at the big moments. *Data:* the moment windows +
   `momentReact(momentId, token)`; the split reveal after. *Rule:* bespoke embroidered
   feeling-marks (owner's generations), not emoji. *Feel:* the terrace's mood as a living
   thing — you tap your feeling, it joins the wave, and the reveal shows where the end landed.

5. **Faith — the end that sings while losing.**
   This is the emotional core and the honesty flag in one. When your side is behind and
   your end still roars, that's *faith* — and it is NOT multiplied or scored (owner's law:
   "you cheer, win or lose or draw"). Render it as the losing end still lit, still singing
   — dignity, not a counter. *Feel:* the most moving thing in the build if it's done with
   restraint.

6. **The consensus — the tifo the crowd holds up.**
   The end raises a tifo: the scoreline the crowd *believes* (`consensus.modal`), shown
   BESIDE — never blended with — the market's odds. *Rule:* crowd ≠ market, two separate
   truths side by side. When the crowd defies the market, that contrast is the story.
   *Feel:* a banner unfurled over the terrace.

## Where it goes / the finish

- **Below the cloth**, as the loom scrolls down — the match is woven above, the crowd
  holds it below. Two ends framing the pitch/cloth (home = left/your-side warm).
- **Full time = the keepsake.** Your end's terrace + its tifo settles into the scarf —
  the collectible you leave with. The score is the victory; there are **no rosettes, no
  medals, no cheese**. The full stand *is* the trophy.

## The canon it must honour (non-negotiable)

Host palette as committed FIELDS (the two ends). Bauhaus: flat, bold, mosaic, asymmetric.
Every tile a real fan (counts, never %). Crowd never blended with market. No faith
multiplier. Bespoke pulse marks, not clipart. Plain adult copy ("Who are you with?", not
signage). Collectible-grade — the terrace should pass the crop test alone.

## The data contract (already live — `window.__stands`)

`root(side)` · `cheer()` · `predict(h,a)` · `momentReact(momentId, token)` ·
`onState({rooted, roar, faithSide, connected})` · `onConsensus(modal/mean, byRoot, doubters)` ·
`onMoment(window)` · `onMomentResult(split)` · `onVerdict(FT)`. All real server counts.
Ping the coordinator for any signal you want shaped differently — this is wired and waiting.
