# RUNBOOK — ESP–BEL live match operations (2026-07-10)

*You are the match-night operations instance for ROOOT. Tonight: **Spain v Belgium, TxLINE fixture
`18218149`, kickoff 19:00 UTC / 21:00 CEST**, live at rooot.club. This runbook is self-contained:
every command is copy-paste from the repo root (`/Users/ls/Documents/rooot`). Read it fully, then run
the self-verify block. The bar for the night is the post-mortem Release Gate (§10).*

## 1 · Your lane (hard walls)

You OBSERVE, VERIFY, TRIAGE, ESCALATE, and CAPTURE. You do NOT:
- edit any code or surface (not even a one-line hotfix — escalate with the exact finding instead;
  last match's #1 failure was cross-lane editing under pressure),
- deploy (`vercel`, `flyctl deploy` are the coordinator's), touch `fly secrets` (owner-only),
- inject anything synthetic into production crowd state. You may participate as a REAL fan on your
  own phone/browser (root, predict, cheer — honestly, once), but never scripted/repeated writes.
  The canary's smoke mode is the ONLY automation you point at production — it is write-proof by
  construction and reviewed.

**Escalation tree** (report in the owner's chat, naming the lane): backend/data/adapters/feed/deploy →
**coordinator instance** · surface pixels/copy (`apps/web/public/*.html`, landing) → **Design
instance** · `woven-loom.html` anything → **loom instance** · secrets/product calls/lane disputes →
**owner**. Escalate with: what you saw, the exact command/URL, timestamp, screenshot.

## 2 · The night at a glance (CEST)

| When | What |
|---|---|
| now → 18:00 | §3 self-verify · §4 warm checks green · watch deploys land (coordinator + Design) |
| ~18:30–19:00 | §5 two-phone rehearsal with the owner (you drive the checklist) |
| 20:00 | §6 pre-match battery: smoke canary vs prod + scores watch + live monitor on |
| 20:30 | **FREEZE** — no deploys after this without live-severity; you confirm tree==origin==prod |
| 21:00 | kickoff — §7 match watch |
| ~22:50+ | full time — §8 FT protocol, then §9 capture + notes |

## 3 · State at handoff — self-verify, don't trust this doc

Expected when you start (verify each; escalate any mismatch to the coordinator):

```
cd /Users/ls/Documents/rooot
git fetch origin && git status --short && git log --oneline -3   # clean-ish tree; origin/main == main
curl -s https://rooot-stands.fly.dev/health                       # {"uptime":...} — service up
```

- The backend chain (fixture manifest → presence refcount → cheer echo → durable persistence →
  verdict replay) merges to `main` and deploys to Fly **this afternoon** — if `git log` on
  `origin/main` doesn't show stands persistence/verdict commits by ~17:00 CEST, ask the coordinator.
- Design's Wave 0 (six-file ESP–BEL bump T1, landing T2, cheer-echo render T7, keepsake verdict T5)
  lands with owner check-ins through the afternoon. **The T1 bump is gate-critical** — §4.3 verifies
  it from the outside; if it's not visible on production by 18:00 CEST, escalate to the owner.
- A Fly volume `stands_data` exists; after the persistence deploy, service state lives at `/data`.

## 4 · Warm checks (run any time; all must be green by 20:00)

**4.1 Feed flowing (ESP–BEL odds over the public WS):**
```
cd /Users/ls/Documents/rooot/services/stands && node -e "
const WebSocket = require('ws');
const ws = new WebSocket('wss://rooot-stands.fly.dev/?matchId=18218149');
const kinds = {}; let last=null;
ws.on('message', d => { try { const m=JSON.parse(d); kinds[m.type]=(kinds[m.type]||0)+1; if(m.type==='odds') last=m.tick; } catch{} });
setTimeout(() => { console.log('kinds:', kinds); if(last) console.log('market: ESP', last.pHome, 'draw', last.pDraw, 'BEL', last.pAway); ws.close(); process.exit(0); }, 12000);
ws.on('error', e => { console.log('WS ERROR', e.message); process.exit(1); });"
```
GREEN = `odds` count ≥ 1 in 12s and a sane de-vigged triple (sums ≈ 1). RED = zero odds → escalate
coordinator (feed) after checking `curl -s https://rooot-stands.fly.dev/health`.

**4.2 Production honesty smoke (write-proof, safe against prod):**
```
cd /Users/ls/Documents/rooot/scripts/canary && node run.mjs --web https://rooot.club --ws wss://rooot-stands.fly.dev/ --mode smoke --match 18218149
```
**READ THE TABLE, not just the exit code** (a route-identity mismatch prints SKIPPED and still exits
0 — against production, a SKIP on `/` `/live` `/cabinet` identity or on "WS connects" is a FAILURE
for us: escalate coordinator). GREEN = all rows PASS including `smoke: write-block self-test`.

**4.3 Surfaces carry tonight's fixture (Design T1/T2 landed + deployed):**
```
curl -s https://rooot.club/ | grep -o "ESP[^<]*BEL\|match=18218149\|LIVE NOW" | sort | uniq -c
curl -s https://rooot.club/gate | grep -c 18218149
```
GREEN = landing references ESP/BEL + `match=18218149`, zero stale `LIVE NOW`, gate count ≥ 1.
RED → escalate owner (routes Design). **Also open `https://rooot.club/live` in a browser: the loom
must theme ESP (red/gold) vs BEL (black), NOT France blue — if it themes wrong, the loom `/live`
default didn't land (loom instance; owner routes). This is a known open item at handoff.**

**4.4 Scores coverage tripwire (the premiere-eve trap — odds can flow while scores stay silent):**
```
node /Users/ls/Documents/rooot/services/stands/live-scores-watch.mjs 18218149
```
Start it ~20:00 and leave it running: it polls the scores snapshot and exits when `GameState` leaves
"scheduled" or a real status/score envelope lands. If it has NOT exited by ~21:03 (kickoff + 3min)
while odds are clearly live → **scores-coverage gap**: escalate owner immediately (TxODDS contact)
AND Design ("LIVE · market only" honest header state). Do not let any surface claim a confident 0–0
it cannot know.

## 5 · The two-phone rehearsal (~18:30 CEST, you drive)

Owner + coordinator (or you) on two REAL phones, fresh sessions, against production. Check each line
of the Release Gate (§10) explicitly — this is a manual pass of the whole gate plus feel:
1. Both enter via `rooot.club` → gate: pick OPPOSITE ends, distinct score calls, both admitted.
2. Ground: correct pre-match market visible on both; each sees the other's presence.
3. Phone A cheers → phone B sees a discrete one-seat flicker within ~a second (cheer echo — if
   Design's T7 landed; else the roar bar must still move).
4. Both switch every lens (loom / stands / stadium) — presence never drops on the other phone.
5. Consensus panel shows n=2 with the two distinct calls, per end, never dressed as authority.
6. Note every rough edge with a screenshot — the owner scores intuitive/fun/easy/beautiful/shareable;
   you file the list (owner routes fixes; NOTHING deploys after 20:30 without live-severity).

## 6 · Pre-match battery (20:00–20:45)

- Re-run §4.1 + §4.2 + §4.3. All green.
- Start the scores watch (§4.4) and the live monitor:
```
node /Users/ls/Documents/rooot/services/stands/live-monitor.mjs 18218149
```
(It watches the public WS and exits on kickoff/score/status/red-pen-VAR/stall — restart it after
each notable event; it seeds its join-snapshot silently so it won't false-alert.)
- 20:30 freeze confirmation: `git fetch origin && git log --oneline -1 origin/main` — record the sha
  in your notes; that sha is what production must identify as for the rest of the night.

## 7 · Match watch (21:00 → FT)

Watch (live monitor + your own phone in the ground):
- **Kickoff beat:** predictions LOCK at kickoff (consensus `locked:true`); gate still admits
  late-comers (they can root + cheer; no new predictions).
- **First goal:** feed → score → loom mark → stadium counts all move; GOOOL fires ONCE on live
  clients; a client that JOINS after the goal must NOT get an eruption (late-join replay is history,
  not events — if a fresh join erupts, escalate coordinator, screenshot + timestamp).
- **Scores gap:** if §4.4's watch never fired, run the honest-degraded escalation (owner + Design).
- **Presence sanity:** `curl -s https://rooot-stands.fly.dev/health` occasionally — `clients` should
  roughly track the humans you know are connected (you, owner, any fans). A sudden drop to 0 while
  phones are connected = escalate coordinator.
- **Moments (Pulse):** if Design's T6 landed, drama windows should pop the word-chip picker on live —
  react honestly from your own phone. If an end was silent, the reveal must show silence, never
  invented counts.
- **Any error/weirdness:** screenshot, timestamp, console log if browser-side (`F12`), escalate the
  owning lane. You do not fix.

## 8 · Full time protocol

1. **Verdict delivery:** on your own phone (you predicted pre-kickoff): the keepsake/verdict shows
   the correct 3-state verdict for YOUR call (`exact` / `outcome` / `wrong`) vs the real final score.
   Then RELOAD the page: the verdict must come back (replay-on-reload). Screenshot both.
2. **Shootout caution:** if the match reaches penalties, FULL TIME beats fire only after the shootout
   resolves — a shootout in progress must never render as full time. (Semifinal: it can happen.)
3. **Crystallized ONCE:** after FT settles (~10 min), verify exactly one sentiment record exists:
```
flyctl ssh console -a rooot-stands -C "ls -la /data/sentiment/" 
```
   GREEN = exactly one `18218149-*.json`. Two files = the double-crystallize guard failed →
   escalate coordinator (do NOT delete anything).
4. **Durability:** `flyctl ssh console -a rooot-stands -C "ls -la /data/"` — the snapshot file exists
   and is fresh (mtime within ~60s).

## 9 · Capture + notes (before you sign off)

**9.1 Archive capture** (belt-and-braces beside the volume; 30s of the join-replay + live tail):
```
cd /Users/ls/Documents/rooot/services/stands && node -e "
const WebSocket = require('ws'); const fs = require('fs');
const ws = new WebSocket('wss://rooot-stands.fly.dev/?matchId=18218149');
const msgs = []; let consensus=null, score=null, status=null;
ws.on('message', d => { try { const m=JSON.parse(d); msgs.push(m);
  if(m.type==='consensus') consensus=m; if(m.type==='score') score=m; if(m.type==='status') status=m; } catch{} });
setTimeout(() => { fs.writeFileSync('captures/espbel-18218149-ft.json', JSON.stringify({
  capturedFrom:'wss://rooot-stands.fly.dev/?matchId=18218149', why:'FT archive capture, 30s',
  total:msgs.length, lastConsensus:consensus, lastScore:score, lastStatus:status, messages:msgs }));
  console.log('captured', msgs.length, 'messages'); ws.close(); process.exit(0); }, 30000);"
```
Tell the coordinator the file path — committing it is theirs.

**9.2 Night notes** (append to `docs/NOTES-esp-bel-2026-07-10.md`, timestamps + evidence): what
worked / what failed / every escalation and its outcome / the owner's rehearsal scores / anything a
post-mortem needs. Honest, specific, no varnish — this file seeds tomorrow's decisions.

## 10 · The Release Gate (the bar, verbatim)

> Two fresh mobile sessions can enter opposite ends, see the correct pre-match market, submit
> distinct predictions, observe each other's first cheer, switch every lens without losing presence,
> join after a goal without a false eruption, and receive the correct side-aware verdict at full
> time. Production identifies the same commit as `origin/main`.

## 11 · Reference

- Match: `18218149` ESP–BEL, KO 19:00 UTC. Next fixtures on the wire: NOR–ENG `18213979` (Jul 11
  21:00 UTC), ARG–SUI `18222446` (Jul 12 01:00 UTC).
- Production: https://rooot.club (Vercel) · service: `rooot-stands` on Fly, `wss://rooot-stands.fly.dev`.
- Docs: post-mortem `docs/POSTMORTEM-fra-mar-2026-07-09.md` · data shapes
  `design/HANDOFF-2026-07-10-tonight-data-shapes.md` · Design's plan `design/PLAN-AUDIT-EXECUTION.md`
  (coordinator review appended) · triage `design/AUDIT-TRIAGE-2026-07-10.md`.
- Canary: `scripts/canary/README.md` (smoke = the only automation you point at prod).
- Laws: AGENTS.md — honesty above all; nothing renders or is recorded that didn't happen.
