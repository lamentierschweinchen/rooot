# Audit Execution Plan — design lane, owner-gated

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, this session)
> or superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`)
> syntax. **Every task ends with an OWNER CHECK-IN gate — nothing is "done" until the owner has seen
> pixels and said so.** This plan implements `design/FRESH-EYES-AUDIT.md` as triaged by
> `design/AUDIT-TRIAGE-2026-07-10.md` (owner verdicts + the priority override are canon).

**Goal:** Land every audit fix that pushes the usable live product — page by page, card by card,
with an owner taste/accuracy check-in per unit.

**Architecture:** Static surfaces (`apps/web/public/*.html`) consuming coordinator globals
(`__stands`, `__match`, `__stats`, `__fixture`, `__loom`). No build step; edits are direct HTML/CSS/JS.
Verification is runtime-first (AGENTS.md law 7): drive the real surface, screenshot every state,
console clean — the screenshot cycle replaces a unit-test cycle because these are visual surfaces
with no test infra; where logic is testable in isolation (e.g. wrap arithmetic), verify in the
browser console per the task's step.

**Tech stack:** vanilla HTML/CSS/JS surfaces · Playwright capture rig (audit §7 method) ·
recorded feeds + local stands stack as sanctioned dev data.

## Global constraints (apply to every task)

- **Owner priority override (canon, verbatim):** *"At the moment I don't care about the demo even a
  little bit. The only thing I care about is pushing development on what's usable."* → Wave P items
  are PARKED; do not spend time on them until the owner reopens the demo.
- **Owner verdicts (canon):** gate entry requires **side + score, lurk option removed**; score tap
  **cycles 0→9→0**; demo re-bake parked by the override.
- **Honesty laws (AGENTS.md):** market ≠ crowd ≠ team; counts never dressed as market-%; every
  mean/% renders with its cohort `n`; `n:0` renders silence, never zeros-as-data; no synthetic
  events/numbers in honest layers; REPLAY never labeled LIVE.
- **Contrast gate (POP-LANGUAGE §C-7):** team yellows/light inks never raw as type on cream — darken
  via the `mastInk()` pattern (`woven-loom.html:118-121`). Applies to BEL yellow tonight.
- **Lanes:** `woven-loom.html` belongs to the **loom instance** (`HANDOFF-loom-object.md`) — I only
  hand it the cabinet-side seam + the one fixture literal. `contracts/`, adapters, `main.ts`,
  `fixture.json` are **coordinator-only**. `apps/web/public/*.html` (minus loom) is mine.
- **Verification bar per task:** `npm run typecheck` at root passes · surface driven for real ·
  screenshots of every affected state · zero console errors.
- **Commit style (repo history):** `<surface>: <what>` (e.g. `gate: score tap wraps 0–9, lurk row
  removed`). Commit only after the owner approves at check-in. One commit per approved task.
- **Check-in protocol:** see §"The check-in rhythm" at the bottom — it is part of every task.

## Decision gates (owner calls — answer these to unblock the marked tasks)

| # | Call | Blocks | Status |
|---|---|---|---|
| D1 | Score stepper: does the tiny **− button die** with the 0→9→0 wrap? | T3 | **ANSWERED (owner, 10 Jul eve): yes — tap only, − dies.** |
| D2 | Crowd-vs-market panel: Option A (call-board) or B (face-off) | T4 | **ANSWERED: sketch BOTH with real ESP–BEL data, owner picks on pixels.** |
| D3 | Pulse tonight: word-chip tokens now, or hide the picker until emblem art exists? | T6 | **ANSWERED: word-chips now; emblem art follows via the owner's gen loop.** |
| D4 | **Specimen quiz** (killed Pulse v1): delete or fence? | W1-T15 | **ANSWERED: PARK — do not delete. Owner: "if we have time, I will likely want to implement a version of this — probably too ambitious for today." Leave the code; do not spend time on it; a future owner-shaped version supersedes it. The live-path leak (terrace back button → parameterless specimen) closes in T12 instead.** |
| D5 | Gold canon one-liner for POP-LANGUAGE: **"gold = what the market says + what you keep"** (market voice + kept/rare marks); mechanisms (shuttle, possession seam) go ink/chalk | W1-T9, loom instance | Adopt as written |
| D6 | Ground dial hint: LOOM's "THE TIDE" replacement — **"THE CLOTH" / "WOVEN LIVE" / "THE MATCH, WOVEN"** | W1-T12 | THE CLOTH |
| D7 | RESULT family (score + scorers as a ticket-front card at the scoreboard): add once live scorer names verify (C3-live), or park? | W1-T8 | Add — "who scored" is the first fan question |
| D8 | Stands-score v1: is there any tonight-shaped "won the stands" arithmetic you want at FT, or does the verdict band ship without it until the score system lands? | W1-T11 | Ship without; add when the system is real |

## Dependency ledger (not mine — sequenced around)

- **Landed:** `__fixture` manifest + adapter fallback (`fixture.json`, `stands-adapter.js:32-41`) ·
  consensus `n/mean/outcome/modal` (LIVE NOW) · moment schema w/ `palette` tokens (LIVE NOW) ·
  `onCheer` cheer echo (adapter surface exists, server drop "TONIGHT") · `demo-seat.js` (parked).
- **Landing tonight (coordinator):** `predictVerdict` replay-on-reload · cheer-echo server side.
- **After tonight's gate:** C1 `__loom.mode` (loom instance consumes) · C3-live scorer-name verify
  (gates D7/T8) · C7 `(phase, minute)` contract (gates W1-T17) · live `__seat`/`__album` adapter
  (gates W1-T14 ledger half).
- **Loom instance:** everything inside `woven-loom.html` incl. REPLAY label, seal, legend kill,
  cords, C7 axis, keepsake render. My only touchpoints: the ESP–BEL literal (T1, one line, ping
  them) and the cabinet→keepsake link contract (W1-T13, joint).

---

# WAVE 0 — the live front door (do first; real fans at 21:00)

### T1 · Fixture bump — six hardcodes to ESP–BEL

**Files:** Modify `apps/web/public/gate.html:183-187`, `ground.html:118-122`, `terrace.html:302-306`,
`stadium.html:317-329`, `apps/web/index.html` (T2 does its copy) · **loom line handed to the loom
instance** (`woven-loom.html:336-343`, add `'18218149':['ESP','SPAIN','#AA151B','BEL','BELGIUM','#1A1A18']`, `/live` default → `'18218149'`).

**Interfaces:** none consumed (mechanical literals, per coordinator's correction — the proper
`__fixture` migration is W1-T16). Produces: every surface defaulting live traffic into fixture
`18218149`.

- [ ] **Step 1: capture BEFORE** — `gate.html?live=1`, `ground.html?live=1`, `terrace.html?live=1`,
  `stadium.html?live=1` headers (rig: `node cap.js gate.html?live=1 gate-before` — harness appendix).
- [ ] **Step 2: apply the coordinator's per-file recipe verbatim** (all additive + two-literal swaps per file):
  - `gate.html` FIXTURES add: `'18218149':{home:{tri:'ESP',name:'SPAIN',color:'#AA151B',flag:'ESP'},away:{tri:'BEL',name:'BELGIUM',color:'#1A1A18',flag:'BEL'},kick:'TONIGHT 21:00'}`; `:177` LIVE default `'18209181'`→`'18218149'`; `:187` fallback likewise.
  - `ground.html` add `'18218149':{home:{tri:'ESP',name:'ESP',color:'#AA151B'},away:{tri:'BEL',name:'BEL',color:'#1A1A18'}}`; `:117` + `:122` defaults.
  - `terrace.html` add `'18218149':{home:{tri:'ESP',name:'SPAIN',color:'#AA151B'},away:{tri:'BEL',name:'BELGIUM',color:'#1A1A18'}}`; `:301` + `:306` defaults.
  - `stadium.html` add `'18218149':['ESP','SPAIN','#AA151B','BEL','BELGIUM','#1A1A18']` + `SEC.ESP='#F1BF00'`, `SEC.BEL='#FDDA24'`; `:329` both literals.
- [ ] **Step 3: BEL ink check** — everywhere BEL renders as *type* (terrace headers, gate tri, market
  bar segment) confirm `#1A1A18` (near-ink) is legible on its grounds and BEL yellow `#FDDA24` is
  never raw type on cream (contrast gate). If any surface needs it, reuse the gate's picked-side
  treatment instead of yellow type.
- [ ] **Step 4: typecheck + capture AFTER** — same four headers; console clean.
- [ ] **Step 5: OWNER CHECK-IN** — before/after strip; taste call: BEL rendered near-black vs a
  lightened charcoal; flag any surface where ESP red + BEL black read too somber together.
- [ ] **Step 6: commit** — `fixtures: ESP-BEL literals on gate/ground/terrace/stadium (live default 18218149)`.

### T2 · Landing de-stale

**Files:** Modify `apps/web/index.html:69,75,84`.

- [ ] **Step 1:** read the hero block (`index.html:60-90`) for any FRA/MAR colorway to reframe.
- [ ] **Step 2: exact swaps** — `:69` `LIVE NOW<br>FRA v MAR LOOM` → `TONIGHT 21:00<br>ESP v BEL` ·
  `:75` `FRA<span>v</span>MAR` → `ESP<span>v</span>BEL` · `:84` href → `/gate?live=1&match=18218149`.
  Pre-kickoff honesty: the page must not say LIVE before 21:00 (post-mortem: production advertised a
  finished match as LIVE NOW — never again).
- [ ] **Step 3: capture** landing before/after.
- [ ] **Step 4: OWNER CHECK-IN** (fold into T1's — one strip) → **commit** `landing: tonight ESP-BEL, kills stale FRA-MAR LIVE NOW`.

### T3 · The gate, per your verdict — lurk removed · tap cycles · dead-tap feedback

**Files:** Modify `apps/web/public/gate.html` (markup `:142,146,148` · CSS `:67-69,78,106` ·
JS `:174-181,233,255-264,272`).

**Interfaces:** Produces `rooot.pass.side ∈ {'h','a'}` only (no `'n'`) — terrace/ground PASS readers
already treat non-`'a'` as home; no change needed there.

- [ ] **Step 1: capture BEFORE** — gate first-contact, neutral row visible, score at 9.
- [ ] **Step 2: remove the lurk option** — delete the `.neutral` button (`:142`), its CSS block
  (`:67-69`), its handler (`:255-261`), and the `neutral` var refs (`:179-181, :250`). Entry stays
  `side && touched` (`:233`) — now meaning: a team and a score, both, per your verdict.
- [ ] **Step 3: tap cycles** — `:263` becomes
  `n.onclick=function(){ sco[n.dataset.t]=(sco[n.dataset.t]+1)%10; touched=true; paintScore(); ready(); };`
  **[D1]** and remove the `.scm` minus buttons (`:146,148` markup, `:78` CSS, `:264` handler).
- [ ] **Step 4: dead-tap feedback** — `.go` CSS `:106`: drop `pointer-events:none` (keep the 32%
  opacity). Handler `:272` top becomes:
  ```js
  go.onclick=function(){
    if(!go.classList.contains('ready')){
      var need = !side ? ends : score;                 // first incomplete step nudges
      need.classList.remove('nudge'); void need.offsetWidth; need.classList.add('nudge');
      return;
    }
  ```
  CSS: `@keyframes nudge{30%{transform:translateX(-4px)}60%{transform:translateX(4px)}}
  .nudge{animation:nudge .28s ease}` + add `.nudge{animation:none}` inside the existing
  reduced-motion block (`:29` area).
- [ ] **Step 5: verify in browser** — tap score to 9 → next tap shows 0; commit flow end-to-end
  (side → score → TAKE YOUR PLACE → ADMITTED → ground). Console clean. Capture: wrap moment,
  nudge moment, admitted.
- [ ] **Step 6: OWNER CHECK-IN** — the new score gesture on video-ish sequence (three frames:
  8→9→0); confirm D1 (− gone); confirm the nudge reads as "finish this step" not as an error;
  ask: should the hint copy stay "TAP TO SET THE SCORE" (still true) or gain "· WRAPS AT 9"?
- [ ] **Step 7: commit** — `gate: entry = side + score (lurk removed), tap cycles 0-9, dead-tap nudge`.

### T4 · Terrace crowd-vs-market panel — the crown jewel, made legible

**Files:** Modify `apps/web/public/terrace.html` (markup `:206-210` `.crowdcall` · JS `:517-531`
`fmtMean/ccUpdate/marketUpdate` · CSS `:74-82`).

**Interfaces:** Consumes `__stands.onConsensus(msg)` — `msg.all/{byRoot.home,away,neutral}` each
`{ n, mean:{home,away}, outcome:{homeWin,draw,awayWin}, modal:{home,away,pct} }` (LIVE NOW, real
shape in `HANDOFF-2026-07-10-tonight-data-shapes.md §2`) and `__stands.onMarket(triple)`.

- [ ] **Step 1: OWNER CHECK-IN (sketch first — this is the taste-heaviest tonight unit).** Two
  options mocked as static frames with tonight's teams **[D2]**:

  **Option A — the call-board (stacked, verdict-led):**
  ```
  THE CROWD LEANS BEL · 60% OF 5 CALLS
  THE MARKET SAYS ESP · 41%
  most called — your end ESP 2–1 · their end BEL 1–2
  ```
  Line 1 = `all.outcome` argmax (`BEL` / `ESP` / `A DRAW`) + its share + `n` (“OF n CALLS” keeps the
  count honest and human). Line 2 = market leader + % (gold label, unchanged law). Line 3 = per-end
  `modal` scorelines, only for cohorts with `n>0`, set small — **never in score typography**.

  **Option B — the face-off (two columns at the seam):**
  ```
  THE CROWD            THE MARKET
  BEL WIN              ESP 41%
  60% · 5 CALLS        DRAW 27 · BEL 32
  ```
  Crowd column in ink, market column in gold; the seam line between them is the honesty boundary
  made visible.

  Both: decimal means leave the headline entirely (option: keep `avg call 1.0–2.3` as a whisper
  under line 3 — your call at the sketch); `n:0` state renders
  `THE CROWD IS STILL ARRIVING — NO CALLS YET` (one line, no zeros); market-waiting keeps today's
  `waiting` copy.
- [ ] **Step 2: implement the picked option** — replace `.crowdcall` markup + `ccUpdate()` to read
  `outcome/modal/n` (delete `fmtMean` from the headline path), guard `n===0` cohorts to silence.
- [ ] **Step 3: drive it** — local stands stack or recorded consensus sample (the FRA–MAR shape in
  the handoff is a real payload — paste via console `ccUpdate(sample)`); capture: 0-calls state,
  5-calls state, market-waiting state.
- [ ] **Step 4: OWNER CHECK-IN** — the three states as one strip; accuracy check: does "LEANS BEL ·
  60% OF 5 CALLS" read honest at n=5 (small-n never dressed as authority)?
- [ ] **Step 5: commit** — `terrace: crowd-vs-market panel speaks fan (outcome + n), decimals out of the headline`.

### T5 · Terrace keepsake — 3-state verdict off the wire

**Files:** Modify `apps/web/public/terrace.html:447-457` (`showKeepsake`), `:572` (`onVerdict` handler).

**Interfaces:** Consumes `__stands.onVerdict(v)` where `v = { predicted:{home,away},
final:{home,away}, verdict:'exact'|'outcome'|'wrong' }` (replay-on-reload lands tonight — trust it
arrives even on a post-FT join).

- [ ] **Step 1:** `:572` store then show: `window.__stands.onVerdict(function(v){ M.verdictMsg=v; if(!M._ft){M._ft=true; showKeepsake();} });`
- [ ] **Step 2:** in `showKeepsake()` (`:452-455`), prefer the wire over local recompute:
  ```js
  var vm=M.verdictMsg;
  if(vm && vm.verdict){
    var lbl = vm.verdict==='exact' ? '✓ NAILED IT' : vm.verdict==='outcome' ? '≈ RIGHT CALL' : '✗ DIDN’T FALL';
    sc.innerHTML='YOU CALLED <b>'+HOME_TRI+' '+vm.predicted.home+'–'+vm.predicted.away+' '+AWAY_TRI+'</b> · '+lbl;
    sc.style.display='block';
  } else if (PASS && PASS.call) { /* existing exact-only fallback stays for wire-less states */ }
  ```
  Copy mirrors the cabinet's canon set (`cabinet.html:179`) so the two relic surfaces speak one language.
- [ ] **Step 3: verify** — console-inject all three verdicts (`__stands` callback direct call);
  capture the scarf card ×3.
- [ ] **Step 4: OWNER CHECK-IN** — the three scarf states side by side; taste: "DIDN'T FALL" on the
  relic vs a warmer line ("THE GAME HAD OTHER IDEAS" is the current fallback — pick one, both
  surfaces adopt it).
- [ ] **Step 5: commit** — `terrace: keepsake verdict 3-state off predictVerdict (matches cabinet canon)`.

### T6 · Pulse, live and honest — current schema, expiry, dismiss, no fabrication

**Files:** Modify `apps/web/public/terrace.html` (`openMoment :584-592` · `pick :369-376` ·
`reveal/setSR :378-397` · `showPicker :347-368` · picker markup/CSS `:123-139`).

**Interfaces:** Consumes `onMoment(w)` `{momentId, kind:'goal'|'possible'|'var'|'red'|'penalty'|
'near-miss'|'swing'|'full-time', side|null, minute, opensAtMs, closesAtMs, palette:[6 tokens]}`,
`onMomentResult(r)` `{home:{top,pct,hist,n}, away:{top,pct,hist,n}}`; sends
`__stands.momentReact(momentId, token)` (always, not demo-gated).

- [ ] **Step 1 [D3]:** confirm tonight's floor: word-chip tokens (the `.pk` chip style already
  exists) — emblem art follows as a gen-prompt follow-up in your loop, mapped token→glyph.
- [ ] **Step 2: rewrite `openMoment`** — accept every current kind (drop `kind!=='verdict'`):
  title map `{goal:'GOAL', possible:'CHECKING…', var:'VAR CHECK', red:'RED CARD', penalty:'PENALTY',
  'near-miss':'SO CLOSE', swing:'IT’S TURNING', 'full-time':'FULL TIME'}` + **a context line**:
  `w.side ? (TRI[w.side]+' — HOW DOES IT FEEL?') : 'HOW DOES IT FEEL?'` under the minute. Tray =
  `w.palette` tokens as chips. Store `w.closesAtMs`; `setTimeout` to close tray + label at
  `min(closesAtMs - Date.now(), 90_000)` with a 45s fallback if the delta is absurd. Add a `✕`
  dismiss chip to the tray (lurking stays complete).
- [ ] **Step 3: send always** — `pick()` `:373` drops the `DEMO&&` guard: any `__stands.momentReact`.
- [ ] **Step 4: reveal from the wire only** — subscribe `onMomentResult` in `wireLive`; `setSR` per
  end from `{top,pct,n}`: bar label = token word, width = `pct*100`, count = `n` real (e.g. `n=3`);
  an end with `n:0` renders `— · their end sat quiet` (no bar). **Delete the hardcoded
  `6,730/9,900` verdict-branch of `reveal()`** — nothing fabricated survives on the live path.
- [ ] **Step 5: verify** — console-inject a `moment` (goal palette) → pick → inject `momentResult`
  → reveal; inject a second moment and let it expire unanswered; capture: tray, reveal, silent-end
  reveal, expiry.
- [ ] **Step 6: OWNER CHECK-IN** — the moment sequence as frames; taste calls: title words
  (esp. `IT'S TURNING` for swing), context-line copy, chip casing (EUPHORIA vs euphoria).
