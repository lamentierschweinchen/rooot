# Generation prompts — the new stat-family cards

For the families still to build as detail cards: **THE BOOK** (referee decisions),
**THE BENCH** (subs / injuries / warming-up), **PENALTIES** (shootout). Same
generate→socket loop as before: you generate the beautiful **empty instrument**,
I socket the honest live data onto it.

**Two kinds of asset:**
- **INSTRUMENT** = a portrait scene I lay marks onto (like `goal-empty.png`, `arc.png`).
  Keep it mostly *empty* — the marks are the data, they land at runtime.
- **EMBLEM** = a small centred symbol on a plain near-white field, which I key to
  transparent and recolour (like the glove/wall).

**The first rule — abstract, not literal: the shape that tells, not the figure that
shows.** Every emblem is an **object or a geometric sign reduced to its essential
form** — *never a human figure performing the action*. No players, no silhouettes, no
scenes-in-motion. A corner is a **flag**; a save is a **glove**; a booking is a
**card**; a free kick is a **ball + the sprayed line** — the sign, not the act. If a
prompt describes someone *doing* something, it's wrong — describe the mark that stands
for it instead.

**House rules baked into every prompt below** (don't drop them): flat Bauhaus, bold
geometric, thick confident black outlines, solid flat fills, **no gradients, no 3D, no
drop shadows, no perspective realism**, screenprint / risograph texture with a little
paper grain and the faintest mis-registration. Palette only: cream `#F3ECDB`, warm
black `#1A1815`, azul `#2049AA`, rojo `#C8504D`, verde `#2E6A4E`, gold `#C79A38`,
yellow `#E5B431`. **No text, no letters, no numbers, no logos, no brand/tournament
marks.** Centre the subject on a plain flat near-white `#F5F2E9` background with an
even margin (so I can key it out).

---

## THE BOOK

### 1 · INSTRUMENT — the referee's ledger *(portrait scene)*
> A flat Bauhaus illustration of a referee's open pocket notebook — the disciplinary
> ledger — seen straight-on as a flat-lay, open to two blank facing cream pages
> (`#F3ECDB`) with a few thin muted-ink horizontal rule lines, a black stitched spine
> down the centre, softly rounded corners and a thin elastic band looped at the right.
> A small yellow card (`#E5B431`) and red card (`#C8504D`) peek out from behind the
> spine. Screenprint/riso texture, warm black ink (`#1A1815`), bold flat shapes, thick
> outlines, no gradients, no 3D, near-flat (no perspective distortion). Portrait frame,
> the notebook filling ~85%, on a plain near-white `#F5F2E9` background. No text, no
> letters, no numbers, no logos.

### 2 · EMBLEM — the whistle *(small, will be keyed transparent)*
> A flat Bauhaus emblem of a referee's pea whistle in three-quarter side profile: a
> bold rounded cylindrical body, a short mouthpiece, a small hanging ring, one round
> pea-hole on top. Solid warm-black body (`#1A1815`) with a single gold accent band
> (`#C79A38`) and a small cream highlight. Thick outline, flat fills, no gradient, no
> 3D, screenprint grain. Centred, ~70% of the frame, even margin, on a plain flat
> near-white `#F5F2E9` background. No text, no letters, no logos.

---

## THE BENCH

### 3 · INSTRUMENT — the dugout *(landscape/portrait scene)*
> A flat Bauhaus illustration of a football substitutes' dugout seen straight-on in
> simple elevation: a low covered shelter with a flat roof over a single row of ~6
> empty tip-up seats. Muted verde roof and frame (`#2E6A4E`), cream seats (`#F3ECDB`),
> warm-black structure (`#1A1815`). Screenprint/riso texture, flat geometric shapes,
> thick outlines, no gradients, no 3D, no perspective realism. The dugout fills ~85% of
> the frame, on a plain near-white `#F5F2E9` background. Leave the seats clean and
> empty. No text, no letters, no numbers, no logos.

### 4 · EMBLEM — the substitution board *(small, keyed transparent)*
> A flat Bauhaus emblem of a fourth-official's electronic substitution board: a rounded
> rectangular handheld panel on a short stubby handle, its face split by one horizontal
> line into an upper and lower half — a bold up-arrow (verde `#2E6A4E`) in the top half,
> a bold down-arrow (rojo `#C8504D`) in the bottom half. Warm-black frame and handle
> (`#1A1815`), cream face (`#F3ECDB`). Flat shapes, thick outline, no gradient, no 3D,
> screenprint grain. Centred, ~70% of the frame, on a plain flat near-white `#F5F2E9`
> background. No text, no letters, no numbers, no logos.

### 5 · EMBLEM — the stretcher *(small, keyed transparent — the injury mark)*
> A flat Bauhaus emblem of a medical stretcher seen from directly above: a simple
> rectangular canvas bed with two side poles and short handles at each end, and a small
> bold red cross (`#C8504D`) centred on the canvas. Cream canvas (`#F3ECDB`), warm-black
> poles and handles (`#1A1815`). Bold geometric, thick outlines, flat fills, no gradient,
> no 3D, screenprint grain. Centred, ~72% of the frame, even margin, on a plain flat
> near-white `#F5F2E9` background. No text, no letters, no logos.

---

## PENALTIES

### 6 · INSTRUMENT — the shootout goal *(portrait scene)*
> A flat Bauhaus illustration of a football goal seen straight-on in flat front
> elevation, the net divided by its mesh into a clean **3×2 grid of six equal target
> zones**, empty. Warm-black frame and posts (`#1A1815`), cream mesh (`#F3ECDB`) on a
> fine even grid, and a single bold penalty-spot dot (`#1A1815`) centred on a verde
> ground strip (`#2E6A4E`) below the goal. Screenprint/riso texture, flat geometric,
> thick outlines, no gradient, no 3D, no perspective distortion. Portrait frame, the
> goal filling ~85%, on a plain near-white `#F5F2E9` background. Keep the six zones
> clean and empty. No text, no letters, no numbers, no logos.

---

## Bonus — a cleaner stadium base *(optional, solves two things at once)*
The current stadium is beautiful but has the two bowls baked red/blue, so I recolour
them to the teams in code — which works, but a **neutral base** would recolour cleaner,
and it only draws **one** goal. If you regenerate:

### 7 · the stadium, neutral bowls + a goal at each end *(portrait 3:4)*
> [Your existing overhead Bauhaus stadium, same style and palette] but with **both
> grandstand bowls in a neutral warm grey (`#B9AE93`)** instead of red and blue — a
> blank bowl that can be tinted to any team's colour — and a simple flat goal drawn at
> **both** ends of the pitch (top and bottom goal lines), not just one. Keep the verde
> pitch, the cream running track, the black scoreboard. Portrait 3:4 framing, minimal
> ornament in the corners (or none). No text, no letters, no numbers, no logos.

*(With #7 I drop the runtime recolour of a red/blue image and tint the neutral bowls
directly — cleaner for any fixture, and both goals come for free.)*

---

## SET PIECES — two small emblems I'm still lacking
The SET PIECES card keeps your corner-flag hero and now lists **corners · free-kicks ·
throw-ins**. Corners already have the flag; I need small emblems for the other two.
They sit **small (~20px in a row)**, like the sub-board / stretcher — so keep them
**bold and simple, readable tiny**, same flat-Bauhaus rules + palette as the rest
(centre on `#F5F2E9`, key-outable, no text). Right now I'm using rough drawn
placeholders.

### 8 · EMBLEM — the free kick *(ball + a third-of-a-circle arc, top-down, transparent — owner-directed, ask for 3 variations)*
> Three creative variations of one flat Bauhaus emblem for a football **free kick**, each
> on a **transparent background**.
>
> The idea to keep in all three: a single **round ball seen from directly above** (a bold
> top-down disc), with **a third of a circle — a ~120° arc — drawn around it** (the arc
> the defensive wall stands behind). That's the whole mark — just the ball and its arc.
> No players, no figures, no pitch scene: the sign, not the act. (Same spirit as our
> corner emblem — a round object + an arc, seen from above.)
>
> Style: flat, bold, geometric mid-century / Bauhaus infographic; thick confident black
> outlines, solid flat fills, screenprint / risograph texture with faint paper grain.
> No gradients, no 3D, no shadows, no perspective. Warm limited palette — cream
> `#F3ECDB`, warm black `#1A1815`, one accent of gold `#C79A38` or rojo `#C8504D`. No
> text, no letters, no numbers, no logos.
>
> Make the three takes genuinely distinct — vary the arc (its weight, where it opens,
> solid vs dashed/stitched) and the ball's markings — but each must read instantly as one
> clean, centred emblem with an even margin, keyable on a transparent background.

### 9 · EMBLEM — the throw-in *(small, keyed transparent — a path, not a person)*
> A flat Bauhaus emblem of a throw-in reduced to a **flight-path over a line**: a bold
> ball sitting just **beyond a straight touchline**, with a **dashed arc** tracing its
> throw up and back **across the line** into play. Only the ball, its arced trajectory,
> and the line — **no player, no hands, no body, no silhouette**. (A ball crossing back
> over the boundary is the whole idea.) Cream ball (`#F3ECDB`) with black pentagon
> accents, the touchline in warm black (`#1A1815`), the dashed flight-arc in gold
> (`#C79A38`), an optional thin verde strip. Bold, flat fills, thick outline, no
> gradient/3D, screenprint grain. Centred ~72% of the frame, on a plain flat near-white
> `#F5F2E9` background. No text, no letters, no numbers, no logos.

*(Two data notes for the coordinator: **free-kicks** are already on `window.__stats`
as `freeKicks` per side; **throw-ins** are on the wire — `throw_in` events with
`Participant` + `Clock` + `Data.ThrowInType` — but not yet surfaced, so I show `—`
until a `throwIns` count per side is added. And **cards** carry `Data.PlayerId` +
`Clock`, so THE BOOK wants a `cards.list:[{player,type,minute}]` to show who + when —
same pattern as scorers/subs.)*
