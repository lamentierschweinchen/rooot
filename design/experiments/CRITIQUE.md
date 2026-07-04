# CRITIQUE — the live page vs. the real things (Jul 4, night)

*Written after steeping in `design/references/` (the owner's collected tickets,
cards, fabric, badges, pennants, atmosphere, trophy rooms), the design law
(SYSTEM.md, POP-LANGUAGE.md), and the live shell at 390px. The stage canvas is
excluded where the materiality lane is already inside it; this is about the
EXPERIENCE — the page, the door, the band, the drum, the ledger, the words.*

## What the real references have that the page doesn't

Hold the España 82 ticket next to rooot.club and the difference is not
"texture" — it's **conviction of anatomy**. The ticket is ~15 modules locked
in a hard grid: every label whispers in tiny caps, every number shouts in big
type, every block has exactly one job, seams are hard, nothing floats, and the
object *names itself* (COPA MUNDIAL · ESPAÑA 82). The Mexico 70 stub renders
seat data as PICTOGRAMS — a gate arch, a seat grid, a clock face — 1970s
show-don't-tell. The pennant is an information object: the whole tournament
recorded in one woven print. **The references are dense, deliberate, and
proud. The page is thin, tentative, and anonymous.**

## The verdicts

1. **The page never says ROOOT.** No wordmark, no masthead, no colophon.
   Every reference names itself on its own face (MEXICO 70, COPA MUNDIAL,
   WorldCupUSA94, FIGURINE PANINI). A fan lands on a nameless cream page.
   The pop-ball — the house mark, §6.10 — appears nowhere in the shell.

2. **Two scoreboards, 100px apart.** The sticky DOM scoreband stacks directly
   on the stage's own canvas scoreboard: score, tricodes, flags, clock — all
   twice. This is the "incoherent card" verdict still alive. The sticky band
   must earn its place: it exists for the fan who scrolled away from the
   stage; when the stage scoreboard is on screen, a second one is noise.

3. **The scoreband clips at 390px.** "2ND HAL", "REPLA" — cut off. Seven
   modules crammed in a 56px flexbox with margins, not a composed band of
   keylined cells. The references would build it like the España strip: hard
   cell seams, label-tiny/number-big, and it would FIT because every cell
   earns its width. (Also: `box-sizing` was never reset, so the stage window
   overflows the viewport by 4px and the whole page scrolls sideways. Broken
   at every width.)

4. **Alpha is doing ink's job.** `rgba(...,0.5)` borders, `opacity: 0.6`
   labels, translucent white roar-fills. Print doesn't have opacity — it has
   ink, ink-free paper, and grey ink. Every translucent element reads
   "screen", which reads "generated". (The one legal ghost: the honest
   local-count italic.)

5. **No weight hierarchy in the DOM** — the PRINT-SOUL disease, but in HTML.
   Everything is `--keyline: 2px` or `--hair: 1px`. The references run fat
   frame / medium panel / fine detail (~8:4:2). The ledger's goal row and a
   minor's fold line carry nearly the same border weight. Nothing is FAT, so
   nothing is confident.

6. **The cheer button is a pill.** `border-radius: 999px` — the single most
   app-generic shape on earth. Nothing in the reference world is a pill. The
   drum should be a DRUM: a fat keylined disc with pop-ball geometry — or a
   hard rectangular plate. And it sits on a floating cream strip with no
   anatomy: no counts band, no cell seams — three items adrift in a flexbox.

7. **The door is a template, not a ticket.** Full-bleed team-color voids,
   centered emoji flag, tiny "ROOT ARG" chip, headline that CLIPS at 390px
   ("ARGENTINA — CAPE VE"). Choosing your end for 90 minutes should feel
   like being handed a MATCH TICKET — fixture, date, № , gate — and picking
   your gate. All the anatomy exists in the reference tickets; none of it is
   here. Also "KICK-OFF 00:00" prints a bug as a fact (epoch time shown
   because the replay fixture has no real kickoff).

