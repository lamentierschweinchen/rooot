# RUNBOOK — NOR–ENG / ARG–SUI double-header live match operations (2026-07-11)

*You are the match-night operations instance for ROOOT. Tonight is a double-header: **Norway v
England, TxLINE fixture `18213979`, kickoff 21:00 UTC / 23:00 CEST**, then — roughly two hours after
game 1's likely full time — **Argentina v Switzerland, TxLINE fixture `18222446`, kickoff 01:00 UTC /
03:00 CEST**. Both live at rooot.club. The 03:00 kickoff is past midnight; the CEST calendar date
rolls to July 12 partway through the night — keep using CEST clock time in your notes so nothing reads
ambiguous. This runbook is self-contained: every command is copy-paste from the repo root
(`/Users/ls/Documents/rooot`). Read it fully, then run the self-verify block.

This is v2. `docs/RUNBOOK-esp-bel-live-2026-07-10.md` (v1) ran ESP–BEL last night;
`docs/NOTES-esp-bel-2026-07-10.md` recorded what actually happened, including every process failure.
Every fix from that file is folded in below — mostly in §5 (rehearsal), §6 (monitor discipline), §8/§12
(the FT summary block), §9 (the game-2 cutover), and §11 (wake thresholds). Where v1 was already right,
it's carried forward unchanged.

## 1 · Your lane (hard walls)

You OBSERVE, VERIFY, TRIAGE, ESCALATE, and CAPTURE. You do NOT:
- edit any code or surface (not even a one-line hotfix — escalate with the exact finding instead;
  cross-lane editing under pressure is the failure mode this rule exists to prevent),