- [ ] **Step 7: commit** — `terrace: pulse on the live moment schema (all kinds, expiry, dismiss, real reveal counts)`.

### T7 · One cheer, visible — the echo

**Files:** Modify `apps/web/public/terrace.html` (`wireLive :556-573`), `apps/web/public/ground.html`
(`wireLive :187-204`).

**Interfaces:** Consumes `__stands.onCheer(fn)` → `{side:'home'|'away', atMs}` — 1:1 with accepted
cheers, capped 15/s; **never derive volume from echo frequency** (roar carries volume).

- [ ] **Step 1: terrace** — in `wireLive`, after `onState`:
  ```js
  if(window.__stands.onCheer) window.__stands.onCheer(function(e){
    ripple(e.side===sideKey ? tilesYou : tilesThem, 1);   // ONE seat flickers — someone, right now
  });
  ```
- [ ] **Step 2: ground** — mirror: their side → flash **one** mosaic cell (add `flashOne()`: the
  existing `flashThem()` body reduced to a single `mt.children[i]`), your side → a single-tile tick
  on the cheer bar edge. Guard `if(window.__stands.onCheer)`.
- [ ] **Step 3: verify** — local stack, two browsers (canary pattern): cheer in A, watch one tile
  flicker in B within a tick; capture both ends.
