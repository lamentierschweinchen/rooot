# COPY MAP — PASS 1 (loom-proto.html)

*Taste instance, copy audit. Target read-only: `apps/web/public/loom-proto.html`.
Every `old` below verified byte-exact and unique (count==1) in the file as of this pass.*

## Verdict

The copy's disease is that the interface annotates itself. Every object arrives with a
sentence explaining the metaphor the eye has already parsed ("a brick for every body in
the way", "wound onto spools", "one ball per catch"), the product keeps testifying to its
own virtue ("never blended", "an honest proxy", "we don't fake numbers", "the doubters,
counted"), and it coaches the hand ("name the score below"). Show-then-tell, everywhere:
the cloth shows it, then a caption says that it showed it. The cure applied here: objects
and numbers state; labels name units and attributions in caps; every surviving sentence
states a fact; everything else is deleted. 37 entries — 8 outright deletions, 3 amputated
tails, the rest compressed to facts.

## Conventions (for the applier)

- **JS entries** include their surrounding single quotes (or the full expression) so the
  replacement stays valid JS; a deletion is the empty literal `''`.
- **HTML entries** are bare text nodes; a deletion is `""` (the wrapping tag stays, empty).
- Escapes like `\u00b7` are the file's own bytes — apply with exact-match python, not an
  editor that might normalise them.
- Two entries are surgical fragments of longer lines (the doubters tail, the REAL WIRE
  tail); they end at a quote/brace on purpose — replace the fragment only.

## The map

```json
[
 {
  "old": "PROTOTYPE · WOVEN · REAL REPLAY ARG–CPV",
  "new": "PROTOTYPE · REPLAY · ARG–CPV",
  "note": "badges are facts; WOVEN decorates, REAL protests too much"
 },
 {
  "old": "WHO'S IN THE GROUND",
  "new": "STANDING, COUNTED",
  "note": "conversational question -> bureaucratic unit label (they are counts of fans who stood)"
 },
 {
  "old": "FANS BESIDE THE MARKET &#8212; NEVER BLENDED",
  "new": "",
  "note": "honesty-meta; the two labelled columns already show the separation"
 },
 {
  "old": "predictions open &#8212; name the score below",
  "new": "PREDICTIONS OPEN UNTIL KICK-OFF",
  "note": "coaching ('name the score below') -> the window stated as fact; stepper+NAME IT are self-evident"
 },
 {
  "old": "THE ROOM'S FEELING",
  "new": "FEELING, PER END",
  "note": "vague poetics -> names the unit precisely; pairs with LOUDNESS PER END"
 },
 {
  "old": "HOW IT FEELS &#8212; TAP ONE",
  "new": "TAP ONE",
  "note": "instruction capped at the allowed three words; the tiles say the rest"
 },
 {
  "old": "SPECIMEN &#8212; THE RAIL GOES LIVE WITH THE WIRE",
  "new": "SPECIMEN",
  "note": "roadmap-meta; the state word alone is the fact"
 },
 {
  "old": "THE WEAVE, LIVE</span> — five throughlines flow as it weaves:",
  "new": "THE KEY</span> —",
  "note": "explainer clause deleted; legend keeps only its legitimate job (naming channels)"
 },
 {
  "old": "\n  EVENTS ARE THE THREADS REACTING — a goal is a gold weft + the belief snap + the pressure surge, not a stamp. The bare warp below the\n  shuttle is the match not yet woven. <b>Live-ready: the coordinator wires a match into window.__loom and this weaves it live.</b>",
  "new": "",
  "note": "three sentences narrating what the cloth shows + coordination notes leaked into UI"
 },
 {
  "old": "'01 / WHAT EVERYONE BELIEVED'",
  "new": "'01 / THE THREE BELIEFS'",
  "note": "kicker as object name like every other chapter, not narration"
 },
 {
  "old": "'The market\\u2019s opening word \\u00b7 the crowd\\u2019s answer \\u00b7 the score, so far. Never blended.'",
  "new": "''",
  "note": "restates the h3 and the three column labels; NEVER BLENDED is honesty-meta"
 },
 {
  "old": "TH.homeTri+'\\u2019s chances, '+m.cl.from+'-in-100 to '+m.cl.to+', in one swing of the wire.'",
  "new": "TH.homeTri+'\\u2019S CHANCES IN 100'",
  "note": "from/to already stand huge in the object; keep only attribution + unit as caps label"
 },
 {
  "old": "'The gloves kept the score <em>honest.</em>'",
  "new": "'Shots on target, kept <em>out.</em>'",
  "note": "narration (and an 'honest') -> the stat stated; frees the dek to die"
 },
 {
  "old": "'One ball per catch \\u2014 shots on target, kept out.'",
  "new": "''",
  "note": "device-explainer; the definition moved into the headline"
 },
 {
  "old": "'A brick for every body <em>in the way.</em>'",
  "new": "'Shots <em>blocked.</em>'",
  "note": "explains the brick metaphor the eye already parsed"
 },
 {
  "old": "'Shots blocked \\u2014 credited to the defence that threw itself in.'",
  "new": "'CREDITED TO THE DEFENCE'",
  "note": "attribution is a real non-visible fact (ARG BLOCKS is ambiguous); rest was narration"
 },
 {
  "old": "'The wild ones found <em>the crowd.</em>'",
  "new": "'Off <em>target.</em>'",
  "note": "cute narration -> the stat"
 },
 {
  "old": "'Off target \\u2014 one ball where each landed.'",
  "new": "''",
  "note": "fact moved to headline; ball-per-dot is visible"
 },
 {
  "old": "'Flags, grown to <em>size.</em>'",
  "new": "'Corners <em>won.</em>'",
  "note": "explains the arc device -> states the stat"
 },
 {
  "old": "'The arc grows with the count.'",
  "new": "''",
  "note": "pure encoding-explainer; numbers sit beside the arcs"
 },
 {
  "old": "var terrNote = (stx().live? 'Share of attacking pressure \\u2014 an honest proxy, not possession (that number awaits the TxODDS catalog).' : 'Average of the minutes so far \\u2014 who held the ball.');",
  "new": "var terrNote = (stx().live? 'POSSESSION \\u00b7 AWAITING CATALOG' : '');",
  "note": "honest-proxy parenthetical is meta; live keeps the one non-visible fact, replay dek redundant with 'OF THE MINUTES' label"
 },
 {
  "old": "'Wound onto <em>spools.</em>'",
  "new": "'Minute by <em>minute.</em>'",
  "note": "spools are visible; the method (per-minute share) is the fact worth a headline"
 },
 {
  "old": "'Ninety-plus minutes alike \\u2014 one refused to behave. '+m.fr.v+' actions.'",
  "new": "m.fr.v+' ACTIONS'",
  "note": "'refused to behave' narrates; keep value + unit only"
 },
 {
  "old": "'Straight off the wire\\u2019s own team sheets.'",
  "new": "''",
  "note": "provenance brag; chapter 11 owns provenance"
 },
 {
  "old": "'For the ones who read to <em>the end.</em>'",
  "new": "'Everything else, <em>counted.</em>'",
  "note": "audience flattery -> what the table is"
 },
 {
  "old": "'Some numbers are still <em>in the post.</em>'",
  "new": "'Possession \\u00b7 fouls \\u00b7 offsides \\u2014 <em>pending.</em>'",
  "note": "cute metaphor -> names the missing numbers and the state"
 },
 {
  "old": "'Possession \\u00b7 fouls \\u00b7 offsides \\u2014 awaiting the TxODDS stat catalog. We don\\u2019t fake numbers.'",
  "new": "''",
  "note": "WE DON'T FAKE NUMBERS is the exact banned meta; list moved into headline"
 },
 {
  "old": "'Every thread <em>accounted.</em>'",
  "new": "'Woven from the <em>wire.</em>'",
  "note": "honesty-brag -> origin stated as fact (voice.ts: stated, never sold)"
 },
 {
  "old": "'LIVE \\u2014 THE STANDS SERVICE'",
  "new": "'LIVE'",
  "note": "infrastructure name-dropping; LIVE is the fact"
 },
 {
  "old": "'your call resolved: <b>'",
  "new": "'YOUR CALL \\u00b7 <b>'",
  "note": "process word 'resolved' + lowercase -> caps label + the verdict speaks"
 },
 {
  "old": "'named: <b>'",
  "new": "'NAMED <b>'",
  "note": "register: caps, no colon"
 },
 {
  "old": "'</b> \\u00b7 stamped against the market \\u00b7 locks at kick-off'",
  "new": "'</b> \\u00b7 LOCKS AT KICK-OFF'",
  "note": "'stamped against the market' is process-brag; deadline fact stays, caps"
 },
 {
  "old": "predict they don\\u2019t win \\u2014 the doubters, counted.'",
  "new": "predict they don\\u2019t win.'",
  "note": "'the doubters, counted' is the product admiring itself"
 },
 {
  "old": "(mo&&mo.kind?String(mo.kind).toUpperCase():'HOW IT FEELS')+' \\u2014 TAP ONE'",
  "new": "(mo&&mo.kind?String(mo.kind).toUpperCase()+' \\u2014 TAP ONE':'TAP ONE')",
  "note": "moment kind stays a fact; bare fallback is just the 3-word instruction"
 },
 {
  "old": "' · possession '",
  "new": "' · POSS '",
  "note": "labels are CAPS; matches the canvas header's POSS"
 },
 {
  "old": "'% · pressure '",
  "new": "'% · PRESSURE '",
  "note": "labels are CAPS"
 },
 {
  "old": "+' \\u00b7 REAL WIRE'; }",
  "new": "; }",
  "note": "REAL protests; LIVE + fixture already state it"
 }
]
```

## LOCKED-CONFIRMED (checked, present, untouched)

- `FULL TIME` (phase word + FT cap band) · `THE SCARF IS YOURS · …` (FT caption)
- `THE COUNT` (tab + cp-head + drawBackUnder header) · `THE CLOTH` (tab, cp-back `THE CLOTH ⇄`)
- `THE ENDS` · `THE CROWD` · `THE PULSE` · `THE ROAR` (rail module heads)
- Chapter object names: `THE WALL`, `THE KEEPERS`, `INTO THE STANDS`, `THE CLIFF`,
  `THE FRANTIC MINUTE`, `THE BOOK`, `THE FINE PRINT`, `THE PROVENANCE`
- Team tricodes/names throughout (template vars untouched)
- `CHEER` · `NAME IT` · `STAND WITH …` (railInit)

## Audited and left standing (they pass the law)

- **THE COUNT heads kept:** `Money · hearts · reality.` (01 — now does the labelling work
  alone; dek deleted), `The hardest fall came at N′.` (02 — the owner's blessed shape),
  `Minute N boiled.` (08), `The referee wrote names.` (09 — a fact), `Prints at full
  time.` (10-else — a promise stated as fact).
- **Labels kept:** `THE MARKET · ARG AT KO`, `THE CROWD`, `THE RESULT · AET` / `SO FAR`,
  `PRESSURE SHARE` / `OF THE MINUTES`, `ARG GK / CPV GK`, `ARG BLOCKS / CPV BLOCKS`,
  FINE PRINT rows (`FREE KICKS / THROW-INS / GOAL KICKS / INJURY STOPPAGES`), provenance
  (`LIVE WIRE` / `FIXTURE 18175918 · 03 JUL 2026` / `Nº —`).
- **Canvas kept:** `· · ·  THE MATCH NOT YET WOVEN  · · ·` — the one caption the metaphor
  needs; it carries the non-visible fact that the bare warp is the future. `● LIVE`,
  `POSS …`, phase words, `NO GOAL · N′`, goal captions `TRI N′ · ET`, minute ticks.
- **Rail kept:** `THE CROWD SAYS` / `THE MARKET, NOW … IN 100 · H D A` (unit-naming),
  `LOUDNESS PER END`, `READY` / `FELT` / `CLOSED`, `YOUR END` / `THEIR END`.
- **Dev chrome kept (hidden in sitemode):** `■ PAUSE / ⟲ RESTART / ☀ DAY / ☾ NIGHT /
  SPEED / 2× 8× 30× / KICK-OFF / 28′ ARG / 58′ CLIFF / 90′ DEATH / ET GOALS / ▶ PLAY /
  ▶ REPLAY`, sitemode subtitle `NAME v NAME · LIVE`.
- **Head matter kept:** `<title>`, meta/og descriptions, canvas `aria-label` —
  description is their job.

## One flag, not in the map

`drawBack()` (the legacy canvas COUNT, ~lines 648–810) still carries the old copy
(`money · hearts · reality`, `one ball per catch`, `ACTIONS — FULL BOIL`…). It is
near-invisible now — it paints only during the 2 squeezed flip frames and underneath the
opaque DOM `#countPage` — so I did not copy-edit a corpse. Recommend the coordinator
schedule its deletion instead; if it ever becomes visible again, its strings must be
re-audited.