- deploy (`vercel`, `flyctl deploy` are the coordinator's), touch `fly secrets` (owner-only),
- inject anything synthetic into production crowd state. You may participate as a REAL fan on your
  own phone/browser (root, predict, cheer — honestly, once per game), but never scripted/repeated
  writes. The canary's smoke mode is the ONLY automation you point at production — it is write-proof
  by construction and reviewed.

**One pre-authorized exception, and only this one:** §9's game-2 cutover — coordinator-primary,
ops-fallback, pre-authorized in writing at §5.4. Nothing else in this document authorizes you to edit,
commit, or deploy anything, tonight or any other night.

**Serial protection (carried forward, unchanged):** every WS probe in this doc — feed checks, score
probes, the monitor, the FT probe — connects via `?matchId=` only and never sends a `hello` with a
`side`. No probe or automation mints a fan serial (THE FAN SERIAL mints only on a side-carrying hello).
The only serials that should mint tonight are real ones: yours and the owner's from the rehearsal, plus
any real public fans.

**Escalation tree** (report in the owner's chat, naming the lane): backend/data/adapters/feed/deploy →
**coordinator instance** · surface pixels/copy (`apps/web/public/*.html`, landing) → **Design
instance** · `woven-loom.html` anything → **loom instance** · secrets/product calls/lane disputes →
**owner**. Escalate with: what you saw, the exact command/URL, timestamp, screenshot.

## 2 · The two-game night at a glance (CEST)

| When | What |
|---|---|
| 21:30 | §4 warm checks green — fixture `18213979` |
| 22:00 | §5 two-phone rehearsal — BOTH sides ticked, five-axis scores in writing, ssh + cutover-fallback pre-authorized |
| 22:30 | §6 FREEZE game 1 — pre-match battery, arm scores-watch + monitor with discipline rules live |
| 23:00 | KO1 — §7 match watch |
| ~01:00 | FT1 — §8 full time protocol, MANDATORY FT summary block |
| 01:30 | §9 game-2 cutover — the ONLY planned post-freeze action |
| 02:15 | §10 warm checks green — fixture `18222446` |
| 03:00 | KO2 — §11 match watch, **unattended-tolerant mode**, narrow wake thresholds |
| ~05:00 | FT2 — §12 full time protocol at reduced depth; capture + FT summary still mandatory |

## 3 · State at handoff — self-verify, don't trust this doc

Expected when you start (verify each; escalate any mismatch to the coordinator):

```
cd /Users/ls/Documents/rooot
git fetch origin && git status --short && git log --oneline -5   # clean-ish tree; origin/main == main
curl -s https://rooot-stands.fly.dev/health                       # {"uptime":...} — service up
cat apps/web/public/fixture.json                                  # should already read NOR/ENG/18213979
```

- **Game 1's cutover already happened this afternoon** (commit `773a6c0`). `fixture.json` and
  `vercel.json` already point at NOR–ENG `18213979`; `services/stands/src/sentiment/teams.ts` and
  `scripts/cutover-fixture.mjs`'s `KICKOFFS` table already carry BOTH fixtures. The 01:30 game-2
  cutover (§9) needs no code changes tonight — only the script run.
- **Both fixtures are already live on the shared backend.** Verified today ~17:25 CEST: two plain
  public WS probes (`?matchId=18213979` and `?matchId=18222446`, no hello sent) each returned real
  de-vigged odds ticks within 10s. `TXLINE_FIXTURES` on the Fly service already covers both games at
  once — `services/stands` ingests ONE shared TxLINE subscription and fans each message out by the
  fixture id it actually carries (`services/stands/src/index.ts`'s `fixtureIdOfFeedMsg`). This means
  the 01:30 cutover really is just the two-file client-facing swap it looks like — the backend does
  not need touching or restarting for it. Re-verify this yourself at 21:30 anyway (§4.1 against both
  fixture ids, ~20s total) — do not inherit this as gospel eight hours later.
- **Design lane has uncommitted work in flight** (`apps/web/public/cabinet.html`,
  `apps/web/public/terrace.html` modified, not committed as of this writing) — expected, not blocking,
  not yours to touch. Confirm at 21:30 whether it landed on `origin/main`; if not, that's normal
  Design-lane pre-freeze activity, not an escalation.
- **Known open item carried from last night, unresolved as of this writing:** Pulse/moments — the
  server has never been observed broadcasting a single `moment`/`momentResult` message despite the
  stands (`terrace.html`) being fully wired to render them (see NOTES-esp-bel-2026-07-10.md, "Pulse/
  moments" section, escalated to coordinator + design ~16:05 today). Confirm current state at warm
  checks; if still dead, that's a known carry-over, not a new finding — log it once, don't
  re-diagnose from scratch, don't let it block anything else.
- **flyctl-ssh classifier stickiness** recurred twice last night (pre-match and at FT) — a permission
  classifier occasionally cites a recent sensitive command's denial reasoning against unrelated,
  correctly-scoped calls. Both times cleared on retry or an explicit owner re-ask. §5 pre-authorizes
  tonight's ssh reads in writing, up front, specifically so this doesn't cost time at 01:00/05:00 — if
  it still snags, retry once, then flag it rather than burning more time on it.
- The Fly volume `stands_data` persists state at `/data` across restarts (proven live last night
  through a full overnight network outage) — durability is not new risk tonight.

## 4 · Warm checks (run per fixture; all four green before trusting that game)

Run this block twice tonight: **21:30 against `18213979`** (game 1), **02:15 against `18222446`**
(game 2, after §9's cutover lands). Substitute `<FIXTURE>` below with whichever you're checking.

**4.1 Feed flowing:**
```
cd /Users/ls/Documents/rooot/services/stands && node -e "
const WebSocket = require('ws');
const ws = new WebSocket('wss://rooot-stands.fly.dev/?matchId=<FIXTURE>');
const kinds = {}; let last=null;
ws.on('message', d => { try { const m=JSON.parse(d); kinds[m.type]=(kinds[m.type]||0)+1; if(m.type==='odds') last=m.tick; } catch{} });
setTimeout(() => { console.log('kinds:', kinds); if(last) console.log('market:', last.pHome, last.pDraw, last.pAway); ws.close(); process.exit(0); }, 12000);
ws.on('error', e => { console.log('WS ERROR', e.message); process.exit(1); });"
```
GREEN = `odds` count ≥ 1 in 12s and a sane de-vigged triple (sums ≈ 1). RED = zero odds → FIRST check
`feedState` (add `if(m.type==='feedState')console.log(m)` to the probe) and the service uptime: **after
ANY restart, TxLINE's SSE takes up to ~2 minutes to reattach — zero odds with `feedState: connected` or
uptime < 120s is a warm-up, not an outage** (verified live 2026-07-10 ~18:07 UTC: two silent probes
during warm-up, then 56 ticks/12s). Only escalate coordinator if silence persists past ~3 minutes with
upstream ticking. This rule carries unchanged into tonight — it applies equally after the 01:30
cutover, even though the backend isn't expected to restart for that (see §3).

**4.2 Production honesty smoke (write-proof, safe against prod):**
```
cd /Users/ls/Documents/rooot/scripts/canary && node run.mjs --web https://rooot.club --ws wss://rooot-stands.fly.dev/ --mode smoke --match <FIXTURE>
```
READ THE TABLE, not just the exit code (a route-identity mismatch prints SKIPPED and still exits 0 —
against production, a SKIP on `/` `/live` `/cabinet` identity or on "WS connects" is a FAILURE for us:
escalate coordinator). GREEN = all rows PASS including `smoke: write-block self-test`.

**4.3 Surfaces carry the right fixture:**
```
curl -s https://rooot.club/ | grep -o "<HOME>[^<]*<AWAY>\|match=<FIXTURE>\|LIVE NOW" | sort | uniq -c
curl -s https://rooot.club/gate | grep -c <FIXTURE>
grep -c "match=<FIXTURE>" /Users/ls/Documents/rooot/vercel.json
```
GREEN = landing references the right two team codes + `match=<FIXTURE>`, zero stale `LIVE NOW`, gate
count ≥ 1, and the `/live` rewrite's destination carries `<FIXTURE>`. RED → escalate owner (routes
Design). Also open `https://rooot.club/live` in a browser: it must theme the correct two teams' colors
— game 1: Norway red/navy vs England white/red; game 2: Argentina sky-blue/gold vs Switzerland
red/white — never a stale prior fixture.

**4.4 Scores coverage tripwire:**
```
node /Users/ls/Documents/rooot/services/stands/live-scores-watch.mjs <FIXTURE>
```
Start ~30min before that game's kickoff and leave it running: it polls the scores snapshot and exits
when `GameState` leaves "scheduled" or a real status/score envelope lands. If it has NOT exited by
kickoff + 3min while odds are clearly live → **scores-coverage gap**: escalate owner immediately
(TxODDS contact) AND Design ("LIVE · market only" honest header state). Do not let any surface claim a
confident 0–0 it cannot know.

| Game | Fixture | Teams | Run 4.1–4.4 at |
|---|---|---|---|
| 1 | `18213979` | Norway v England | 21:30 CEST |
| 2 | `18222446` | Argentina v Switzerland | 02:15 CEST |

## 5 · The two-phone rehearsal (22:00 CEST, game 1 only — you drive)

One rehearsal tonight, not two: it's the same product for both games, only the fixture changes at
01:30. Game 2 gets warm checks (§10), not a fresh rehearsal, unless something beyond the cutover's two
files changes on `origin/main` between FT1 and KO2 (see §14).

Owner + you, two REAL phones, fresh sessions, against production, fixture `18213979`. **Hard change
from last night: this rehearsal is not done — you do not move to freeze — until every row below is
explicitly ticked for BOTH sides.** Last night the owner's BEL-side confirmation was asked for and
never came back; the battery moved on anyway under clock pressure. Tonight that is not allowed. If the
clock is short, compress the script — skip nothing on the table below, cut narration instead — and if
you genuinely cannot get the owner's side confirmed before 22:30, say so explicitly and ask whether to
hold the freeze a few minutes rather than silently proceeding.

**5.1 Per-side checklist — tick both columns before moving on:**

| Check | You | Owner |
|---|---|---|
| Entered via rooot.club → gate → picked opposite ends, distinct score calls, both admitted | [ ] | [ ] |
| Correct pre-match market visible; each sees the other's presence | [ ] | [ ] |
| Sent one real cheer; SAW the other side's echo/roar move within ~1s | [ ] | [ ] |
| Switched every lens (loom / stands / stadium); presence never dropped | [ ] | [ ] |
| Consensus panel shows n=2, two distinct calls, never dressed as authority | [ ] | [ ] |

Note every rough edge with a screenshot as you go — the owner routes fixes; NOTHING deploys after
22:30 without live-severity.

**5.2 Five-axis experience scores — collect in writing, verbatim, into the notes file:**

| Axis | Owner's score/word |
|---|---|
| Intuitive | |
| Fun | |
| Easy | |
| Beautiful | |
| Shareable | |

Last night these were asked for and never given — the rehearsal ran out of clock first. Ask for these
explicitly as their own step, not folded into "any rough edges?" — five short answers, logged verbatim
even if terse ("7", "good", "fine" all count; don't paraphrase into your own words).

**5.3 Pre-authorize the FT ssh reads** (closes last night's classifier friction): tell the owner
plainly — *"At full time I'll run these 2 read-only ssh commands, once per full time, 4 times total
tonight, same 2 commands each time:*
```
flyctl ssh console -a rooot-stands -C "ls -la /data/sentiment/"
flyctl ssh console -a rooot-stands -C "ls -la /data/"
```
*Both are directory listings only — no file contents read, nothing written. OK to run at ~01:00 and
~05:00 without asking again?"* Log the answer. This is exactly the ask/answer shape that got stuck on
a classifier glitch twice last night — asking once, in writing, ahead of time, is the fix.

**5.4 Pre-authorize the game-2 cutover fallback** (a separate ask — log it separately too): tell the
owner plainly — *"At 01:30 the game-2 cutover happens. Normally the coordinator runs it. If neither
you nor the coordinator responds within about 10 minutes of me flagging it, I'll run the whole thing
myself — the fixture-swap script, the commit, the push to main, and the production deploy (§9's exact
commands). That's the one planned exception to me never committing or deploying. OK?"* Log the answer.
If the owner wants a different threshold or says no, use that instead and note it here verbatim.

## 6 · Freeze + pre-match battery (22:30 CEST, game 1)

- Re-run §4.1 + §4.2 + §4.3 against `18213979`. All green.
- Freeze confirmation: `git fetch origin && git log --oneline -1 origin/main` — record the sha in your
  notes; that sha is what production must identify as until §9's cutover (which only ever touches
  `apps/web/public/fixture.json` + `vercel.json`) — anything else landing after this point is
  live-severity-only, same rule as v1.
- Start the scores watch (§4.4) and the live monitor:
```
node /Users/ls/Documents/rooot/services/stands/live-monitor.mjs 18213979
```

**6.1 Monitor discipline (new tonight — closes last night's biggest quiet gap).** `live-monitor.mjs`
seeds its own baseline SILENTLY on every restart/reconnect (by design — see its own "seed the join
score silently" comment) so it only ever alerts on a change it personally witnessed after that seed.
Last night this exact mechanic swallowed the match's first goal (0→1): a routine restart landed in the
same window, so only the SECOND goal fired an alert, and the first one was caught purely because a
fresh probe happened to be run out of habit — nothing in the process required it. Tonight it's
required, every time: **after EVERY live-monitor exit — kickoff, score change, status change,
red/pen/VAR, feed stall, or the 15-min re-arm — before restarting it, run this SCORE PROBE once and log
one line:**
```
cd /Users/ls/Documents/rooot/services/stands && node -e "
const WebSocket = require('ws');
const ws = new WebSocket('wss://rooot-stands.fly.dev/?matchId=<FIXTURE>');
let score=null, status=null, minute=null;
ws.on('message', d => { try { const m=JSON.parse(d);
  if(m.type==='score'&&m.ev) score=[m.ev.home,m.ev.away];
  if(m.type==='status'&&m.ev) status=m.ev.phase||m.ev.statusId;
  if(m.ev&&typeof m.ev.minute==='number') minute=m.ev.minute; } catch{} });
setTimeout(() => { console.log('SCORE PROBE', new Date().toISOString(), 'score=', score, 'status=', status, 'minute=', minute); ws.close(); process.exit(0); }, 5000);"
```
(substitute the fixture actually live: `18213979` before the §9 cutover, `18222446` after — same tool,
used all night.) Log format: `[time] SCORE PROBE score=[h,a] status=X minute=N`. This independent log
is the only trustworthy history across restarts — cite the monitor's own alert stream as "what it
noticed," never as "what happened."

**6.2 Wrapper failure-stop (new tonight — closes last night's overnight spin).** However you're
re-invoking `live-monitor.mjs` (a manual restart loop, a backgrounded process you tail, a shell `while`
loop — your choice of mechanism), watch its error output. **If you see 5 consecutive connection-error
lines carrying `ENOTFOUND` / `ETIMEDOUT` / `socket hang up` / `connect refused` signatures, with no
successful `WS open` or feed message anywhere between them: STOP the process. Do not restart it
again.** Log one line ("monitor stopped: 5 consecutive network failures, local network suspected"),
alert the owner once, and only resume after you've independently confirmed the network is back (a
plain `curl -s https://rooot-stands.fly.dev/health` succeeding is enough) and logged one fresh SCORE
PROBE. Last night this exact failure signature ran unattended for roughly 15 hours because nothing
enforced a stop condition. The fix is mechanical, not judgment: count the failures, don't reason about
whether "it'll probably reconnect."

## 7 · Match watch — game 1 (23:00 KO1 → ~01:00 FT1)

Watch (live monitor + your own phone in the ground), §6.1's discipline running throughout, not just at
freeze:

- **Kickoff beat:** predictions LOCK at kickoff (consensus `locked:true`); gate still admits
  late-comers (root + cheer only, no new predictions). Run a SCORE PROBE right after — this doubles as
  your market-open reading for the §8.5 FT summary.
- **Every goal:** the monitor's SCORE CHANGE alert tells you a goal happened — it does NOT reliably
  tell you who scored (it tracks the scoreline only, not ledger detail). Read the scorer off your own
  open `/live` or stands tab (the adapter renders the name when the wire provides one) and log it
  immediately: `<minute>' <side> <name, if given>`. Run §6.1's SCORE PROBE regardless, goal or not, on
  every restart — don't skip it because "the goal was obvious."
- **A client that JOINS after the goal must NOT get an eruption** (late-join replay is history, not
  events — if a fresh join erupts, escalate coordinator, screenshot + timestamp).
- **Scores gap:** if §4.4's watch never fired, run the honest-degraded escalation (owner + Design).
- **Presence sanity:** `curl -s https://rooot-stands.fly.dev/health` occasionally — `clients` should
  roughly track the humans you know are connected. A sudden drop to 0 while phones are connected =
  escalate coordinator.
- **Moments (Pulse):** known open item from last night (§3) — confirm current state, don't re-diagnose
  from scratch. If still dead, that's the same finding as last night, log it once and move on; if it's
  now firing, that's new and good news — log that too. If an end was silent, the reveal must show
  silence, never invented counts.
- **Any error/weirdness:** screenshot, timestamp, console log if browser-side, escalate the owning
  lane. You do not fix.

## 8 · Full time protocol — game 1 (~01:00)

**8.1 Verdict delivery:** on your own phone (you predicted pre-kickoff): the keepsake/verdict shows
the correct 3-state verdict for YOUR call (`exact` / `outcome` / `wrong`) vs the real final score. Then
RELOAD the page: the verdict must come back (replay-on-reload). Screenshot both. Ask the owner to do
the same on their side if they're still up.

**8.2 Shootout caution:** if the match reaches penalties, FULL TIME beats fire only after the shootout
resolves — a shootout in progress must never render as full time.

**8.3 Crystallized ONCE** (ssh pre-authorized at §5.3): after FT settles (~10 min), verify exactly one
sentiment record exists:
```
flyctl ssh console -a rooot-stands -C "ls -la /data/sentiment/"
```
GREEN = exactly one `18213979-*.json`. Two files = the double-crystallize guard failed → escalate
coordinator (do NOT delete anything).

**8.4 Durability** (ssh pre-authorized at §5.3):
```
flyctl ssh console -a rooot-stands -C "ls -la /data/"
```
GREEN = the snapshot file exists and is fresh (mtime within ~60s).

**8.5 FT SUMMARY BLOCK — MANDATORY, no exceptions.** A match log without the final result is a failed
log — last night's #1 process gap; the score never made it into the record. Before you sign off this
game, write this block into the notes file, filled in for real, not left as a template:

```
FT SUMMARY — Norway v England (18213979)
Score: <H>-<A>  (decided in: 90 / ET / PENS)
Scorers: <minute>' <side> <name — if the wire gave one>; ...
Phase path: <the STATUS CHANGE sequence you logged all match per §6.1 — e.g. FIRST_HALF -> HALF_TIME -> SECOND_HALF -> FULL_TIME>
Verdict — home end (NOR): n=<consensus.byRoot.home.n>, mean call <consensus.byRoot.home.mean>; your own call's verdict <exact/outcome/wrong>
Verdict — away end (ENG): n=<consensus.byRoot.away.n>, mean call <consensus.byRoot.away.mean>
Fans: rooted home=<n> away=<n> (from the `stands` broadcast's counts); serials minted tonight (best-effort floor — ask the coordinator for the authoritative count if it matters) = <highest fanNo observed>
Market: open (kickoff tick) H<%> D<%> A<%>  ->  close (last tick pre-FT) H<%> D<%> A<%>
Crystallize-once: GREEN, <filename>
Durability: GREEN, snapshot mtime <...>
```

Build it from what you already logged live all match (§6.1's SCORE PROBEs plus goal/scorer lines give
you score, scorers, and phase path for free) plus one fresh probe for the closing numbers:
```
cd /Users/ls/Documents/rooot/services/stands && node -e "
const WebSocket = require('ws');
const ws = new WebSocket('wss://rooot-stands.fly.dev/?matchId=18213979');
let score=null, status=null, consensus=null, oddsLast=null;
ws.on('message', d => { try { const m=JSON.parse(d);
  if(m.type==='score'&&m.ev) score=[m.ev.home,m.ev.away];
  if(m.type==='status'&&m.ev) status=m.ev.phase||m.ev.statusId;
  if(m.type==='consensus') consensus=m;
  if(m.type==='odds') oddsLast=m.tick;
} catch{} });
setTimeout(() => { console.log('FT PROBE', new Date().toISOString());
  console.log('score', score, 'status', status);
  console.log('consensus', JSON.stringify(consensus));
  console.log('market close', oddsLast ? {H:oddsLast.pHome,D:oddsLast.pDraw,A:oddsLast.pAway} : null);
  ws.close(); process.exit(0); }, 8000);"
```
This probe's join-snapshot only carries RECENT history — it confirms final state, it does not reliably
replay every goal from earlier in the match. Your scorer/minute list is what you logged live, not what
this probe shows; use this probe's final score only to sanity-check that your live log sums to it. If
the verdict table needs more than your own + the owner's call, ask the coordinator — they can pull it
straight from the crystallized record.

## 9 · Game-2 cutover (01:30 CEST) — the ONLY planned post-freeze action

Everything else in this runbook is watch-and-escalate. This one step is different: it's pre-scripted,
pre-reviewed, and pre-authorized (§5.4) specifically so it can happen at 1:30am without waiting on a
fresh conversation.

**9.1 Normal path — coordinator runs it.** At 01:30 (or as soon as FT1's protocol (§8) closes out,
whichever is later), message the coordinator with this exact block:
```
cd /Users/ls/Documents/rooot && node scripts/cutover-fixture.mjs 18222446 && git add apps/web/public/fixture.json vercel.json && git commit -m "cutover: ARG-SUI 18222446" && git push origin main
```
then deploy (their normal method, or the fallback in §9.2) and re-run the smoke:
```
cd /Users/ls/Documents/rooot/scripts/canary && node run.mjs --web https://rooot.club --ws wss://rooot-stands.fly.dev/ --mode smoke --match 18222446
```
Wait for their confirmation, then go to §9.3 to verify.

**9.2 Fallback — you run it.** If neither the coordinator nor the owner has responded within ~10
minutes of your 01:30 flag (per §5.4's pre-authorization), run the full sequence yourself, checking
output at each step before the next:
1. `cd /Users/ls/Documents/rooot && node scripts/cutover-fixture.mjs 18222446` — confirm it prints
   `cutover staged: ARG v SUI (18222446), kickoff 2026-07-12T01:00:00Z`.
2. `git diff apps/web/public/fixture.json vercel.json` — confirm the diff touches ONLY
   matchId/home/away/colors/kickoffUtc fields and the `/live` rewrite destination. Anything else in the
   diff: stop, do not commit, escalate instead — that would mean something other than the cutover
   script touched these files.
3. `git add apps/web/public/fixture.json vercel.json && git commit -m "cutover: ARG-SUI 18222446" && git push origin main` — confirm the push succeeds; note the new sha.
4. Deploy:
```
git worktree add /tmp/rooot-deploy origin/main && cp -r .vercel /tmp/rooot-deploy/ && cd /tmp/rooot-deploy && vercel --prod --yes
```
   Confirm the `vercel` output prints a production URL with no build errors.
5. Re-run the smoke (the command in §9.1) — must be green, same bar as §4.2.
6. Tidy up when convenient (not blocking): `cd /Users/ls/Documents/rooot && git worktree remove /tmp/rooot-deploy`.

**9.3 Verify (either path).** Run §4.3's surface check against `18222446` (ARG/SUI tokens,
`match=18222446`, `/live` destination) and open `/live` in a browser — it must theme Argentina
sky-blue/gold vs Switzerland red/white, not a stale NOR/ENG remnant. Log: who ran it (coordinator, or
your fallback), the timestamp of each step, the final sha, and the smoke result. This IS the freeze
confirmation for game 2 — there's no separate freeze step; the cutover commit is the new baseline.

## 10 · Warm checks — game 2 (02:15 CEST)

Run §4 in full against `18222446` (the table in §4 already has this row). All four green before
treating game 2 as ready. If §9 landed clean this should be routine confirmation, not discovery — if
anything here surprises you (a check that was green in §9.3 is now red), that's worth a log line and a
second look before 03:00, not a shrug.

## 11 · Match watch — game 2, unattended-tolerant mode (03:00 KO2 → ~05:00)

The owner is very likely asleep by now — he has approved ops (you) watching this leg alone. §6.1's
monitor discipline and §6.2's wrapper failure-stop still apply exactly as before; keep logging SCORE
PROBEs after every restart and keep the 5-consecutive-failure stop rule live all night — unattended
watching does not mean unattended discipline.

**What changes is the bar for waking him.** Wake the owner ONLY for:
- production serving wrong-fixture data on any live route (not a warm-check nuance — fans seeing it),
- the service down more than 5 minutes (health genuinely unreachable — NOT the SSE warm-up rule in
  §4.1, which is expected and not an outage),
- an honesty violation visible to real fans (fabricated data rendering as if it were real),
- a data-loss signature (snapshot or crystallize errors in the logs),
- **the client-hang tripwire fires twice in a row** (below) — last night's worst incident was a
  14-minute page hang with health green the whole time; health alone cannot see it.

**The client-hang tripwire (coordinator addendum):** the write-proof smoke canary drives REAL pages
headlessly — a systemic client hang shows up as its page rows timing out (goto / document-idle
failures), no human phone required. During game 2, run the smoke (§4.2, with `--match 18222446`)
after every goal alert and roughly every 30 minutes between events. One failed run = re-run
immediately; two consecutive runs with page rows failing/timing out on live routes = wake condition.
Log every run's table line either way.

**Everything else — log it, capture the evidence, hand it to the morning.** That includes: Pulse still
dead, a rough UI edge, a transient stall that self-resolves. When in doubt outside the five conditions,
treat "unsure" as "log it, don't wake him," and flag the ambiguous case prominently in the morning
notes so the threshold itself can be sharpened next time.

Match-watch content otherwise follows §7 (kickoff beat, goals, scores gap, presence sanity, moments,
error handling) at whatever depth you can sustain solo overnight — score/status/goal logging is not
optional (it feeds the mandatory §12 FT summary); narration and screenshots of non-live-severity rough
edges are yours to triage for volume.

## 12 · Full time protocol — game 2 (~05:00, reduced depth allowed)

Same protocol as §8 (substitute `18222446` and Argentina/Switzerland throughout), run at whatever depth
the hour allows — with one explicit split:

**Still mandatory, no shortcuts:** §8.3 crystallize-once, §8.4 durability, §8.5's FT SUMMARY BLOCK in
full (score, scorers, phase path, verdict, fan counts, market open→close), and the archive capture
(§13.1). A thin night is not an excuse for a missing result — that's the exact failure this whole
revision exists to close.

**Can wait for morning:** the verdict-delivery screenshot pair (§8.1) if you're the only one awake to
take it, taste/UX observations, anything cosmetic. Note in the summary block that these were deferred
and why, rather than silently skipping them.

## 13 · Capture + notes (before you sign off, both games)

**13.1 Archive capture** (one per game, belt-and-braces beside the volume; 30s of the join-replay +
live tail):
```
cd /Users/ls/Documents/rooot/services/stands && node -e "
const WebSocket = require('ws'); const fs = require('fs');
const ws = new WebSocket('wss://rooot-stands.fly.dev/?matchId=<FIXTURE>');
const msgs = []; let consensus=null, score=null, status=null;
ws.on('message', d => { try { const m=JSON.parse(d); msgs.push(m);
  if(m.type==='consensus') consensus=m; if(m.type==='score') score=m; if(m.type==='status') status=m; } catch{} });
setTimeout(() => { fs.writeFileSync('captures/<NAME>-<FIXTURE>-ft.json', JSON.stringify({
  capturedFrom:'wss://rooot-stands.fly.dev/?matchId=<FIXTURE>', why:'FT archive capture, 30s',
  total:msgs.length, lastConsensus:consensus, lastScore:score, lastStatus:status, messages:msgs }));
  console.log('captured', msgs.length, 'messages'); ws.close(); process.exit(0); }, 30000);"
```
Game 1: `<FIXTURE>`=`18213979`, `<NAME>`=`noreng`. Game 2: `<FIXTURE>`=`18222446`, `<NAME>`=`argsui`.
Tell the coordinator both file paths — committing them is theirs.

**13.2 Night notes** (`docs/NOTES-double-header-2026-07-11.md`, timestamps + evidence, CEST throughout
even past midnight): what worked / what failed / every escalation and its outcome / the rehearsal's
per-side checklist + five-axis scores / both FT summary blocks / anything a post-mortem needs. Honest,
specific, no varnish — this file seeds tomorrow's decisions, same as last night's did for this one.

## 14 · The Release Gate (the bar, verbatim)

> Two fresh mobile sessions can enter opposite ends, see the correct pre-match market, submit distinct
> predictions, observe each other's first cheer, switch every lens without losing presence, join after
> a goal without a false eruption, and receive the correct side-aware verdict at full time. Production
> identifies the same commit as `origin/main`.

Game 1 walks this for real at the 22:00 rehearsal (§5). Game 2 does NOT get a fresh walk — it relies on
the same product, already proven once tonight, verified only through warm checks (§10) and the smoke
canary (§9.3) rather than two live phones. If anything beyond the cutover's two files lands on
`origin/main` between FT1 and KO2, treat that as new, unrehearsed code: re-run §4 in full, and flag to
the owner whether it's worth a compressed rehearsal despite the hour rather than trusting it blind at
03:00.

## 15 · Reference

- Game 1: `18213979` Norway–England, KO 21:00 UTC / 23:00 CEST. Game 2: `18222446`
  Argentina–Switzerland, KO 01:00 UTC / 03:00 CEST (July 12 local date).
- Production: https://rooot.club (Vercel) · service: `rooot-stands` on Fly,
  `wss://rooot-stands.fly.dev`.
- Docs: v1 runbook `docs/RUNBOOK-esp-bel-live-2026-07-10.md` · last night's failures
  `docs/NOTES-esp-bel-2026-07-10.md` · postmortem `docs/POSTMORTEM-fra-mar-2026-07-09.md`.
- Cutover: `scripts/cutover-fixture.mjs` — one source of truth,
  `services/stands/src/sentiment/teams.ts` FIXTURE_INFO (both tonight's fixtures already registered).
- Canary: `scripts/canary/README.md` (smoke = the only automation you point at prod).
- Laws: AGENTS.md — honesty above all; nothing renders or is recorded that didn't happen.