8. **Emoji flags.** Glossy, platform-rendered, anti-print. The system says
   identity = flag-BLOCKS (drawn color panels, `POP-LANGUAGE §B.8`) — the
   fixture already carries team colors. Every emoji flag on the page
   (scoreband, strip, door, cheer counts) is a small surrender.

9. **The ledger reads as a settings list, not a wire report.** Right idea —
   minute chip, side tick, swing chip — but: hairline rows all the same
   weight; sentence-case headlines ("Kick-off", "Goal? Checking…") in a
   world where every reference is CAPS; the swing chip (the market's real
   drama — 93→62!) prints at 12px with a 10px arrow, visually junior to the
   minute chip; goal rows get +2px of border and nothing else — a GOAL in
   the references would be a black band with cream knockout type. The
   magnitude system is timid where it should be typographic.

10. **"THE LEDGER · newest first" / "Pose"** — labels talking to the builder,
    not the fan. "Pose" is studio jargon; the fan-true word is **PRINT**
    (flip live chrome → print anatomy; the whole world is a press). "Newest
    first" is a database sort order; a wire report just prints newest on top
    and everyone understands.

11. **The strip's honest state is buried.** "STANDS OPENING SOON — counts are
    local for now" is the RIGHT fact in the WRONG voice — 10px, spaced-out
    caps, third priority. Honesty is a feature; print it like one (a proper
    plate, not an apology).

12. **The page has no bottom.** It just stops after the ledger. A printed
    object ends with a colophon — the pennant signs off MEXICO 70, the
    ticket prints its serial at both ends. The page needs a footer strip:
    wordmark · fixture · date · the honest source line ("market: TxLINE on
    Solana · crowd: live counts"). That line is also the product's thesis,
    stated as fact — show-don't-tell provenance.

13. **Nothing grins.** The references are FUN — the Panini rooster, the
    pop-ball in the "0" of 1970, the Topps diagonal shouting BULLS. The
    shell has zero moments of drawn joy. The pop-ball alone (step-spinning
    on a cheer, squashing on a goal) would carry more grin than everything
    currently on the page. Fun is a law here ("truly special, unique,
    intuitive, and FUN") and the shell is compliance-grade sober.

14. **The desktop broadsheet is a phone stretched.** Two columns of the same
    thin material; the vast cream right of the ledger is dead. Not tonight's
    priority (phone is the instrument), but the morning read should know.

## What's RIGHT (keep, sharpen)

- The information architecture (scoreband → stage → strip → drum → ledger)
  matches how a fan actually watches. Don't reshuffle it; make it deliberate.
- The honesty seams are all correct: counts never dressed as %, swing chips
  from two real ticks, ghosted local counts, discards strike through.
- The ledger builder logic (folds, breath rows, amends) is genuinely good
  reporting. The presentation just doesn't believe in it yet.
- The stage canvas under the materiality lane is already pulling ahead of
  the shell — fat dots, honest chips. The shell must catch UP to its window.

## The plan (tonight, in order)

A. **Fix the broken** — box-sizing reset; scoreband recomposed as keylined
   cells that fit 390 (and hide while the stage's own scoreboard is on
   screen); door title wraps; suppress epoch kickoff times.
B. **Give the page its print anatomy** — masthead voice on the scoreband
   (it names the object), weight tokens (frame/panel/detail), kill alpha-ink,
   drawn flag-blocks replace emoji, page colophon with the provenance line.
C. **Make the drum a drum** — keylined cell bar; the button becomes a fat
   ink disc with a pop-ball; press = squash + step-spin; counts in their own
   cells with the team tick.
D. **Make the ledger a wire report** — CAPS voice; weight-by-magnitude done
   with type + bands (goal = black band, cream knockout); the swing chip
   promoted to the row's loudest data; fold lines as printed rules.
E. **Make the door a ticket** — ticket anatomy (fixture strip, big tricodes,
   drawn flag blocks, gate line, serial), two ends as gate choices, "ROOT
   <END>" as the punch action.
F. **MORNING.md** — what changed, what needs the owner's eye.
