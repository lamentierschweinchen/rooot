# ROOOT — Product Ground Truth

*The as-built truth. If you're an agent: this is what we shipped and why. The
human-facing deck lives on claude.ai; this file is your food.*

**One breath:** ROOOT is a match programme that comes alive on your phone. You root
once, cheer constantly, call rarely. The market's read prints plainly beside the
crowd's roar — real people, really counted, never faked. When the whistle blows you
keep what you lived: a woven scarf and the printed record of the match, yours on
Solana devnet, worthless to flip on purpose. Free, no wager, no token. Lose the
match, win the stands. `rooot.club`.

**Why it matters (stated once, plainly):** two things carry the value here — the
*data* the match generates (what real fans believed, stamped against what the market
believed that second, resolved by what actually happened) and the *engagement* the
mechanism proves (a fan roots, cheers, and calls, and walks away with a real record
of it). The business case is developed elsewhere; this file is the product.

## The world: paper and cloth

Two registers, never blurred (`design/PAPER-AND-CLOTH.md`, the law): **paper**
documents — tickets, margins, scorecards, the album, every number and label — and
**cloth**, the match itself, woven on the loom and mounted on paper like a specimen.
Paper steps (snaps, stamps, flips); cloth breathes (the weave scrolls). Cream
newsprint by day, press-black by night. The tide-on-a-night-pitch aesthetic is
retired — see "Cut on the way."

## The seven surfaces

Static pages a fan reaches directly (`apps/web/public/`), each fed by an adapter:

- **the gate** (`gate.html`) — the turnstile. Pick an end and name the score: two
  claims, editable to kickoff, then locked. `NINETY MINUTES. TWO CLAIMS.`
- **the ground** (`ground.html`) — the hub. Navigation as stadium anatomy; your seat;
  the doors to the match and the cabinet.
- **the woven-loom** (`woven-loom.html`, served at `/live` and `/loom`) — THE MATCH.
  The cloth fills the page, woven live from the feed; the market's number is one
  thread; event marks form at the shuttle. The one live surface.
- **the terrace** (`terrace.html`) — the crowd. Cheer (one tap, rate-decayed per
  fan); the crowd's counted prediction; the pulse react windows (present; the
  curated split-screen reveal is unverified in the shipped surface); NEXT GOAL calls;
  the full-time stands verdict; the Collect button for the scarf.
- **the stadium** (`stadium.html`) — the stats. The market's read and the match's
  proprietary counts as stat-cards, each a self-contained collectible.
- **the cabinet** (`cabinet.html`) — the keepsake case. The album of what you kept;
  empty slots are promises.
- **the showcase** (`showcase.html`, served at `/demo`) — the front door. What ROOOT
  is, in plain words, for a first-time reader or judge.

## The mechanics

| Verb | Frequency | What happens |
|---|---|---|
| **ROOT** | once | at the gate, pick an end — you're in it for the match; the count updates (real numbers, never a %). |
| **CHEER** | constantly | one tap → your end's roar; rate-decayed per fan; feeds the stands count. |
| **CALL** | rarely | surfaced at spikes: name which end scores next (NEXT GOAL), or the score at the gate. The server stamps the live market at the moment of the call; it resolves on the next real goal or at full time — a real devnet receipt. |
| **COLLECT** | at full time | keep what you lived — the scarf mints to your seat (walletless) and the record seals. Status and detail below. |

## The honesty laws (how the systems are shaped)

- **Market ≠ crowd, ever.** The market travels as one message family (a de-vigged
  probability); the crowd as another (real counts). They meet only on screen,
  visibly distinct, and are never converted into each other. Counts are never shown
  as a percentage or a mean.
- **Nothing renders that didn't happen.** Replay runs recorded real matches through
  the exact live parser (`contracts/normalize.ts`) — never a simulation. Empty crowd
  sections ship as n=0, not synthesized.
- **The stands verdict is arithmetic, not a trophy.** At full time the match
  crystallizes exactly one sentiment record; the verdict states what happened.

## The keepsake economy

At the whistle the fan keeps what they lived. **The scarf** renders live (woven in
CSS) and mints on devnet as a Metaplex Core asset to the fan's own passkey seat while
the service pays the fee — walletless, idempotent, and only if the match truly
reached full time. The mint is proven on devnet; the in-app Collect flow is landing
(the on-chain cover image is still a placeholder — the woven scarf is the CSS render).
**The printed record** — scorecard, call stubs, the sealed match page — is the paper
half; at the whistle its hash is anchored in a devnet memo. All of it collects in the
cabinet. No token, no wager: the record is provenance and memory, worthless to flip
on purpose (law 3).

## Cut on the way (consciously, not forgotten)

- **The golden-tide stage.** The original live surface — a floodlit night pitch with
  the market's belief as a luminous tide — retired Jul 5 for paper + cloth. The
  `src/stage` canvas is dead.
- **Rows / the shared XI.** One share-link = a starting XI of 11 seats with free
  talk; the social layer was shed.
- **Press-and-hold R-O-O-O.** The call gesture where the O stretched as you held;
  calls ship as the NEXT GOAL card and the gate score-call instead.
- **Bengalo-smoke ends.** The crowd-as-smoke-and-phone-light visual; the crowd now
  reads as printed counts and blocks.

## Backlog (real, not built — don't describe as shipped)

- **The rosette / pin relic** — the personal keepsake; design generations exist, not
  built.
- **The attendance Merkle root** — "I'm in the crowd photo," a root of attendee
  anonIds per match; shape in `contracts/relic.ts`, not live.
- **Market provenance in relic metadata** — TxLINE's own Merkle refs carried inside
  the minted record; the proof path is exercised (`fixtures/provenance/`), the wiring
  is staged.
- **Season-long stands table** — the World Cup of Fans across matches; the per-match
  verdict ships, the table doesn't.

## Voice

Plain words first; say things as they are (`design/COPY-BRIEF.md`). Labels in caps,
short. Numbers speak alone; the market shows plainly ("favoured", a percent); the
crowd is a count ("6 of 9 called England", never "67%"). No exclamation marks; no
"devnet"/"mint"/"de-vigged"/"1X2" as fan-facing words. Examples: `NINETY MINUTES.
TWO CLAIMS.` · `STAMPED 19:58 · MARKET 61·27·12` · `They won the match. We won the
stands.` · `FULL TIME · THE SCARF IS YOURS`.
