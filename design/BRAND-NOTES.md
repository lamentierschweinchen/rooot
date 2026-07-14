# ROOOT — Brand Lane Notes

*Companion to `archive/web-prototypes/apps/web/public/brand-lab.html` (open it — the marks live there, animated,
tested at 16px). This file is the coordinator's TL;DR + the decisions to lock into
`design/IDENTITY.md` once the owner reacts.*

## The north star (owner, verbatim intent)

The current three-ring mark is liked as **data language**, but ROOOT "is more about
soccer than anything else." The Os should "feel like a fun object that makes the sound
and probably makes the game legible," and must "read at tiny favicon size." Aesthetic
law: **retro grammar, modern execution** (Topps / Panini / Mexico-70 flat pop geometry).
Monochrome + gold, team colors as accents. No crests, rings, FIFA marks, player faces.

The three Os in **R‑OOO‑T** are the playground — the mark *is* the middle Os.

## What steered the geometry

- **Mexico 70 ticket ball** — a ball abstracted to a flat black pinwheel on a white disc.
  Pure pop geometry, zero leather realism. This is the "modern execution of retro grammar"
  proof.
- **1970 pennant** — that *same* geometric ball literally sits inside the **0 of "1970."**
  The ball-as-O already existed in the reference world; we're modernising it, not inventing.
- **Topps '72** — fat display letterform breaking a black keyline on a saturated flat
  ground → the wordmark energy.
- **ManU scarf** — chunky pixel-jacquard; the O can be knit stitches (relic-native).
- **Floodlight & fog** — the stadium/roar vocabulary; the bowl is the thing that roars.

## Eight built → four survived

| # | Name | Verdict | One line |
|---|------|---------|----------|
| A | **Geo-Ball** | ✅ survives | The O as a flat pop ball (Mexico-70 pinwheel). Owns *soccer-ness*. |
| B | **Stadium-Bowl** | ✅ survives | The O as the stadium from above, pitch nested inside. Owns *the roaring thing*. |
| C | **Roar-O** | ✅ survives | The liked rings re-read as a sound radiating from a source. Owns *sound + continuity*. |
| D | **Knit-O** | ✅ survives | The O as jacquard stitches, one dropped stitch escaping. Owns *tiny-size + material*. |
| E | The Mouth | ✕ killed | O screams (fun) but → mascot kitsch + 16px blob. Kept as the CALL open/close motion. |
| F | The Chant | ✕ killed | o-O-O crescendo is a *lockup*, not a squarable glyph. Kept as wordmark choreography. |
| G | Kickoff Mark | ✕ killed as logo | Too generic (⊖) to own; promoted to the **stage** (centre circle on the pitch). |
| H | Goal-Mouth | ✕ killed | Net hairlines die below ~40px. Its "ball in corner" beat → a goal event, not a mark. |

**16px is the kill gate.** Verified honestly on the tab strips in the lab:
Knit-O is the strongest tiny performer (collapses to 6 clean pixels); Roar-O and
Stadium-Bowl's *simplified* favicons (dot+ring / ring+bar+spot) read cleanly; Geo-Ball
is borderline (spokes crowd the ring — uses a fatter-spoke 16px cut).

## Recommendation

- **My pick: B · Stadium-Bowl.** The only candidate where mark = concept = product:
  the stadium is the O, the O is the thing that roars, and the night-pitch we already
  render nests inside — the interior halfway line is the 50/50 the whole app is built on.
- **Owner will likely pick: C · Roar-O** — lowest-risk evolution; keeps the ring equity
  they already like while answering "more soccer/sound."
- **The merge to prototype next (flagged for coordinator):** a **Bowl exterior with a
  Roar-O soul** — a stadium ring that *radiates* when it roars. B's legibility + C's
  motion + C's continuity with the incumbent. Strongest bet if we want one mark that
  satisfies both the owner's affection and the "more soccer" note.

## Locked brand system (restated — decided elsewhere, not open)

- **Palette:** Night `#0B110C` · Chalk `#EDE6D6` · Gold `#D9A441` (the rare mark) ·
  team-accent = one pair per moment, ends/relics only, never UI chrome.
- **Type roles:** Anybody (the scream / wordmark / hold-to-call stretch) · Young Serif
  (the programme / verdicts / warmth) · Doto (the printer / every number) · Silkscreen
  (the knit twin / Doto on relics, 1:1 as stitches).
- **Data-vs-design rule (REFERENCES.md §8):** designed base speaks in display faces;
  the fan's data prints in the dot voice. Never set a probability in a display face.
- **One mark, three materials:** whatever wins renders in the material of where it lives —
  *light* on the stage, *stitches* on the scarf, *ink* on print/rosette.

## Open questions for the coordinator

1. **Prototype the B+C merge?** (Bowl outline that radiates on roar.) I think it's the answer.
2. **How literal should the interior get at large sizes?** Bowl can nest the actual
   night-pitch render inside the O on a splash/loading screen — worth a spike?
3. **Favicon = which simplification?** Each survivor needs a purpose-built 16px cut
   (they're in the lab). Confirm the app favicon uses the *simplified* variant, not the
   full mark.
4. **Team-accent demo pair** in the lab is Mexico green/magenta (reference-blessed). Fine
   as the demo, or want a neutral demo pair so it doesn't read as "Mexico is the default"?

*Touched only: `archive/web-prototypes/apps/web/public/brand-lab.html` (new) + this file. No commits.*