- [ ] **Step 4: OWNER CHECK-IN** — does one flicker read as "a person", not "lag"? (fold into T6's
  check-in if same sitting) → **commit** `terrace+ground: discrete cheer echo — one seat per accepted cheer`.

---

# WAVE 1 — the product queue (page by page, card by card)

*Order below is my proposal — reorder at any check-in. Taste-heavy units get a sketch gate BEFORE
build; mechanical units batch 2–3 per check-in. Stadium first (most audit weight), then terrace
residue, ground, cabinet, cross-cutting.*

### T8 · Stadium overview — the no-legend rethink *(sketch gate → build → check-in ×2)*

**Files:** Modify `apps/web/public/stadium.html:42-57,194-207` (hotspots/tip CSS+markup),
`:340-388` (bowl paint), `:504-521` (render counts), `:596-606` (tap wiring).
**Gates:** none hard; D7 decides if the scoreboard becomes RESULT's door now or later.

- [ ] **Step 1: two directions as static mockups** (screenshot-quality, real ESP–BEL data), presented together:
  - **Direction 1 — THE QUIET MAP:** zero chrome. Rings, glyphs, `1X2` chip, counts, `TAP A GLOWING
    PLACE` bar: all deleted. Each place renders *its own miniature data*: goal mouths grow a tiny
    row of real shot dots (team-colored, the card's own marks at 1/6 scale); the corner arc stacks
    a tiny flag per set piece along the arc; the centre spot prints `55 · 45` in 9px caps with a
    `POSS` label (a number needs its name); the touchline book is a stack of real card chips
    (yellow/red) exactly where the whistle sat; the bench shows `▲▼` pairs only once a sub exists;
    the scoreboard stays the scoreboard. Affordance = one soft sequential pulse per place on first
    load only (900ms total, reduced-motion silent), then places pulse **once** when their data
    changes. Tap targets = generous invisible hit-areas over each place.
  - **Direction 2 — THE FAMILY MARKS:** as Direction 1, but each place keeps ONE small printed
    glyph — strictly the family's own loom-alphabet mark (corner flag at the arc, glove at each
    mouth, whistle at the touchline, sub arrows at the bench) set flat into the illustration
    (no rings, no halos, no counts). The pitch stays clean.
  - Both directions include: **pitch split = territory** (`__stats.territory`, honest fallback:
    possession only when territory absent AND labeled as such), split seam in **chalk cream**
    `#EFE7D2` (not gold — D5), `TERRITORY` in 8px caps riding the seam; bowl seating stays
    crowd-only (rooting split unchanged, ends already match the terrace's vertical order).
- [ ] **Step 2: OWNER CHECK-IN (direction pick + redlines).**
- [ ] **Step 3: build the picked direction** — delete `.hot .ring/.ic/.n` chrome + `#tip` +
  `halo` animation; add per-place mini-renders fed from the same `render(s)` data (shots →
  `hGA/hGH` replaced by dot-rows; set pieces → arc flags from `h.corners+a.corners+FKs`; book →
  chips from `cards`); rewire tap targets (`data-place` hit-areas). Possession numbers `pA/pH`
  move to the centre-spot label.
- [ ] **Step 4: verify** — drive with recorded stats through `stats-adapter` (sample injection via
  `window.__render(FIXTURE_STATE)` dev hook `:567`); capture early/mid/late; console clean;
  every family still opens.
- [ ] **Step 5: OWNER CHECK-IN (pixels)** — the no-legend question asked of every place: *"do you
  know what this opens without being told?"* → **commit** `stadium: overview speaks by position —
  chrome, counts, instruction bar removed; territory split labeled, chalk seam`.

### T9 · CONTROL card rework *(the named card — sketch gate → build)*

**Files:** Modify `apps/web/public/stadium.html:226-244` (sheet markup), `:481-502` (`ctrlViz`),
`:554-565` (render).

- [ ] **Step 1: sketch** — one concrete proposal (variants only where noted):
  hero = **territory pitch**: two flat ink-solid team fields meeting at the live territory split
  (halftone edge per POP §F), `TERRITORY` printed at the seam, nothing else on the pitch;
  **possession** = one printed pair under it — `46% ESP · BEL 54%` — big, labeled `POSSESSION`,
  **no twin bars** (one stat, one number-pair); **danger** = the existing tile-bloom idea kept but
  full-ink (opacity .9 all tiles, high-danger gets the keyline), tiles bloom from each goal mouth
  *inside the hero pitch* with the count stamped at each mouth (`24` / `23`) — mark = number, no
  caption; bottom = a full-width register band (Topps strip) with the family's totals to kill the
  void. Caption "DANGEROUS ATTACKS · ON EACH GOAL" deleted — the form carries it.
- [ ] **Step 2: OWNER CHECK-IN (sketch)** → adjust → build (`ctrlViz` becomes the combined
  territory+danger hero; possession/territory twin bars deleted; `sh-read` grows into the register band).
- [ ] **Step 3: verify** — three data states (early sparse / mid / heavy danger asymmetry) via
  `__render`; capture ×3 → **OWNER CHECK-IN (pixels)** → **commit** `stadium(control): territory is
  the space, possession is the number, danger blooms full-ink at the mouths`.

### T10 · THE BOOK + TEAM SHEET *(mechanical pair — one check-in)*

**Files:** Modify `apps/web/public/stadium.html:265-268` (book read), `:539-540` (VAR strip),
`:436-446` (fillBook), `:449-453` (fillXI).

- [ ] **Step 1 (BOOK):** `bkHc` "0·0" digits → card-chip register: `<span class="chip y"></span>×n`
  yellow chips + red chips with counts (`2 ▮ · 0 ▮` form: chip glyph + count each, reusing `.bentry
  .chip` styles at register scale). `"n OFF"` → `OFFSIDES n`. VAR strip type-string map:
  `{CornerKick:'CORNER', Goal:'GOAL', Penalty:'PENALTY', RedCard:'RED CARD', Handball:'HANDBALL'}`
  + `String(x.type).replace(/([a-z])([A-Z])/g,'$1 $2').toUpperCase()` fallback so no camelCase ever prints.
- [ ] **Step 2 (TEAM SHEET):** `fillXI` sorts by shirt number —
  `arr.slice().sort(function(p,q){return (+p.number||99)-(+q.number||99);})` — keeper leads; null-name
  sub row copy: `▲ — ▼ —` → `A CHANGE AT 45′ · NAMES TO FOLLOW` (graceful degrade, still honest).
- [ ] **Step 3: verify** with sample stats (cards list + subs with and without names); capture both
  cards → **OWNER CHECK-IN** → **commit** `stadium(book+sheet): card chips not scorelines, OFFSIDES
  spelled, XI by shirt number, wire-strings translated`.

### T11 · MARKET + SET PIECES + GOAL-MOUTH polish *(mechanical trio — one check-in)*

**Files:** Modify `apps/web/public/stadium.html:626-637` (drawOdds), `:250-256` (arc sheet),
`:409-418` (shot slots).

- [ ] **Step 1 (MARKET):** draw line gets its own ink — solid `#7a7256` (drop its dashes); the 50%
  reference keeps dashes + gains a right-edge `50` tick label (8px sub); x-axis minute ticks at
  0/45/90 under the frame. *(C7 note: when `(phase,minute)` lands, ticks become phase-qualified —
  W1-T17.)*
- [ ] **Step 2 (SET PIECES):** corner tallies move onto the arc — flags planted along the arc path
  (rotate the existing `cmark` along the arc's angle range), home flags from the near end, away
  from the far; kill the floating sky rows; label `SET PIECES WON` → `THE DEAD BALL` (throw-ins
  aren't "won"); ghost-dot artifacts in `arc.png` — flag to your gen loop if they bother at the check-in.
- [ ] **Step 3 (GOAL-MOUTH):** miss-ring zone anchors just above the bar (`ZONE.miss.t/b` →
  `{t:26,b:33}` hugging the frame); glove mark gains a 2px team-color cuff line (`.emb.glove.h/a
  { border-bottom:2.5px solid var(--home/--away) }` on the img wrapper).
- [ ] **Step 4: verify** all three cards with mid-match sample; capture → **OWNER CHECK-IN** →
  **commit** `stadium(market+arc+goal): draw line inked, tallies on the arc, misses over the bar`.

### T12 · Ground — full-time beat, nav that speaks, embed dignity

**Files:** Modify `apps/web/public/ground.html:80-108` (masthead/dial/markup), `:166-176` (demo
branch untouched — parked), `:187-215` (wireLive), `terrace.html:65` embed rule.
**Gates:** D6 (TIDE word) · D8 (stands-score line).

- [ ] **Step 1 (FT state):** on `__stats.minute>=FT` / score-phase FULL_TIME (statsAdapter carries
  minute; phase via `__match.done` when present): masthead swaps to `FULL TIME · ESP 2–1 BEL`
  (no live minute), dial stays, and a **verdict band** slides under the masthead:
  `<div class="ftband">FULL TIME · <b>ESP 2–1 BEL</b> · YOUR SCARF IS PRESSED <a href="cabinet.html?live=1">OPEN YOUR CABINET →</a></div>`
  — cream on ink, one line, the ◈ pulses once. (D8 decides whether a stands line joins it later.)
- [ ] **Step 2 (nav):** `.cabbtn` ◈ gains the word — `◈ CABINET` (9px caps under/beside the mark;
  keep the aria-label); dial hint `THE TIDE` → **[D6 word]**.
- [ ] **Step 3 (embed dignity + the specimen leak):** embedded terrace sheds its own match bar —
  `terrace.html` `body.embed .matchbar{display:none}` beside the existing `:173` rule (the ground
  masthead owns the score); **terrace back button carries mode** — `:179` `href="ground.html"`
  gains the live/demo query exactly as `cabinet.html:269` does (one line; closes the live-path
  drop into the parameterless specimen world, per D4's park); stadium-lens stands-hotspot: in
  embed mode post a message instead of navigating —
  `stadium.html:584` → `if(q.get('embed')){parent.postMessage({rooot:'dial',lens:'stands'},'*');return;}`
  + ground listens: `window.addEventListener('message',e=>{if(e.data&&e.data.rooot==='dial')setLens(e.data.lens);})`.
- [ ] **Step 4: verify** — drive a recorded match to FT on the ground; dial through all lenses at
  FT; capture: FT band, dial states, embedded terrace without double score → **OWNER CHECK-IN**
  (taste: FT band copy; ◈ word treatment) → **commit** `ground: full-time verdict band + cabinet
  pull; dial hint and ◈ speak; embed sheds double chrome`.

### T13 · Cabinet ↔ keepsake seam *(joint with the loom instance — contract, then my half)*

**Files:** Modify `apps/web/public/cabinet.html:214-224` (scarfHTML carries matchId), `:254` (link).
**Coordinate:** loom instance owns the KEPT render (their §4); agree the link contract first.

- [ ] **Step 1: propose the contract in their handoff margin** — cabinet opens
  `woven-loom.html?keepsake=1&match=<matchId>` (+`&live=1` when live); scarf data gains
  `matchId`; the loom side resolves its keepsake payload from the match id (their lane).
- [ ] **Step 2 (my half):** `SAMPLE.scarves[*]` gain `matchId` (`'18175918'`, `'18202783'`,
  `'18187298'`); `scarfHTML` stamps `data-matchid`; `:254` →
  `location.href='woven-loom.html?keepsake=1&match='+k.dataset.matchid+(DEMO?'&demo=1':LIVE?'&live=1':'')`.
- [ ] **Step 3: verify with the loom instance** (joint capture: tap each scarf → correct match,
  KEPT masthead — their render) → **joint OWNER CHECK-IN** → **commit** `cabinet: scarves carry
  their match — keepsake link opens the right cloth`.

### T14 · Cabinet — ledger, voice, first-run polish

**Files:** Modify `apps/web/public/cabinet.html:44-46,131,167-175,262-266`.
**Gates:** live `__seat/__album` adapter (coordinator, post-gate) for the ledger half.

- [ ] **Step 1 (now):** pins copy — `LOCKED · 1+` → per-virtue unlock lines
  (`FIRST ROOT UNLOCKS` · `FIRST NAILED CALL UNLOCKS` · `FIRST UPSET CALLED UNLOCKS` ·
  `500 CHEERS UNLOCKS` · `FIRST READ UNLOCKS` · `5 MATCHES UNLOCKS` · `A RARE NIGHT UNLOCKS`);
  first-run header: when the seat is empty, `‹ THE GROUND` → `‹ THE GATE` (`href=gate.html+Q`) so
  the header agrees with the CTA; flag-treatment: emoji row → sticker tiles via existing
  `flagTile()` (it already does this — verify no emoji path remains).
- [ ] **Step 2 (when __album lands):** stands/verdict ledger row per scarf is already 3-state ✓ —
  add the record tile `NAILED` derivation note; NEED pockets named from the fixture schedule **if**
  the manifest grows a next-fixtures list (dependency — ask coordinator, don't build a source).
- [ ] **Step 3: capture** full + empty states → **OWNER CHECK-IN** → **commit** `cabinet: unlock
  lines speak, first-run header agrees with the door, sticker flags throughout`.

### T15 · Terrace residue — quiz verdict, XP tokens, keepsake KEEP, polish

**Files:** Modify `apps/web/public/terrace.html:100-121,182-192,269-294,399-444` (quiz world) ·
`:222` (XP row) · `:446-458` (keepsake) · `:36-44,321-323` (tiles).
**Gates:** D4 (quiz) · D8 (stands language).

- [ ] **Step 1 [D4 — ANSWERED: PARK]:** the quiz world stays in the file, untouched and unreached
  (T12 closes the only live path into it). No deletion, no fencing work, no time spent. When the
  owner reopens it, a fresh owner-shaped brief supersedes the scripted version (their words: a
  future "version of this" is wanted — the concept isn't dead, this implementation is dormant).
- [ ] **Step 2:** XP row `:222` — `XP 0 · 0–0` dies; `you + 8,203` gains its label:
  `YOU + 8,203 IN THIS END` (word treatment per D8's outcome when the stands score lands).
- [ ] **Step 3 (keepsake KEEP):** `skKeep` writes before dismissing:
  ```js
  try{ localStorage.setItem('rooot.kept.'+(window.__stands?__stands.matchId:MATCH_ID),
    JSON.stringify({matchId:MATCH_ID,home:HOME_TRI,away:AWAY_TRI,final:{h:M.score[0],a:M.score[1]},
      verdict:(M.verdictMsg&&M.verdictMsg.verdict)||null, ts:Date.now()})); }catch(e){}
  location.href='cabinet.html'+(LIVE?'?live=1':'');   // the keep LANDS somewhere
  ```
  (cabinet reads it when the live `__album` reconciliation arrives — coordinator's YOUR-SEAT work;
  until then the key is the honest local record.)
- [ ] **Step 4 (polish batch):** keepsake tifo mirrors the real end (sample the live tile opacities
  into the 156-cell grid + your seat cell); tap-hint retires after first cheer (gate pattern);
  tile density maps to rooted counts (`litPct = clamp(count/CAPACITY)` — pick CAPACITY with the
  owner at check-in); dead black band: collapse to 24px seam shadow.
- [ ] **Step 5: capture** all states → **OWNER CHECK-IN** → **commit** `terrace: quiz resolved per
  owner call, XP tokens out, KEEP writes and lands, tifo tells the truth`.

### T16 · `__fixture` migration — the literals die

**Files:** Modify `gate.html`, `ground.html`, `terrace.html`, `stadium.html` (their FIXTURES tables
consult `__fixture.current` first, literal tables become the fallback only).

- [ ] **Step 1:** each surface: `window.__fixture && __fixture.on(fx => paintFixture(fromManifest(fx)))`
  with `fromManifest` mapping `{home:{code,name,colors[0]}}` → the surface's shape; `?match=` still
  wins; fetch-fail = today's behavior (never invent).
- [ ] **Step 2: verify** — serve with a doctored `fixture.json` (fake fixture) and confirm all four
  surfaces re-theme with **zero** surface edits; capture.
- [ ] **Step 3: OWNER CHECK-IN** (mechanical — fold into nearest sitting) → **commit** `surfaces:
  fixture manifest is the one truth — hardcodes demoted to fallback`.

### T17 · Cross-cutting close-out — voice table, gold canon, added-time labels

**Files:** Modify `gate.html:161`, `stadium.html:219` + the T10 map · `design/POP-LANGUAGE.md`
(one line, owner-approved) · timeline labels where C7's `(phase,minute)` lands.
**Gates:** D5 (gold) · C7 contract (coordinator).

- [ ] **Step 1: the voice table, one check-in** (proposals; the owner reds/greens each row):
  | Today | Proposal |
  |---|---|
  | `PRE-MATCH · DE-VIGGED` | `PRE-MATCH · FAIR ODDS` (vig stripped = fair) |
  | `X 34` (gate bar) | `DRAW 34` |
  | `THE 1X2 · DE-VIGGED` (market card) | `WIN · DRAW · WIN — FAIR ODDS` |
  | `XP` | dies (T15) / stands-score name when real |
  | `1 OFF` | `OFFSIDES 1` (T10) |
  | `CornerKick · OVERTURNED` | mapped (T10) |
  | `LOCKED · 500+` | `500 CHEERS UNLOCKS` (T14) |
- [ ] **Step 2 [D5]:** write the gold line into `POP-LANGUAGE.md` §A-2 Medal Gold row: *"gold =
  what the market says + what you keep; never a mechanism"* — after owner sign-off; stadium's
  possession/territory seam already chalk (T8); loom shuttle is the loom instance's line.
- [ ] **Step 3 (C7, when the contract ships):** market-card ticks + any minute label adopt the
  `display` football notation (`45+2′`) from the enriched feed; verify a double-45 sample renders
  without double-booking → capture → **OWNER CHECK-IN** → **commit** `voice+canon: fair odds, draw
  is draw, gold means market+kept, football minutes`.

---

# WAVE P — PARKED (recorded, untouched until you reopen the demo)

Demo re-bake around a match with goals (C5, ARG–CPV data ready) · shared demo clock (C4) ·
crowd-sim honesty: real reveal tallies + moving rooted counter (C2) · demo masthead REPLAY half of
C1 (loom instance covers the loom's) · demo side-carry (`ground.html:169-176`) · showcase rewrite
(dead golden-tide language, embed/mode-carry links, ◈ caption) · demo cabinet personalization
(`demo-seat.js` is shipped — wiring is one script tag when reopened) · demo goal-moment capture for
judges. **Nothing here is lost; nothing here is worked.**

---

## The check-in rhythm (how we work this plan)

1. **Unit = one task above.** Taste-heavy tasks (T3, T4, T6, T8, T9, T12) get a **sketch gate**
   before build — options as pixels, never prose-only. Mechanical tasks batch 2–3 to a sitting.
2. **Every check-in shows:** before/after screenshots of every affected state (early/mid/FT where
   relevant), the specific taste questions (listed in the task), honesty notes (what the data
   really says), files touched. You approve, redline, or reorder the queue.
3. **Nothing commits un-seen.** Approved → one commit, task's message, tree clean. Redlined → fix →
   re-shot → then commit.
4. **Decision gates (D1–D8)** can be answered in any sitting; each unlocks its tasks. I'll re-ask
   only the ones blocking the next unit.
5. **Verification harness:** the audit's Playwright rig pattern — one capture script per sitting
   (`node cap.js <url> <name>` → `design/checkins/<date>/<name>.png`), phone viewport 390×844,
   console captured. Live-path work drives the local stands stack / recorded feeds (sanctioned as
   dev tooling), never a synthetic invention.

## COORDINATOR REVIEW (2026-07-10 ~19:00) — APPROVED with three revisions

**Verdict: approved.** Wave structure, override compliance, lane walls, and every consumed data shape
check out against the real adapters (I verified `__stands.momentReact(momentId, token)` exists exactly
as T6 calls it, sends un-gated; consensus/moment/verdict shapes are as quoted). Revisions:

**R1 — Wave-0 order vs the 20:30 freeze (recommend, you re-order at check-in).** Full Wave 0 with
check-ins does not fit before the freeze. Ranked against tonight's Release Gate specifically:
**T1 → T2 → T7 → T5 → FREEZE 20:30 → (during match / after) T4 sketch, T3, T6.**
Rationale: T7 (echo) and T5 (verdict render) are literal gate lines ("observe each other's first
cheer", "receive the correct side-aware verdict"); T3's lockout is ALREADY today's live behavior —
the owner's verdict blessed the status quo, so only the wrap/nudge polish is new, and T4/T6 are
significant but their current states function. T4's sketch gate is deploy-free — it can run during
the match. After each Wave-0 commit, ping the coordinator: I run the Vercel deploy + write-proof
smoke; nothing deploys after 20:30 without live-severity.

**R2 — BLOCKING, needs owner routing: the woven-loom `/live` line cannot wait for the loom instance's
convenience.** At `rooot.club/live` the Vercel rewrite HIDES its `?match=` from client JS
(`location.search` is empty — this is why the `pathname==='/live'` special-case exists; premiere-day
finding). My adapters recover via the manifest, but `woven-loom.html:343`'s own `/live` default stays
`'18209181'` → tonight the flagship route themes as FRA–MAR over live ESP–BEL data. The FX entry +
default bump (exactly as T1 hands them) must land PRE-FREEZE by whichever instance owns the loom
right now — owner call on who.

**R3 — interface corrections (small, exact):**
- **T12/T5 full-time signal:** use `__match.clock.phase === 'FULL_TIME'` — NOT `__match.done`
  (`done` also flips at `PENALTIES`, and tonight is a knockout: a shootout is a held breath, not
  full time) and NOT `minute >= 90` (extra time exists; the added-time C7 finding makes raw minutes
  treacherous). Keepsake/FT-band fire on FULL_TIME only; PENALTIES gets no band (the loom instance's
  shootout board is that moment's surface).
- **T17 voice nit (owner decides at the table):** "FAIR ODDS" names a price; what the bar shows is a
  chance in %. Consider `FAIR CHANCE` / `THE FAIR READ`. Same honesty, fewer bookmaker echoes.

## Self-review (against audit + triage)

- Every LIVE-TONIGHT triage item has a Wave-0 task (panel→T4, keepsake→T5, gate→T3, landing→T2,
  fixture correction→T1, pulse/echo/n asks→T4/T6/T7). ✓
- Every owner verdict is encoded (lurk removed + wrap in T3; re-bake parked in Wave P; quiz pending
  as D4). ✓
- Every audit §1 item is either a task (1→T8, 2→T9, 5→parked demo half + live works, 6→T12+T15,
  8→loom instance, 9→T12/T15+D8, 10→D7/T8), a parked item (3-samples, 4-quiz→D4, 7-re-bake), or
  another lane's (loom). ✓
- Coordinator-lane items appear only as dependencies, loom items only as seams. ✓
- No placeholder steps: every code step shows code; every option is written out. ✓

---

## EXECUTION LOG (design-executor margin — owner verdicts are canon, logged once)

**2026-07-10 · CHECK-IN #1 (T1+T2) — owner verdicts:**
1. BEL flat black "looks weird" → **secondary colors for both teams in the stands** (not a lightened
   primary). Landed: `sec` on fixture 18218149 (ESP `#F1BF00` · BEL `#FDDA24`), ~1-in-5 kit-tile
   scatter in both terrace ends + ground far-stand cells; hue only, density/brightness stay data.
2. Somber question → resolved by (1).
3. n:0 guard pulled forward (owner: right instinct, copy was "horribly verbose") — **voice law
   logged: the noun is "predictions", not "calls"** (panel label now FAN PREDICTIONS); n:0 line is
   exactly **THE CROWD IS ARRIVING**; per-end lines silent at n:0. T4's sketch still owns the panel.
4. Gate pre-data bar → KISS: **GAME STARTS AT <kick time>** (from FX.kick), not wire-speak.
5. Loom `/live` line: **owner is working the loom himself; lands when done** — re-raise before the
   20:30 freeze if not in. My hand-off note sits in HANDOFF-loom-object.md margin.
- T1 recipe deviation (logged at check-in): gate flag key `SPA` (asset truth), not `ESP`.
- For the coordinator (receipt in data-shapes margin): `odds` carries no matchId — room-blind at the
  adapter; observed cross-room print at 15:19.

**2026-07-10 · CHECK-IN #3 (owner, ~16:45) — verdicts + NEW DIRECTIVE:**
1. **Copy law (canon):** plain words first, copy pass later; "fan predictions" not "calls".
   Verdict labels → ✓ EXACT SCORE / ≈ RIGHT RESULT / ✗ WRONG (terrace committed `2c92aa6`;
   cabinet's 3 strings handed via loom margin — file mid-flight).
2. **NEW: THE STANDS CARD supersedes the terrace scarf-card as the stands' keep.** Owner
   direction: the thing you keep from the stands = the literal colored card fans hold up to form
   the collective pattern (tifo card), carrying the fan's stats — mostly personal, partly
   collective. Data-first, then design. Loom keeps the scarf (the match); stands keeps the card
   (your night). Sketch gate opened: v1 front-led (the held card) vs v2 data-led (printed back) —
   in design/checkins/2026-07-10/strip-card-sketches.png. T15's KEEP-writes and the cabinet rail
   will carry this object once gated.
3. T3 pulled forward pre-freeze (built, driven, frames captured — commit pending owner's pixels).
