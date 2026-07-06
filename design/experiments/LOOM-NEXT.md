# THE LOOM — chosen. Next steps, open decisions, and the seams I need

> **ADDENDUM (Jul 4, later):** owner blessed limited co-weaving, asked for a Stands
> panel with a beautiful sentiment record, and re-aimed the legibility layer at bold
> labeled Bauhaus GRAPHS (new samples honored: tile grids, isometric shadow blocks,
> dot-tip rods, quarter-circle tiles, the 1990 chevron). All answered visually in
> **SHEET Nº 002** — `design/experiments/loom-system-jul4.html`
> (https://claude.ai/code/artifact/38b9c201-9289-4455-950b-55cd42574019):
> co-weave options A THREAD / B OPEN ROW / C PATTERN VOTE side by side (rec: A+B, C
> parked) · THE STANDS with drawn-glyph reactions (SPARK/ARROW/EYE/FRAY) + THE MOOD
> QUILT (tile = 5', pattern = dominant glyph, split = ends' counts, density = volume,
> gold frame = real faith) · four graph modules: THE RIBBON, EVERY GOAL CASTS A SHADOW,
> HOW OFTEN THE MARKET SPOKE, THE ROAR IN QUARTERS · steal-backs into the scarf
> (chevron swing rows, quarter-circle patches, border tile vocabulary).

*Written after the owner's verdict (Jul 4): the Loom leads. His three charges: (1) it must
live and breathe — weave itself beautifully during a game, not sit as a static artifact;
(2) decide between (a) game-data-only weaving and (b) fans weaving their own story into a
collective fabric; (3) solve legibility — likely a beautiful flip to a labeled view,
Bauhaus-esque in the register of the Large Labor Model's MIRROR (studied: Albers-square
shapes, one huge number, whisper-caps labels, a plain-language explainer under every
legend row, scroll = time).*

## Position: (b), with the loom setting the grammar

The scarf is already collectively woven — the three verbs are weaving acts (ROOT = your
strand exists · CHEER = sparks in your end's selvage · CALL = the gold knot at your
minute). The real decision is whether fans get one DELIBERATE gesture beyond mechanical
translation. Proposal:

**THE THREAD.** Each rooted fan may lay exactly ONE thread per match, at a moment they
choose — a colored thread in their OWN END'S selvage band, from that minute to full time.
Vocabulary is fixed (end ink · cream · gold-if-proved-call; no text, no images) so there
is no moderation surface and no sticker-bomb. Scarcity makes it a moment; the story is
"I laid mine at 89', during the VAR check."

**The law that keeps it honest: the game weaves the body; the crowd weaves the border.**
The market weft (the probability field) is never fan-editable — market ≠ crowd stays
spatial and absolute. A thread is a real act by a real fan at a real second (same
notarization class as a call if we want it on-chain). Option (a) remains the ship-safe
floor: identical architecture minus one event type.

## Legibility: the scarf has two faces (material truth)

Every jacquard has a pattern face and a technical back. So the flip is not UI garnish —
it's the object's own anatomy:

- **FRONT** — the woven story (what exists today in the mock, made alive).
- **BACK — THE MIRROR.** Same geometry (rows = minutes, 1:1, so the eye keeps its place),
  re-rendered in the labeled Bauhaus register: the weft becomes a stepped area chart with
  % gridlines and the 50 % line NAMED; patches become labeled pictogram pins ("GOAL 58' ·
  CPV — belief in ARG fell 94→62"); selvage becomes labeled counters + tap-rate sparklines;
  the live edge becomes a NOW panel — huge Doto triple, whisper-caps labels, one
  plain-language explainer per metric (the mirror's legend-row grammar, e.g. "DE-VIGGED —
  bookmaker margin removed").
- **THE LOUPE.** Press-and-hold any row flips a local BAND around that minute — a
  mirror-strip with that minute's numbers labeled. Legibility at the point of curiosity
  without leaving the material. Full-face flip on the PRINT/flip control; both stepped
  (hard frames), never a 3D swoosh.

## Living and breathing: three timescales, one choreography

- **STITCH (seconds):** the live row knits tick by tick (each odds tick shuttles stitches
  in); cheer sparks pop and decay in the selvage; the shuttle mark moves.
- **ROW (minute):** the row completes with a small register snap; cloth advances.
- **MOMENT (events):** goal = the patch is SEWN (stepped needle frames + one register
  jolt); VAR = the dropped-stitch ladder trembles; the 90'-level death = the dye simply
  stops. Idle breathing = ink-character shimmer confined to the last ~2 minutes of rows
  (data-true: the settle window is still landing ticks there).

## Next steps (proposed order)

1. **LOOM-SPEC.md** — full system spec: geometry, stitch grammar, the two faces, thread
   interaction, motion frame tables, phone composition, FT lift-off ritual, ET/shootout
   handling, edition anatomy. (design lane, next)
2. **/loom-dev** — the living prototype: canvas loom driven by ReplaySource on the
   five-goal ARG–CPV bundle; jump buttons (pre / 28' / 58' cliff / death / ET / FT);
   speed control; loupe-flip v1; both colorways (newsprint ground vs press-black scarf).
   Acceptance test: watch the 58' equalizer weave itself and feel it. (fabrication lane)
3. **Rehearsal** — run today's 17:00 UTC capture through /loom-dev same evening.
4. **The mirror face v1** — labeled back + loupe, judged against the LLM mirror's bar.
5. **Thread seam** (if b blessed) — stands service event + client + notarization call.
6. **The lift-off** — FT crystallization: the relic scarf printer consumes the loom's
   row model 1:1 (they already share MatchArc; unify the shape so live and relic can
   never disagree).

Target: loom-dev watchable before USA–BEL Jul 7 (the hero fixture) — spec today,
prototype tonight, live rehearsal on tomorrow's matches.

## Gaps to fill

**Owner decisions:**
1. (a) vs (b) — and if (b): one thread per fan per match? earned (present at kickoff)?
   does a PROVED call gild your thread gold?
2. Flip: full-face, loupe-band, or both (my rec: both — loupe is primary).
3. Does the loom REPLACE the stage as the live surface, or run beside it? (My rec:
   replace. One surface, one law.)
4. Colorway: newsprint ground vs press-black scarf ground — I'll prototype both.
5. ET dye — pending the №4 scan: if an honest ET market exists on the wire, may ET rows
   carry it, or is bare wool the point?
6. Stitch-scale type: minimum legible jacquard letter size on a phone (loom-dev will
   show candidates; you gate).

**Coordinator seams (№1–№4 filed earlier; two new):**
- №1 odds tick ring — REQUIRED (per-tick shuttle).
- №2 crowd delta seam + stable join index — REQUIRED (strands, threads).
- №4 ET-market evidence scan.
- **№5 NEW — fan-thread event** on the stands service: `lay_thread {anonId, ts,
  threadStyle}`, rate-limit 1/match/fan, optional memo-path notarization.
- **№6 NEW — row-assignment ruling:** which ticks belong to a minute-row must match the
  ledger's settle-window logic, so the cloth and the wire report can never disagree.
- Confirm where the suspension EMPTY price vectors live (they're in the substrate's
  description but not in the replay bundle I parsed) so held-breath rows render from
  wire truth.

**Material for the eye:**
- macro of a plain striped scarf AND the REVERSE of a jacquard (the technical back —
  the flip's material truth).
- one hand-knitting CHART page (grid notation) — candidate language for the mirror face.
- tonight's real crowd counts → honest bin scale + the sparse-state judgment.

> **ADDENDUM 2 (Jul 4, evening):** owner shipped the scarf/Albers/data-cloth/notation
> references. **SHEET Nº 003 — THE CLOTH** (`cloth-study-jul4.html`,
> https://claude.ai/code/artifact/8b330084-0479-4149-b38d-bc7580ee9bfd) crosses Albers
> structure with Bayern band anatomy: bands A–M all data (warm-up stripes = opening
> price · name/HT/verdict/emblem bands · counterchange phase seams · tick-cadence as
> dotted single picks IN the cloth · couched selvage threads = co-weave A · open-row
> bands = co-weave B · pictograph event line) + thread-level interlacement macro of the
> 58' cliff + both colorways. Render law: interlacement cells (warp-over/weft-over),
> never paint. Research agents delivered `design/references/_agent-gathered/`:
> MOTION-NOTES.md (crank-angle loom choreography, 33:55:8:4 row ratio, never-ease list,
> split-flap constants) and 16 licensed Isotype/Du Bois/Aicher images + SOURCES.md —
> the graphs iterate against these next.

> **ADDENDUM 3 (Jul 4, night): THE TIFO.** Owner shipped tifo + quilts/Pendleton refs
> and blessed "do something with tifo". **SHEET Nº 004** (`tifo-study-jul4.html`,
> https://claude.ai/code/artifact/ec8a9723-50d9-455d-9736-7b313860a468): the crowd
> becomes a picture — motif BALLOT per end per match (option C's true home), the RAISE
> window pre-kickoff (one tap = your panel, at your join-order seat; grid sized to the
> REAL rooted count; ragged edges + holes never auto-completed), and the RECORD (the
> scarf's end panels become the raised tifo woven at achieved coverage, holes kept in
> wool; the Mood Quilt gets a tifo tile). Pendleton taken as scale/serration/banding
> lessons only — no cultural motifs lifted. Seam №5 extends with `vote_motif` +
> `raise_panel`. Open verdicts: second raise at goals? ballot curation? tifo end-panel
> replaces flag-blocks (my rec: yes).

> **ADDENDUM 4 (Jul 4, late): TIFO V2 + THE DE-PIXEL LAW.** Owner verdicts: pre-match
> crowds too thin → tifo becomes THE UNFURL (any 5 rooted fans pulling in a 60s window
> drop it WHOLE; honesty moves from coverage to the trigger — hem line prints
> UNFURLED hh:mm · PULLED BY N); motifs → FLAG / CHANT-in-team-language (VAMOS, FORÇA,
> ALLEZ, DALE) / PINWHEEL; and the big correction — PIXELS RETIRED from display-scale
> rendering. New render law: continuous form + material whisper (solid dye, per-row
> dye-lot shift, Pendleton-feathered working edge, fine thread lines + slubs, type as
> painted silk). Pixel grids survive ONLY at thread-level macro + knitted relics.
> Sheet 004 v2 (same URL) carries the unfurl 3-frame drop, the painted ballot, and a
> BEFORE/AFTER cloth strip (rows 55–62) for blessing before propagation to scarf /
> stands / graphs. Pending: bless propagation · 5-pull number + earning rule · chant
> curation.

> **ADDENDUM 5 (Jul 4, late night): CONVERGENCE — THE ATOM.** Owner named the real
> problem: scattered across mechanics, no core aesthetic locked; pixels didn't flow
> with the Panini/Bauhaus/textile references (they fit the tifo/thread-macro, not the
> general surface). Diagnosis: we designed FEATURES, never the ATOM (the smallest unit
> everything inherits), and blended two non-fusing reference families into mud —
> FLAT GRAPHIC PRINT (Panini/Topps/tickets/Bauhaus/Isotype/Mirror) vs WOVEN MATERIAL
> (scarves/Albers/Pendleton/data-knits). **Spine decided by owner: PRINT LIVE · CLOTH
> KEEPSAKE** — flat print for the live surface you watch, woven cloth for the FT relic
> it crystallizes into. Print to watch, cloth to keep; keeps the Loom's watch→own as
> the morph. **SHEET Nº 005 — THE ATOM** (`atom-jul4.html`,
> https://claude.ai/code/artifact/33f68ea3-907f-4b79-a0c2-a39e452ec52f): the live
> screen at the 58' cliff, fully committed flat-print, rendered in the REAL product
> fonts (Anybody/Doto/Young Serif now embedded as woff2 in `design/experiments/fonts/`).
> The atom = a printed split-bar row (ARG ink | draw cream | CPV ink, 50% seam), one
> per minute, stacked into the match; the wall of blue → the cliff → the collapsed
> live row (62 ARG) → stands kept separate → print morphs to woven scarf at FT.
> LOCKED: split-bar atom · flat spot ink · keyline+cream border · market≠crowd ·
> Anybody/Doto · cloth=keepsake-only. OPEN DIALS (not new directions): temperature
> (loud↔calm) · halftone dose · phone density. Pixels retired from viewing-distance
> surfaces; survive only at thread-macro + knitted relics. NEXT: tune the 3 dials to
> the owner's eye, then re-render scarf/stands/graphs into this one look, then
> LOOM-SPEC.md → fabrication builds the living screen.

> **ADDENDUM 6 (Jul 4, late night): DENSITY — THE INSTRUMENT.** Owner rejected the atom's
> single-ribbon composition as thin ("one stat carrying the whole game — boring"). Correct:
> locking the UNIT (split-bar) was right, but ONE ribbon ≠ the match. The substrate is a
> dozen live streams; the owner's exemplars are DENSE (LLM = 15 territories at once; STRATA
> = ~30 live faders). **SHEET Nº 006 — THE INSTRUMENT** (`instrument-jul4.html`,
> https://claude.ai/code/artifact/345e98aa-49fc-4160-8c4b-d26651396625): the live screen as
> a composed dense HUD, same locked print language + real fonts, now SIX streams at once —
> THE BELIEF (market ribbon, spine) · THE FLOW (danger/high-danger pressure per side,
> spiking outward on the wings — the game's real pulse; CPV's wing builds 47→58' and the
> goal follows, a story the ribbon alone can't tell) · THE CHATTER (tick cadence as pick
> density) · THE EVENTS (goals/shots/corners/cards/VAR pinned) · THE STANDS (rooted+roar per
> end, top & bottom) · THE RECEIPTS (gold call). Composed in three fixed homes (market
> centre, flow wings, crowd ends), not dumped. Extracted real per-minute pressure per side
> (ARGP/CPVP) from the bundle. This supersedes Sheet 005's thin composition; the atom + spine
> still hold. Open dials: loudness · flow-vs-belief weight on phone · compression above the
> live window. NEXT: owner's density read → tune → re-render scarf/stands/graphs at this
> density → LOOM-SPEC.md → fabrication.

> **ADDENDUM 7 (Jul 4, late night): THE INVERSION — EVENTS ARE THE FABRIC.** Owner's key
> reframe, off the Anni Albers "Study for a Weaving": the LOOM should be that patchwork as a
> LIVING/GROWING object, where PLAYER ACTIONS literally form the cloth (a shot, a card, an
> injury = blocks of weave), and the ODDS/PRESSURE are the MOOD (colourway/warmth), not the
> structure. This inverts my prior hierarchy (odds=structure, events=pins). **SHEET Nº 007 —
> THE LOOM WEAVES ITSELF** (`loom-weave-jul4.html`,
> https://claude.ai/code/artifact/feffc0f6-d147-42e4-a9d0-a641360f40e6). Vocabulary (weave
> structure ← real element): GOAL = the flowing curved panel (ET goal gold-edged) · DANGER =
> diagonal pressure stripes (leaning by side) · SHOT = tight vertical stripes · SET-PIECE =
> dense rules · CARD = checker · VAR = held grid · QUIET = Albers grey field (the negative
> space = the calm; earns size by duration). Masonry-packs chronologically into 5 columns,
> frozen positions, grows over the match (small-multiples at 30/60/90/AET prove it develops).
> MOOD = market: ARG-favoured → cool/blue ground; CPV breaks through → warm/red; ET (market
> dead) → neutral grey ground while events still blaze (honest). Every match yields a unique
> composition. **Product synthesis now coherent: INSTRUMENT (sheet 006, flat-print HUD) = how
> you READ the match live; LOOM (this) = what the game MAKES, growing the whole time,
> crystallizing into the keepsake scarf at FT. Print to watch, cloth to keep — the cloth
> written by the game itself.** Open dials: block sizes, grey dose, goal-panel drama, growth
> choreography. NEXT (pending owner read): refine vocabulary/growth → unify LOOM+INSTRUMENT
> into the live product → LOOM-SPEC.md → fabrication.

> **ADDENDUM 8 (Jul 4, late night): WOVEN, NOT PATCHED — the philosophy gate.** Owner rejected
> Sheet 007 as PATCHWORK (discrete tiles, "patch 1, patch 2" — not how a game works). Correct
> model: a match is WOVEN — continuous THROUGHLINES run the whole length (never breaking) and
> EVENTS are highlights woven INTO the unbroken fabric, each VARIED BY TEAM yet legible (ARG
> yellow ≠ CPV yellow; ARG shot ≠ CPV shot). **SHEET Nº 008 — WOVEN, NOT PATCHED**
> (`woven-jul4.html`, https://claude.ai/code/artifact/4f377fd4-67f8-4686-a70f-c1f1824de9db):
> a side-by-side (patchwork tiles: "flow stops at every seam" vs woven: "threads run through")
> + a continuous 40–68' strip + a per-team event-motif KEY. THROUGHLINES (continuous, the
> warp): THE BELIEF (odds as the woven ground, two team-colour threads whose border breathes) ·
> THE PRESSURE (momentum as ONE bold wandering cord meandering left/right — the clearest proof
> it's woven not tiled) · THE OTHERS (tempo/possession/shots-on-target/xG — coordinator to send
> full stat list; each becomes a throughline). EVENTS woven in, team-varied: GOAL = gold weft
> across full width + starburst knot (side-coloured) · SHOT = directional dash leaning from the
> team's end · YELLOW = checker flash bordered in team colour. **This is a PHILOSOPHY GATE, not
> the build** — awaiting (a) owner confirm the throughline families (belief · pressure · [named
> stats]) and the "events woven in, varied by team" model; (b) coordinator's FULL EVENT LIST.
> Then: map each event→woven motif (per team) + each stat→throughline → moving prototype proves
> it flows → LOOM-SPEC.md → fabrication. Refinement noted: smooth the pressure cord (currently
> reads EKG-jagged; should meander like a thread). Supersedes 007's tile model; instrument
> (006) + woven-loom synthesis holds.

> **ADDENDUM 9 (Jul 4, late night): THE FULL CLOTH — throughlines settled from docs/DATA.md.**
> Coordinator delivered docs/DATA.md (full data ground-truth + the 42-action event catalog).
> Owner affirmed the woven direction ("now we're getting somewhere... still kinda could be a
> scarf"), confirmed throughlines "+ what we'll see below" (the richer stat set), confirmed
> events-woven-in-varied-by-team, and flagged the event marks aren't beautiful yet (may
> generate bespoke unless I can manage). **SHEET Nº 009 — THE FULL CLOTH**
> (`throughlines-jul4.html`, https://claude.ai/code/artifact/f7734627-ee1d-4300-ab29-7e04acf232a1).
> FIVE THROUGHLINES the wire supports (derived real from bundle): BELIEF (1X2, the ground) ·
> POSSESSION (territory share — ARG 63%, a fine gold cord) · PRESSURE (danger grades — the bold
> dark meander, now SMOOTHED per note) · TEMPO (event rate — right rail, peaks at half-ends) ·
> CROWD (rooted/roar — selvages, specimen, never mixed w/ market). The true story the cloth
> tells: ARG owned ball+odds yet CPV's danger-thread spiked and scored against the run — no
> single line shows it. EVENT CATALOG: 42 wire actions → woven marks, varied by TYPE × TEAM
> (goal×{shot,head,own}; shot×{on-target,off,blocked,woodwork}; yellow/red; VAR as a held SPAN;
> penalty; injury; corner; sub) — FIRST-PASS marks, the system not the final craft.
> Data facts locked from DATA.md: scorer names from TxLINE itself (lineups+PlayerId, no external
> API); shots-on-target IS free (Outcome enum); possession/territory derivable; VAR has start+end;
> Stats block (64 keys, ~19 populated) undecoded — one email unlocks possession%/fouls/etc.
> Only missing fan-stat = passes. **MARKS DIVISION OF LABOR (proposed): I own throughlines +
> the legible mark SYSTEM (geometry/colour/placement laws); owner generates bespoke jewel
> objects for hero events (goals above all); I socket them into the weave.** NEXT: a MOVING
> prototype (the five threads + a woven-in goal actually flowing) — the true woven-vs-tiled test
> — then LOOM-SPEC.md → fabrication. Pending: owner confirm the 5 throughlines + the marks split.

> **ADDENDUM 10 (Jul 4, night): THE LIVING LOOM — first animated prototype.** Owner: wants a
> PROTOTYPE (first version worth prototyping), push the aesthetics, events ideally ONE WITH THE
> LOOM (woven not patched — "Albers didn't patch them on"), and an early version WIRED IN before
> tonight's France game ends. **BUILT: `apps/web/public/loom-proto.html`** (published artifact
> https://claude.ai/code/artifact/ae8f2e46-c93b-4da5-ae6a-4ea4fa5f8b87) — an ANIMATED, playable
> loom weaving the real ARG–CPV replay through time. Five throughlines FLOW as it weaves (belief
> ground · gold possession cord · black pressure cord · tempo rail · crowd selvage sparks); the
> shuttle rides the live edge; bare warp waits below ("the match not yet woven"). EVENTS ARE THE
> THREADS REACTING, not stamps: a GOAL = a gold weft crossing the whole cloth + the belief ground
> COLLAPSING (blue→red at the 58' cliff) + the pressure cord surging; shots = small woven notches;
> a card = a checked slub in the selvage; VAR = the weave HOLDS (faint held band). Controls:
> play/pause · speed 2/8/30× · restart · scrubber · jump chips (KO/28'/58' cliff/90' death/ET).
> Real fonts embedded. Verified in browser (rAF throttles in backgrounded automation tabs — it
> animates in a focused tab; goal-weave + belief-collapse confirmed at t=61). **WIRING SEAM for
> live France (Paraguay–France 18188721, coordinator's lane):** the prototype reads embedded
> DATA arrays (PH/SH/ARGP/CPVP/TEMPO) + EVENTS[]; swapping those for a live SSE-fed feed makes it
> play the live match — I'll define/expose a `window.__loomFeed` interface for the coordinator to
> push frames. NEXT: (a) coordinator wires live France into the feed; (b) owner generates a
> bespoke goal object to socket in (the one place canvas hits its ceiling); (c) LOOM-SPEC.md.
> Aesthetic bet (events woven-in, not patched) — VALIDATED and beautiful.

> **ADDENDUM 11 (Jul 5): BESPOKE OBJECTS SOCKETED IN.** Owner generated the hero objects
> (GPT 5.5) into `design/generations/`: the pinwheel BALL in 3 chenille colourways
> (black master · sky-blue/white=ARG · red/black=CPV) and the GOOOOL embroidered eruption
> (pinwheel O's on a Bauhaus starburst w/ gold-bullion rays + benday halftone). Extracted
> clean transparent assets → `apps/web/public/assets/` (ball-arg/ball-cpv/ball-master +
> gooool.png; ellipse-mask for balls, border flood-fill for the GOOOOL to kill the baked
> checker bg) and embedded as data-URIs in `loom-proto.html`. WIRED INTO THE LIVING LOOM:
> at each goal the scoring team's embroidered ball is woven in on the gold weft (persistent,
> scrolls with the cloth) + belief collapse + pressure surge; the GOOOOL erupts as a
> real-time celebration (pop-in→settle→fade, ~2.7s, speed-independent). Verified compositing
> in browser — beautiful. Prototype (same artifact URL
> https://claude.ai/code/artifact/ae8f2e46-c93b-4da5-ae6a-4ea4fa5f8b87) now demonstrates the
> socket model working: **owner generates bespoke objects, they weave straight in.** Owner
> notes still open: TEXTURE pass (weave still reads pixely — make weft read as thread, ink
> variation, fibre tooth; deferred until objects+feed settle). PENDING: (a) `__loomFeed`
> interface for live wiring (Brazil–Norway Jul 5 20:00 UTC / hero USA–BEL Jul 7) — coordinator's
> lane; (b) LOOM-SPEC.md.

> **ADDENDUM 12 (Jul 5, overnight refinement): WOVEN TEXTURE + TEAM THEMING + FT BEAT.**
> Owner requested team theming (for the live test) + an autonomous refinement session with
> "brilliant results" for morning; flagged the loom still read "pixely video game." Delivered in
> `apps/web/public/loom-proto.html` (same artifact URL; MORNING-LOOM.md written):
> **(1) MATERIALITY** — belief ground now real cloth: pre-baked warp+weft interlacement texture
> (soft-light, scrolls with the cloth) + per-weft thread crowns + fibre-fleck layer + dye-lot
> variation + selvage keyline; throughline cords rewritten as COUCHED CORD (shadow/body/core-
> shadow/ply-glints). Reads at the embroidered objects' level. Perf 0.88ms/frame (~1100fps).
> **(2) TEAM THEMING** — `window.__loom.teams(home,away)` themes tricodes/names/inks/sparks/ball;
> verified BRA–NOR. Ball fallback: blue→arg, red→cpv, else black/cream master (per-team ball
> recolour still a follow-up). **(3) FT KEEPSAKE BEAT** — at full time the cloth frames in gold +
> "THE SCARF IS YOURS · score"; ET woven in honest market-dead grey with goal-balls blazing.
> New soccer-ball emblems (replacing the "radioactive" pinwheels) + soccer GOOOOL socketed.
> NOT done (owner's call): press-black night colorway (clean toggle add), per-team ball recolour,
> looser/hand-woven texture irregularity. NEXT: owner's texture verdict → night mode + per-team
> balls before USA–BEL (Jul 7) debut; coordinator wires live via __loom (Brazil–Norway 20:00 UTC
> rehearsal).

> **ADDENDUM 13 (Jul 5, owner's 3 bugs — fixed, verified, republished).**
> Owner reviewed A12 and caught three: (1) after goals the two cords vanished / black went straight;
> (2) cloth turned beige after 90' ("reads as a bug — don't we have a winner prediction?"); (3) shots/
> cards barely visible. All fixed in `loom-proto.html` (same artifact URL):
> **(2) is the big one and the owner was right — a real bug, not honesty.** A12 claimed ET was "honest
> market-dead grey"; that assumption was WRONG. Re-extracting the capture with a correct continuous-
> minute mapping proved the 1X2 **prices the winner through extra time**: de-vigged H 0.91 on ARG's
> 92' goal → **draw-heavy 0.55 at 103–110** (2–2, heading to penalties) → 0.94 on the 111' winner.
> Replaced the home-only `PHk` + `if(m>90)return null` with the **real de-vigged [H,D,A] triple `BEL`
> (min 2–120)**; `drawBelief` paints real home/draw/away band widths (the draw band matters — at 105'
> the honest read is CREAM, not CPV-red). Same wrong assumption corrected in COORDINATOR-LOOM-WIRING.md
> (don't cut belief at 90' for knockouts). **(1)** was the ET region too: replay froze possession to 0.5
> and had ~no ET danger, so both cords flatlined to centre (black over gold). Extended SH/ARGP/CPVP/
> TEMPO to full 0–124 from the bundle; accessors index the full arrays (no 90' branch); possession cord
> clamped off the selvage so it can't vanish. **(3)** shots → cream-backstitched embroidered strikes
> (team-inked, knot 'ball'); cards → woven yellow card-tags (shadow/backing/keyline/stitches) at the
> selvage — still placeholders for owner's bespoke objects. Verified in-browser at 68'/105'/124' (cloth
> colour honest through ET, cords weave to FT, events legible, FT beat intact), 0 console errors. NOT
> changed: night colorway, per-team ball recolour, texture looseness (still owner's call).

> **ADDENDUM 14 (Jul 5, NIGHT colourway — built, default-on).** Owner green-lit all three follow-ups
> ("2. still no clue what this is — but go for it. all games are at night for euro timezones"). Built the
> **press-black NIGHT colourway** as a palette-only skin (honesty intact — no mark changes meaning): a
> `SKIN{day,night}` object + `bink()` route paper→press-black, draw-band→dark warm slate, warp→dark,
> the pressure cord→bone (inverted so it reads on black), selvage keyline→thin gold, tempo rail→bone;
> team inks get a +0.14 lift so they **glow floodlit**, gold stays gold. A `☀ DAY / ☾ NIGHT` toggle
> flips it live. **Night is the default** (all euro-timezone kickoffs are night). Verified 68'/124' both
> modes, 0 errors; snapshots in `versions/` (v13 honest-ET, v14 night). Per-team **ball prompts** written
> for all 14 remaining teams (COL GHA CAN MAR PAR FRA BRA NOR MEX ENG POR ESP USA BEL) — owner generates
> in the 12_48_20 aesthetic, I extract+socket into a per-team registry (colours sourced from
> `src/data/fixtureMeta.ts`). **Texture looseness (subtle hand-loomed): NEXT focused pass** — owner OK'd
> "subtle," noted versions are always preserved so dead-ends are restorable.

> **ADDENDUM 15 (Jul 5, per-team BALLS socketed + hand-loomed texture).** Owner generated all 13
> remaining team balls (PAR skipped — Paraguay eliminated) in the `12_48_20` embroidered-soccer-ball
> aesthetic → `design/generations/balls/<TRI>.png`. I extracted (alpha-trim; **ESP** had no alpha so
> flood-keyed the bg), normalised to 144px, embedded as a **tricode-keyed registry** (`BALLSRC`/`BALLIMG`,
> ~722KB) and wired `ballFor(tri,ink)` into `__loom.teams` so any fixture auto-weaves the scoring team's
> emblem; ARG/CPV demo unchanged (imgA/imgC). Verified BRA/NOR end-to-end (right ball + theme). **Texture:**
> the subtle hand-loomed pass — warp threads now **jitter** (±0.85px, varied darkness) instead of a ruler
> grid, plus sparse **slubs** (fatter picks), deterministic per a `WOB` seed so each minute is stable and
> re-viewable; stays clearly sub-threshold to the data. Verified day+night, 0 console errors. File 1.4MB,
> snapshot `versions/v15-balls-texture`. Only ARG/CPV still use the original pair — regenerate ARG.png +
> CPV.png in the same batch if you want the demo emblems to match the new 13.

> **ADDENDUM 16 (Jul 5, the language locked): PAPER & CLOTH.** Owner gated the site-language session:
> the Loom REPLACES the stage as the live surface (gap #3 closed) · debut scope = MATCH + ALBUM
> (USA–BEL Jul 7) · direction A "PAPER & CLOTH" approved ("only the highest quality and fidelity.
> true-to-nature and real collectible and intimate feel"). The law: `design/PAPER-AND-CLOTH.md`
> (paper documents/steps via lib/ink.ts · cloth lives/breathes via loom physics · cloth always
> mounted on paper · three sentiments three materials · voice plain/adult, ROOOAR dead). Event
> lexicon reframed on owner's bar ("beautifully woven into the loom as it generates, else vignette"):
> TIER 1 WOVEN structure (brocade-float shots, slub fouls, thread-piecing subs, ladder-run VAR,
> bound-eyelet penalty, selvage-bound cards, red = selvage loses a warp thread) · TIER 2 APPLIQUÉ
> (goals only) · TIER 3 CEREMONY (GOOOOL, the FT pressing). Gate: SHEET 010 — every mark forming at
> the shuttle, day+night, both inks, vignette fallbacks beside borderline marks. Also this session:
> ARG Sol-de-Mayo + CPV star-ring hero balls socketed (15 total, v17, demo defaults swapped);
> FRA improved (rooster) socketed (v16). NEXT: owner reviews the law doc → SHEET 010 build →
> Gate/Rail/Pressing/Album in src/app (Jul 6) → debut Jul 7. Rosette + album-crest prompts ship
> with Sheet 010.

> **ADDENDUM 17 (Jul 5, evening — SHEET Nº 010 THE LEXICON built + published).** The woven event
> vocabulary, live: `lexicon-jul5.html` (artifact 339454f6-88ea-4995-a7ad-ca0d85db4cd0). Twelve
> mini-looms, each a real weave (interlacement texture, tide, shuttle) with its mark FORMING at the
> shuttle then resting in the cloth — day + night, both team inks, click-to-fire, marks alternate
> ends. TIER 1: brocade floats ×4 outcomes (sagged supplementary weft, knot/fray/bone-bar/double-ring
> tips, shuttle rides the tip) · corner weft colour-change · foul slub pick · substitution thread-
> piecing (knot + tail + brief dye lift) · VAR ladder run (warp exposed → catch-up dense, dashed gold
> hold) · penalty bound eyelet (gold binding) · yellow bound selvage · red THE LOST WARP (bind, outer
> warp knots off, cloth weaves 3px narrower below — flagged for deliberate judgment). TIER 2 goal
> reference (gold weft + team ball). Fallback vignette swatches beside VAR/penalty/red. Footer carries
> the FT ROSETTE + ALBUM CREST generation prompts. Verified via clock-locked composite renders (rAF
> throttling in background tabs defeats naive screenshots — lock T, let live frames redraw the same
> instant); 0 console errors across all passes. Specimen tide labeled as demonstration (honesty).
> GATE: owner names weak cells → promote to vignette; gated marks then replace loom-proto's v13
> shot-flick + card-tag. Session also: ARG/CPV hero balls socketed (v17, 15 total) · PAPER-AND-CLOTH.md
> law written (owner-approved A, Match+Album debut scope, loom replaces stage) · memory updated.
> NEXT (Jul 6): owner gates 010 → lexicon into loom-proto → THE GATE + STANDS RAIL + PRESSING + ALBUM
> shells in src/app · rehearsal #2 POR–ESP/MEX–ENG · debut USA–BEL Jul 7.

> **ADDENDUM 18 (Jul 5, late — the LEGIBILITY steer + SHEET Nº 011).** Owner's friend couldn't read
> Sheet 010 cold → owner steering (binding, now in PAPER-AND-CLOTH §4): design for the common soccer
> fan — intelligible first, artistry imbued never the point; marks must be DURATION-TRUE (a shot is
> seconds → a point, not a line — the 010 brocade float lied about time and is retired). Answer:
> the TWO-LAYER law — information wears soccer's own icons, stitched (frame/ball/card/arrows/flag/
> spot/screen); the 010 craft survives as THE WEAVE BENEATH (slubs, narrowing, dye-lot — character,
> not required reading). **SHEET Nº 011 — ICONS IN THREAD** built + published (artifact
> 8c01da5e-4747-4b59-a568-73147e3f064c): goal-mouth glyphs ×4 (bone-stitched frame, ball-knot placement
> = outcome: in/over/bar-front/on-the-bar+clang), stitched cards (yellow + booking hairline at the
> selvage; red + the quiet narrowing kept beneath), broadcast sub arrows in thread, corner flag at the
> team's edge, penalty = the gold-bound spot with ball set down, VAR = held band (true span) anchored by
> the referee's screen glyph, goal appliqué unchanged, foul demoted to layer-2 slub. All forming at the
> shuttle; verified via clock-locked composites day+night (fixed a stitch()-never-stroked bug caught
> on first render), 0 console errors. FT SEAL settled after two rejections (rosette=county-fair,
> medal=corny): no victory symbols — the score is the victory representation; the seal = the WOVEN
> LABEL (blank patch owner-generates, data typeset per match) + HALLMARK ROW on the mount; gold selvage
> seal stays the cloth's only ceremony. Label + pennant prompts on 011's footer. GATE: the friend-test
> rematch — any cell she can't read cold gets named and reworked.

> **ADDENDUM 19 (Jul 5, night — the icon lexicon LIVES in the loom + friend-test pass 2).** Owner ran
> the friend test on 011: blocked shot too chaotic (bar + tiny ball-behind) → **blocked = the goal mouth
> stitched shut** (a solid bone wall, one silhouette, no small parts; rule: outcome states read from
> shape, not tiny objects). Off-target keeps its ball (owner). Fixed on 011 (artifact 8c01da5e…,
> republished). Then wove the gated Sheet-011 icon lexicon INTO `loom-proto.html` (v18): pulled the
> **real ARG–CPV events** from the bundle (27 shots with Data.Outcome, 17 corners, 2 yellows, 14 subs
> Data.Participant, the 89' VAR span) replacing the old synthesized shot list; ported mouthG/cardG/subG/
> flagG/spotG/screenG at loom scale; retired the v13 backstitch-flick + card-tag. Same-minute marks
> auto-stack (no overlap). Persistent states honest + quiet: booking hairline runs from the card to the
> live edge; VAR = dashed-gold hold over its true minutes + the ref screen; red-card narrowing wired
> (NARROWM in drawBelief — none in this replay, live-ready via __loom.event). Verified 58'/69'/91' day+
> night, 0 console errors, belief/cords untouched (honesty intact). NEXT: owner runs friend-test rematch
> on the live loom → then THE GATE + STANDS RAIL + PRESSING + ALBUM in src/app (Jul 6) → debut Jul 7.

> **ADDENDUM 20 (Jul 5, night — live wire + THE STANDS begins).** (1) Wired the loom to the LIVE
> BRA–NOR TxLINE feed: `loom-proto.html?loomfeed=1&match=18187298` — WS opens, real de-vigged 1X2 →
> belief (confirmed BRA 0.55/0.25/0.20 pre-match), clock→live-edge binding, full icon lexicon on real
> events. Added loom-side normalization (adapter speaks 'minute'+'ontarget' → loom 'm'+'on') and a
> FIXTURES→teams map so any of the 8 fixtures auto-themes on connect (BRA-gold/NOR-red, right balls,
> subtitle 'LIVE · BRA–NOR'). Three adapter gaps flagged to coordinator (COORDINATOR-LOOM-WIRING.md):
> card colour, subs, ET-belief-cut — one line each, none block the watch. (2) Owner picked THE PULSE as
> the Stands core but killed stock emoji ("cheap emojis obviously not a vibe — bespoke beautiful rooot
> version"). Built **SHEET Nº 012 — THE PULSE** (artifact fa98078a-0236-4e86-a947-0eca88610d38): six
> bespoke printed feeling-marks — RISE/DROP/JOLT/STONE/KNOT/WHIRL — spot-ink with ink-gain + benday,
> ambiguous/adult/no-faces, same six both ends; the theirs-vs-yours REVEAL (NOR dropped 1,204 vs BRA
> alive 3,891, counts not %); a tappable 25s WINDOW. Verified day+night, 0 errors. (STONE first read as
> a keyboard — refixed to a flat bar.) GATE questions open: reveal caption keep/cut, spot-colour-by-moment,
> KNOT read. NEXT: owner gates the marks → the Stands RAIL build (predict-consensus + cheer/faith + the
> Pulse) beside the loom, per PAPER-AND-CLOTH §2 + MECHANISMS. Debut USA–BEL Jul 7.

> **ADDENDUM 21 (Jul 6, the flag fix · the marks · THE STANDS).** (1) FLAG FIX: the night cloth read as
> Belgium (black + BRA-gold + NOR-red). Fixed by weaving each team's SECOND colour through its OWN belief
> band (green pinstripe in Brazil's gold, navy in Norway's red); neutral draw kept (it's the scarf). Now
> reads as the two teams' kits — a half-and-half match scarf, not a third nation. loom-proto v19, published.
> (2) THE PULSE MARKS: owner generated the six as gorgeous embroidered patches (design/generations/reactions/):
> MUSCLE bicep · FIRE flame · FEAR worried sweating eyes · PRAYER hands · DISAPPOINTMENT slumped figure ·
> ANGER the *@#! swear-burst. Extracted + socketed into SHEET 012 (real marks now, canvas placeholders
> retired). This confirmed the pattern: bespoke objects are the owner's generation pipeline, not my canvas
> hand (which produced beer-mugs and socks). (3) SHEET Nº 013 — THE STANDS built + published (artifact
> label the-stands-rail-v1): the paper rail beside a live cloth strip — THE ENDS (rooted counts, adopt path) ·
> THE CROWD (predict consensus vs market, +0.4 braver, the doubters cut — the third belief) · THE PULSE
> (the six patches window + the split reveal) · THE ROAR (cheer + faith×2). Both registers (woven cloth +
> paper margin) as ONE surface — the Paper & Cloth thesis realized. Day+night, 0 errors. GATE: right four
> modules, right order? NEXT: wire the rail to the live loom so it moves with the match; then the Pressing
> + Album for the debut.

> **ADDENDUM 22 (Jul 6 — the big thinking turn: live-watch fixes · THE BACK · the host palette).**
> Owner watched BRA–NOR live on the loom and steered across the design. (1) FIXES SHIPPED (loom v20,
> republished): live clock now INTERPOLATES 1 min/min between wire ticks (forward-only, 2.5' drift cap)
> — the weave never stalls, verified to 4 decimals via manual frame drive; icons ~25% bigger with
> deeper under-shadow; kit-threads half-drop staggered (twill read) + deeper crowns; scored penalties
> promote to goals loom-side (belt+braces). Coordinator gaps №4–6 filed: pen→goal ledger event (the
> big one, owner-flagged; test with par-fra bundle), subs confirmed zero live, both with exact fixes.
> (2) **SHEET Nº 014 — THE BACK OF THE CLOTH · THE COUNT** (artifact 9a631d0a…): the stats-card
> concept — the woven care-label tab at the cloth's edge; pull it and the match flips (two hard frames)
> to its printed back. Every stat a pictogram whose geometry carries the number: corners as growing
> quarter-arcs w/ flags (owner's idea), SAVED as the keeper's glove in the mouth (owner's pivot —
> celebrate the goalie), blocked as the shut mouth in the defender's ink, possession as two wound
> spools joined by the gold thread, the CLIFF 93→63 stepped, the FRANTIC MINUTE 105'·38, THE THREE
> BELIEFS (crowd honest '—' until predict lives). Real ARG–CPV wire numbers; subs plate held back
> pending wire dedupe (raw feed double-counts changes — flagged). (3) **THE HOST PALETTE** debuts on
> 014: VERDE/ROJO/AZUL (México·tri-nation·USA) on newsprint, Bauhaus builds, Lichtenstein restraint;
> dosage law in PAPER-AND-CLOTH §2 — host colours dress the room + non-team plates, team ink alone
> carries team data, gold reserved. GATES on 014: the flip as the answer · any plate reading cute ·
> palette dosage. On owner's word: palette flows into THE STANDS, pictograms into the live back page.

> **ADDENDUM 23 (Jul 6 — 014 v2: plate rulings · real names · THE SCROLL · THE GROUND).** Owner gated
> 014: flip approved; three plates redirected + one blessed. Rebuilt per the infographic-inspo lessons
> (counts as REPEATED BOLD UNITS · the one-exception device · dot-tip rod energy): **SAVED** = glove
> alone (no goal), one ball arced above per save — 4 and 7, countable · **THE WALL** = a brick laid per
> block (5/4 bricks, staggered courses) · **INTO THE STANDS** = off-target shots landed among terrace
> crowd-dots (2/5 team balls) · **THE BOOKINGS** = the referee's open notebook with REAL NAMES OFF THE
> WIRE — resolved PlayerIds through the lineups roster (double-escaped JSON in the bundle): Pina 68'
> (CPV) · Montiel 115' (ARG); Messi/Duarte confirm scorers name themselves the same way. **THE SCROLL**
> (the full stats page as one importance-ordered scroll): 1 HEADLINE (score/beliefs/cliff) · 2 GOAL
> MOUTH · 3 TERRITORY · 4 BOOK & BENCH · 5 FINE PRINT (quiet tabular) · 6 PROVENANCE — picture-density
> decays with importance. **THE GROUND** (navigation as stadium anatomy): ONE match page — scoreboard /
> the cloth (THE COUNT flips IN PLACE via the care-label tab) / the stands below by scroll; no tab bar;
> masthead tags THE CASE (album) + YOUR SEAT (profile: stubs, scorecards, later your row/friends) are
> the only exits; live match → site opens on the ground. All on artifact 9a631d0a (v2, both dyes).
> GATES: the four new plates · scroll order · THE GROUND model · palette dosage (standing).

> **ADDENDUM 24 (Jul 6 — BUILT: THE COUNT lives in the loom, v21).** "i like it. let's build." Done:
> the gated 014 design is now real inside `loom-proto.html`. The CARE-LABEL TAB (bone, gold thread,
> 'THE COUNT') hangs at the cloth's right selvage by the live edge; click → a HARD TWO-FRAME paper flip
> (one squeezed intermediate, no easing) → THE BACK: the scoreboard stays, the cloth area becomes the
> printed page with wheel/drag scroll + thumb hint. All tiers LIVE-COMPUTED from the loom's own state
> at time t (replay AND live paths): HEADLINE (three beliefs — opening market from the first real tick,
> crowd '—', score/result) + THE CLIFF (computed over the belief series — and it CORRECTED us: at FT
> the hardest fall is 93→41 at 103', the ET equalizer, not 58') · GOAL MOUTH (gloves + one-ball-per-save,
> brick walls per block, terrace with landed shots — counts tick as t advances) · TERRITORY (corner arcs
> grow, spools from running possession avg, frantic minute) · THE BOOKINGS (real names: card events now
> carry name — PINA 68', MONTIEL 115') · FINE PRINT (prints at full time only — honest; 30/32 FK,
> 30/34 TI, 11/7 GK, 11 injuries) · PROVENANCE (fixture · date · hallmark squares · Nº —). Return tab
> 'THE CLOTH' flips home. Verified: back at 69.5' (counts mid-match), FT scrolled bottom, day + night,
> front intact, 0 console errors. Snapshot v21, republished (same artifact). NEXT: THE GROUND assembly
> (scoreboard/cloth/stands as one page, Stands rail wired live + host palette applied) → THE PRESSING →
> THE ALBUM for the Jul 7 debut; coordinator: adapter gaps 1–5 + e.name on cards/goals for the book.

> **ADDENDUM 25 (Jul 6/7 — THE FULL BUILD: Mirror-grade COUNT · red-✕ glyphs · THE GROUND wired).**
> Owner: "directionally fine, far from the full build — aim at the LLM Mirror aesthetically; the plate
> symbols won't weave at loom scale; implement alongside a full wiring (BRIEF-FANSECTION)." Done, v22:
> **(1) THE COUNT rebuilt in the Mirror register** (steeped in mirror-mobile.html: numbered kickers,
> SENTENCE headlines with one gold emphasis, plain deks, ONE object + huge light number per chapter,
> scroll=narrative): now a DOM page (native scroll) over the cloth — 11 chapters: 01 WHAT EVERYONE
> BELIEVED (three beliefs) · 02 THE CLIFF ("The hardest fall came at 103'.") · 03 THE KEEPERS (gloves,
> one ball per catch) · 04 THE WALL (a brick per block) · 05 INTO THE STANDS · 06 CORNERS · 07 THE BALL,
> HELD (live: pressure-share proxy, honestly labelled; possession awaits the TxODDS catalog — "we don't
> fake numbers") · 08 THE FRANTIC MINUTE (the one-exception device: 90 thin lines, one verde) · 09 THE
> BOOK (names) · 10 FINE PRINT (FT-only) · 11 PROVENANCE. Live-refreshes ~1s while flipped.
> **(2) Loom glyphs v3:** mouths 30px; OFF = a bold red ✕ in the mouth (owner's call) — reads at a
> glance on the cloth; saved=ball-in, blocked=shut mouth, wood=ball-on-bar stay.
> **(3) THE GROUND fully wired** per BRIEF-FANSECTION: stands-adapter + stats-adapter included; the
> STANDS RAIL sits under the cloth (stadium anatomy): THE ENDS (rooted bars + STAND WITH buttons →
> __stands.root) · THE CROWD (consensus + doubters beside THE MARKET's live H·D·A triple — never
> blended) + predict stepper (NAME IT → __stands.predict, stamped v market) · THE PULSE (the six real
> patches → __stands.momentReact on onMoment windows, split reveal on onMomentResult; specimen reveal
> offline) · THE ROAR (CHEER → __stands.cheer, meters from onState). Host palette bands on modules
> (azul/verde/rojo/gold). Replay mode = labelled SPECIMEN; smoke-tested LIVE on 18193785 (USA–BEL):
> all three adapters connect, rail flips to LIVE — debut-ready. Fixed en route: chapter canvases
> inherited .loom cream/radius (overridden), countPage contained below scoreboard, g const→let.
> Verified: chapters at 69.5' + FT scrolled, day+night, front intact, 0 errors. Snapshot v22, republished.

> **ADDENDUM 26 (Jul 7 — ROLE CHANGE: design coordination begins).** Owner verdict on v22: "at best a
> good prototype… graphics nowhere close to the Mirror. Not beautiful enough." + the loom needs a
> first-time-visitor UX pass (the cords/threads unexplained) + the copy "keeps telling — unbearable."
> Standing directive: the main session is now DESIGN COORDINATOR; taste instances are spun off to
> review + implement. Brief: design/COORDINATION-PASS1.md (the Mirror bar, the laws, the verification
> playbook incl. rAF-throttle + scroll-blank workarounds). PASS 1 LAUNCHED (two parallel instances):
> (A) STAT GRAPHICS — rebuild all 11 COUNT chapters to gallery grade (cliff as THE object, gloves at
> real scale, architectural wall, curved terrace, catenary spool-thread, one-exception frantic field,
> ledger book, embossed hallmarks; concepts stay owner-gated, execution elevated; front face untouched);
> (B) COPY PURGE — full string audit → design/COPY-MAP-PASS1.md (deks that explain die; meta/honesty-
> talk dies; coaching dies; LOCKED list protects gated names + THE SCARF IS YOURS). Coordinator
> integrates A, applies B, verifies, snapshots v23, republishes. PASS 2 queued: cold-eyes instance with
> zero context narrates the loom → findings drive the interactive legend (tap-a-thread → printed tag).

> **ADDENDUM 27 (Jul 7 — THE COLLECTIBLE LAW).** Owner, mid-Pass-1: "each stat or piece of the site
> should feel like a collectible. a panini-grade object that can be shared. that's every stat, every
> page, every moment. this is the bar. it is the case for the mirror… 'great insights meet great
> design' at every turn." Codified in PAPER-AND-CLOTH.md §1 + COORDINATION-PASS1.md addendum. The
> operational test, applied at every gate from now on: CROP THE PIECE OUT ALONE AND SEND IT TO A
> FRIEND — does it still carry its full story and full craft? (Complete composition · provenance
> whisper · one silhouette · made-object presence; composition, not chrome.) Relayed live to the
> running graphics instance (SendMessage) with orders to re-judge finished chapters under the crop
> test. Some moments graduate to literal keepsakes (scarf, stubs, quilt tiles); the standard applies
> to all.

> **ADDENDUM 28 (Jul 7 — the Panini references, calibrated).** Owner added design/references/panini/
> (Nantes spread · GOT,GOT,NEED · Chelsea card-fan · Nike Brasil grid) with the guard: inspiration for
> what "collectible" can look like — the site as a visually coherent object that almost doubles as a
> collector's item — while the design remains FIRMLY Bauhaus. Coordinator's four calibrated lessons
> (in COORDINATION-PASS1 ADD.2, relayed live to the graphics instance): (1) the PAGE is the collectible
> — one committed ground per chapter, grid + exactly one grid-breaker; (2) NAME-PLATES on every object
> (name · fixture · minute, Doto caps) + ONE hairline frame family site-wide — system, not chrome;
> (3) the card-fan presentation reserved for keepsake moments (the Pressing's stack); (4) the Nike
> Brasil grid is the register-of-record: type-as-picture, committed two-tone fields, numbered roundels
> — Bauhaus-as-collectible, zero kitsch. Adopted vocabulary: GOT · GOT · NEED for THE ALBUM's slots.

> **ADDENDUM 29 (Jul 7 — PASS 1 INTEGRATED: v23).** Both taste instances returned; coordinator
> integrated. GRAPHICS (instance A, ~50min, self-verified day+night at 124'+30'): all 11 COUNT
> chapters rebuilt to the Mirror bar under the Collectible Law + Panini lessons — 01 as quiet ledger
> rows (huge Doto numerals, hairlines); 02 THE CLIFF as coursed belief-strata landmass with the lost
> chance cascading down the face (data-carrying bars, ~1 per 4.2 points); 03 satin-stitch GLOVES at
> real scale (thread runs, ply glints, knuckle seams) with one ball chip per save; 04 hand-laid
> MASONRY (per-brick jitter, mortar shadow); 05 one full terrace with bowl sag + aisles, wild balls
> seated in the crowd; 06 CORNERS as countable ring-fans from the canvas's own corners + flags;
> 07 SPOOLS with true-catenary gold thread (bisection solve); 08 the one-exception minute field;
> 09 saddle-stitched notebook with ledger leaders (MONTIEL 115' · PINA 68'); 10 typographic fine
> print; 11 letterpress hallmark punches. Every chapter closes with a name-plate (object · fixture ·
> minute) — the crop test passes per chapter. COPY (instance B): 37/37 map entries applied on the
> integrated file (0 misses/dupes) — self-annotation dead, honesty-meta dead, coaching dead; heads
> state facts ("Shots on target, kept out."). Legacy canvas drawBack silenced (both call sites →
> drawBackUnder; mode-toggle now re-renders the DOM count). Coordinator-verified: chapters 01/03/04/
> 06/07 eyeballed night, front cloth intact at 69.5', 0 errors. Snapshot v23-pass1-integrated,
> republished. Known guards: live counts >12 crowd gracefully; book redraws on minute tick.
> PASS 2 LAUNCHED: cold-eyes instance (zero context, visitor toolkit only) on the loom.

> **ADDENDUM 30 (Jul 7 — COLD EYES verdict + PASS 3 launched).** The zero-context visitor study
> (design/COLD-EYES-PASS2.md) returned. WHAT LANDS: the cold open ("THE MATCH NOT YET WOVEN" →
> concept understood unaided), "THE SCARF IS YOURS" seals the idea, goals/red-X/corner-flags/VAR/
> ground-as-belief/the-cliff-flood all read instantly, THE COUNT is "self-explanatory infographics,"
> the Pulse reveal + CHEER were "the two moments I felt counted." WHAT BLOCKS (ranked): (1) the two
> cords never confidently learned (POSS% header contradicted guesses; THE KEY buried in the basement,
> no side attribution); (2) THE COUNT tag not signalled tappable — "the hidden gem may never be
> found"; (3) tempo blocks + sub chevrons opaque; (4) the away selvage misread as "danger," own end
> invisible, CHEER never lands on the cloth; (5) trust wobbles — ● LIVE during replay, NAME IT
> accepted at 112'; (6) wanted: tap any mark for its story; unroll the FT scarf; (7) deck reads 70%
> product/30% workbench, DAY/NIGHT "secretly the sales pitch" hidden among debug. THE ONE CHANGE:
> tappable marks with one stitched line each — teach every symbol at the moment of curiosity.
> → PASS 3 spec written (COORDINATION-PASS1 tail) + taste instance launched: pinned tap-tags on all
> cloth elements (goals carry the belief swing), THE KEY as a left-selvage care-label card with LIVE
> swatches + side attribution, one-time tab breath, cheer echo spark (own taps only — honest), ●LIVE/
> ○REPLAY truth, specimen KO-lock on NAME IT, deck split product/transport. FT scarf unroll →
> backlog (THE PRESSING build).

> **ADDENDUM 31 (Jul 7 — PASS 3 INTEGRATED: v24, THE LEGEND lives).** The taste instance delivered the
> full cold-eyes answer, coordinator-verified (own click → "ARG GOAL · 92′ · ARG 57→93" pinned to the
> ball). Shipped: TAP-A-MARK pinned tags on every cloth element (hit-boxes per frame, smallest-wins;
> cords by polyline proximity; tags scroll WITH the cloth and self-dismiss when the subject leaves;
> goals carry the real belief swing computed minute−1→+2) · THE KEY as a left-selvage care-label card
> with LIVE swatches redrawn from the actual cloth logic + ARG LEFT · CPV RIGHT attribution · one-time
> tab breath (localStorage, reduced-motion-safe) · CHEER echo sparks on YOUR OWN selvage only (honest)
> + specimen roar bumps your end · STAND WITH +1s with honest bookkeeping on switch · ● LIVE only when
> live, else ○ REPLAY grey · NAME IT → LOCKED AT KICK-OFF past 0.5′ (reopens on restart) · deck split
> product row (DAY/NIGHT + moment chips) over quiet transport strip. Front-face purity proven by the
> instance via iframe pixel-diff: 0 of 665,040 px differ with no tag open. Coordinator crumbs applied:
> basement legend line removed (THE KEY tab supersedes), warp caption gated t<124. Zero errors.
> Snapshot v24-legend-integrated, republished. Deferred (logged): half-time seam mark, THE CROWD panel
> market/hearts layout clarity, FINE PRINT mid-match copy tone, FT scarf unroll (→ THE PRESSING).
> Cord tap-targets ~8-9px = tight on touch — phone test before debut.

> **ADDENDUM 32 (Jul 7 — FINAL: the coordinator is retired).** Owner verdict on v24: "not in the host
> nation's colors · not bespoke design, most certainly not bauhaus · not beautiful or collectible ·
> keeps random prose ('The referee wrote names.', STAND WITH instead of asking who you're rooting
> for). Terrible work." Retirement accepted. The full accounting — four failures with root causes,
> process prescriptions, the owner's complete canon of rulings, the state of every file/asset/wire,
> and the one sentence to carry — is in **design/HANDOFF.md**. Successor: read it before touching
> anything, then sketch one frame in the host melange,real Bauhaus composition, and put it beside the
> Mirror before showing the owner. Fail better.
