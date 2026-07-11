/**
 * WebSocket + HTTP server. Wires the contracts/crowd.ts protocol to
 * MatchState/MatchRegistry. One WS connection = one browser tab; each
 * connection joins exactly one match room (cap: 1 room per connection, per
 * task spec) via HelloMsg, and may additionally join one row (RoomStateMsg
 * roomId) inside that match.
 *
 * Kill switches (env): DISABLE_PULSE drops react handling silently (hello/
 * cheer/call still work); DISABLE_ROOMS drops roomId join/RoomStateMsg.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import type { CallMsg, CallReceiptMsg, CheerEchoMsg, ClientMsg, MomentKind, MomentOpenMsg, MomentResultMsg, RoomStateMsg, ServerMsg, Side, WelcomeMsg } from '@contracts/crowd';
import { FEELING_PALETTES } from '@contracts/crowd';
import type { FeedMsg } from '@contracts/feed';
import { REACT_WINDOW_MS, RollingCounter, SWING_DELTA_MIN, SWING_WINDOW_MS } from './decay';
import { MatchRegistry } from './registry';
import { anchorRecordHash, relayCall } from './relay';
import { DATA_DIR, writeFileAtomic } from './snapshot';
import { SentimentAccumulator } from './sentiment/accumulator';
import { fixtureInfo } from './sentiment/teams';
// ── SEAT: self-custodial fan identity + mint-to-fan relics (YOUR SEAT) ─────
// Reconciled from the your-seat worktree branch onto this file's current shape —
// docs/HANDOFF-2026-07-10-coordinator-session.md §5. Imports grouped here so the
// whole SEAT surface (imports + the function block below + the route wiring
// inside createStandsServer) is easy to lift as one unit.
import { networkFor } from './mint/config';
import type { LiveScoreSnapshot } from './mint/relic-from-match';
import { assetsByOwner } from './seat/album';
import { bindClaim } from './seat/claim';
import { mintScarfForClaim, type ScarfMint } from './seat/mint-scarf';
import { loadProfile, saveProfile } from './seat/profile-store';
import { isValidPubkey } from './seat/validate';

const PORT = Number(process.env.PORT ?? 8787);
const DISABLE_PULSE = process.env.DISABLE_PULSE === '1';
const DISABLE_ROOMS = process.env.DISABLE_ROOMS === '1';
/** Kill switch for REACT drama windows (docs/MECHANISMS.md §4) — momentReact
 * handling + auto window open/close both stop; hello/cheer/predict/call stay. */
const DISABLE_MOMENTS = process.env.DISABLE_MOMENTS === '1';

/** Rate-limit hello floods: max hellos per connection per window. */
const HELLO_MAX_PER_WINDOW = 5;
const HELLO_WINDOW_MS = 10_000;

/** Standard ws keepalive (ws docs, "How to detect and close broken
 * connections"): heartbeatTick (below) pings every connection on this
 * interval and terminates any that failed to pong since the PREVIOUS round.
 * Fix F1b (post-mortem): with no ping/pong at all, Fly's proxy was silently
 * dropping long-lived idle-ish sockets (the live monitor's tap, fans'
 * idle-ish connections) ~every 30min, feeding last night's reconnect churn.
 * Env-tunable so the dev check can run a real multi-round test in seconds
 * instead of minutes; clamped so a bad env value can't busy-loop the server. */
function wsHeartbeatIntervalMs(): number {
  const raw = process.env.WS_HEARTBEAT_INTERVAL_MS;
  const n = raw !== undefined ? Number(raw) : 30_000;
  return Number.isFinite(n) ? Math.max(5_000, n) : 30_000;
}
const WS_HEARTBEAT_INTERVAL_MS = wsHeartbeatIntervalMs();

const START_MS = Date.now();

interface ConnState {
  ws: WebSocket;
  matchId: string | null;
  anonId: string | null;
  helloTimestamps: number[];
  /** ws keepalive (heartbeatTick below): true once a pong — or the initial
   * connect — has been seen since the last heartbeat round; the next round
   * flips it false when it pings, and terminates the connection if it's
   * still false the round AFTER that. */
  isAlive: boolean;
}

const conns = new Map<WebSocket, ConnState>();

function send(ws: WebSocket, msg: ServerMsg | FeedMsg): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

/** Like send, but tags the message as a JOIN replay so the client can weave the
 * match's history WITHOUT re-firing one-shot live effects (the goal eruption). */
function sendReplay(ws: WebSocket, msg: ServerMsg | FeedMsg): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ ...msg, _replay: true }));
}

/**
 * Fix 4 (design-lane wire probe): the FeedMsg variants that carry no fixture
 * identity of their own — odds was the one caught live (a screenshot of
 * market ticks briefly rendering under the PREVIOUS fixture's labels during a
 * transition), so stands-adapter.js's switch had nothing to guard 'odds' by,
 * unlike every ServerMsg case (which already carries matchId). Audited the
 * rest of the feed union the same way: score/status/ledger/feedState are
 * equally bare; spell/lineup already carry fixtureId and fixtureInfo IS the
 * fixture identity, so those three are left alone. */
const STAMPABLE_FEED_TYPES = new Set(['odds', 'score', 'status', 'ledger', 'feedState']);

/** Stamp matchId onto the feed types above, once, at the ONE chokepoint that
 * already has matchId in hand for every message it sends (broadcastToMatch is
 * room-scoped by construction). Never overwrites an already-present matchId
 * (defensive; no producer sets one today). Used for the live send AND fed
 * into rememberForJoin below, so the join-snapshot cache (and therefore a
 * late joiner's replay) carries the SAME stamped reference — one stamp, every
 * delivery path covered, no separate touch point needed at replay time. */
function withMatchId(matchId: string, msg: ServerMsg | FeedMsg): ServerMsg | FeedMsg {
  switch (msg.type) {
    case 'odds':
    case 'score':
    case 'status':
    case 'ledger':
    case 'feedState':
      return msg.matchId ? msg : { ...msg, matchId };
    default:
      return msg;
  }
}

/** Full diagnostic detail for a caught error — the stack when available, not
 * just String(err) (which for a real Error gives only "Error: message", no
 * trace). Pulse post-mortem (Jul 10 ESP-BEL): the server provably opened ZERO
 * moment windows across a whole live match with three goals — the volume's
 * persisted openedTriggerIds for 18218149 stayed empty with the dedup
 * persistence live. (The prior night, Jul 9 FRA-MAR, was DIFFERENT: six
 * windows opened server-side; the client never subscribed — a client bug,
 * since fixed.) The catch blocks guarding this pipeline only ever logged
 * String(err), so IF one had fired that night, Fly logs would carry no stack
 * to diagnose from. The ESP-BEL server silence was never conclusively
 * reproduced locally despite driving the real captured wire data end-to-end
 * through the real dispatch path (detectMoment/momentLifecycle proved correct
 * against it) — this ensures a repeat is diagnosable from logs alone. */
function errDetail(err: unknown): string {
  return err instanceof Error && err.stack ? err.stack : String(err);
}

/** Broadcast to every connection currently in matchId's room. */
function broadcastToMatch(matchId: string, msg: ServerMsg | FeedMsg): void {
  const stamped = withMatchId(matchId, msg);
  const payload = JSON.stringify(stamped);
  for (const [ws, state] of conns) {
    if (state.matchId === matchId && ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
  // Each side-effect below is independently isolated (its own try/catch) — a
  // fault in ONE (e.g. rememberForJoin) must never silently prevent ANOTHER
  // (e.g. momentLifecycle) from running for the SAME message. Before this fix
  // only momentLifecycle was isolated: an exception thrown by rememberForJoin/
  // feedSentiment/predictLifecycle would propagate OUT of broadcastToMatch
  // entirely — uncaught here — skipping every side-effect declared AFTER it
  // (including moment detection) for that one message, with nothing logged
  // under a `[moment]`-prefixed line to point at. A prime suspect for the Jul
  // 10 ESP-BEL server-side Pulse silence (openedTriggerIds provably empty on
  // the volume through three goals — docs/NOTES-esp-bel-2026-07-10.md; the
  // Jul 9 FRA-MAR night was different: six windows opened server-side, the
  // client never subscribed — docs/POSTMORTEM-fra-mar-2026-07-09.md, since
  // fixed client-side) that static analysis + full realistic replay of the
  // real captured match could not conclusively reproduce — this closes the
  // gap regardless of whether it was the exact trigger, matching this
  // broadcast fan-out's own stated intent ("this new layer must NEVER be
  // able to break the core... broadcast").
  try {
    rememberForJoin(matchId, stamped); // snapshot the match state for mid-match joiners
  } catch (err) {
    console.warn(`[stands] rememberForJoin error on ${matchId}: ${errDetail(err)}`);
  }
  try {
    feedSentiment(matchId, stamped); // accumulate the sentiment record (docs/SENTIMENT.md)
  } catch (err) {
    console.warn(`[sentiment] feed error on ${matchId}: ${errDetail(err)}`);
  }
  try {
    predictLifecycle(matchId, stamped); // lock at KO, resolve at FT (docs/MECHANISMS.md §2)
  } catch (err) {
    console.warn(`[predict] lifecycle error on ${matchId}: ${errDetail(err)}`);
  }
  // REACT drama windows (docs/MECHANISMS.md §4) — isolated: this layer must
  // NEVER be able to break the core crowd/feed broadcast above, nor be broken
  // BY it (see the isolation note above).
  try {
    momentLifecycle(matchId, stamped);
  } catch (err) {
    console.warn(`[moment] lifecycle error on ${matchId}: ${errDetail(err)}`);
  }
}

/** Send one message only to the connections of a specific anonId. */
function sendToAnon(matchId: string, anonId: string, msg: ServerMsg): void {
  const payload = JSON.stringify(msg);
  for (const [ws, state] of conns) {
    if (state.matchId === matchId && state.anonId === anonId && ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

/** Predictions lock at kickoff and resolve at full time — driven by the phase
 * on the status feed (the match's own truth). Idempotent: resolve fires once. */
const resolvedMatches = new Set<string>();
function predictLifecycle(matchId: string, msg: ServerMsg | FeedMsg): void {
  if (msg.type !== 'status') return;
  const phase = msg.ev.phase;
  const match = registry.get(matchId);
  if (!match) return;
  if (phase === 'FIRST_HALF' && !match.predictionsLocked()) {
    match.lockPredictions();
    broadcastToMatch(matchId, match.consensus()); // clients flip to the locked view
  }
  if (phase === 'FULL_TIME' && !resolvedMatches.has(matchId)) {
    const snap = joinSnapshots.get(matchId);
    const fh = snap && snap.score ? snap.score.ev.home : undefined;
    const fa = snap && snap.score ? snap.score.ev.away : undefined;
    if (typeof fh === 'number' && typeof fa === 'number') {
      resolvedMatches.add(matchId);
      // per-fan delivery, not a match broadcast — a verdict is personal
      // (Task 4 point 2: confirmed sendToAnon already scopes to this anonId's
      // own sockets only). Late joiners/reconnects get theirs via handleHello's
      // verdictFor(anonId) replay instead of a resend here.
      for (const v of match.resolvePredictions(fh, fa)) sendToAnon(matchId, v.anonId, v);
      // pass the SAME known-good final score used above to resolve verdicts
      // (fh/fa, sourced from joinSnapshots' cached score — proven reliable,
      // it's what the resolved-verdict path already depends on) straight into
      // crystallization, rather than trusting the accumulator's OWN
      // independently-tracked `this.final` (fed by a separate 'score'
      // case in accumulator.ts's onFeed). Folded fix: the crystallized
      // record's finalScore came out empty despite the match reaching FT
      // 2-1 on the wire — two parallel trackers of "the final score" can
      // drift; this collapses onto the one already proven correct instead of
      // trying to root-cause the second tracker's own gap.
      crystallizeSentiment(matchId, match, { home: fh, away: fa }); // the record — persist + emit (docs/SENTIMENT.md)
      // Fix 1 (review I1): snapshot IMMEDIATELY instead of waiting up to 30s
      // for the periodic timer — a machine death in that window would restore
      // predictions with no verdicts/resolved flag, letting a re-delivered
      // FULL_TIME on boot double-fire crystallize+anchor. Reuses the identical
      // write path + hooks the interval uses (registry.snapshotNow()); guarded
      // the same way the interval write effectively is — must never throw
      // into the FT branch.
      try {
        registry.snapshotNow();
      } catch (err) {
        console.warn(`[stands] immediate post-FT snapshot failed for ${matchId}: ${errDetail(err)}`);
      }
    }
  }
}

/* ── REACT / the Pulse — drama moments (docs/MECHANISMS.md §4) ─────────── */
/** per-match close timer for the one open window. */
const openMomentTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** rolling window of recent de-vigged triples per match — the baseline for
 * WINDOWED swing detection (folded fix, decay.ts's SWING_WINDOW_MS doc
 * comment: a consecutive-tick comparison is invisible on a high-tick feed).
 * Oldest-first; entries older than SWING_WINDOW_MS are dropped off the front
 * as new ticks arrive, so "the window's start" is always ~SWING_WINDOW_MS of
 * real wire time ago, never an artifact of tick rate. Keyed by the tick's own
 * wire timestamp (tick.tMs), not Date.now() — correct under both live speed
 * and a REPLAY_FILE running faster/slower than real time. */
const tripleWindow = new Map<string, Array<{ tMs: number; triple: { home: number; draw: number; away: number } }>>();
/** trigger sources already turned into a moment (a goal re-emits as it upgrades;
 * full-time can repeat) — dedupe so one drama opens exactly one window.
 * Persisted per match via registry's openedTriggers hooks below (post-mortem
 * fix, fanStats review follow-up): without this, a restart re-armed an empty
 * Set here, and TxLINE's seedSnapshot() (or a REPLAY_FILE restart, which
 * always plays from line 0) re-dispatching a historical goal/card/VAR through
 * the SAME dispatch path as live traffic could reopen an already-run drama
 * moment — a "ghost window" whose react corrupted a fan's PERSISTED
 * fanStats.reacts through a fully "legitimate" accept path. */
const openedTriggerIds = new Map<string, Set<string>>();

/** Get-or-create this match's trigger-id Set — the one place both the live
 * dedup check (momentLifecycle below) and snapshot restore touch
 * openedTriggerIds, so they can never drift out of sync with each other. */
function openedTriggersFor(matchId: string): Set<string> {
  let seen = openedTriggerIds.get(matchId);
  if (!seen) {
    seen = new Set();
    openedTriggerIds.set(matchId, seen);
  }
  return seen;
}

interface MomentTrigger {
  kind: MomentKind;
  side: Side | null;
  minute: number | null;
  /** hard events supersede an open soft window and ignore the cooldown. */
  hard: boolean;
  /** stable id for dedupe (ledger event id / `${matchId}:ft`); null = swing. */
  sourceId: string | null;
}

/** Read a drama trigger off a REAL wire message — never synthesized.
 * Exported for the REACT dry-run (src/dev/react-dryrun.ts). */
export function detectMoment(matchId: string, msg: ServerMsg | FeedMsg): MomentTrigger | null {
  if (msg.type === 'ledger') {
    if (msg.msg.type !== 'event') return null;
    const ev = msg.msg.ev;
    switch (ev.kind) {
      case 'goal':
        return { kind: 'goal', side: ev.side, minute: ev.minute, hard: true, sourceId: ev.id };
      case 'possible':
        return { kind: 'possible', side: ev.side, minute: ev.minute, hard: true, sourceId: ev.id };
      case 'red-card':
        return { kind: 'red', side: null, minute: ev.minute, hard: true, sourceId: ev.id };
      case 'var':
        return { kind: 'var', side: null, minute: ev.minute, hard: true, sourceId: ev.id };
      case 'shot': {
        const d = (ev.detail ?? '').toLowerCase();
        // a shot off the frame — the "OOOH" without a goal (soft: yields to goals)
        if (d.includes('woodwork') || d.includes('post') || d.includes('bar')) {
          return { kind: 'near-miss', side: ev.side, minute: ev.minute, hard: false, sourceId: ev.id };
        }
        return null;
      }
      default:
        return null;
    }
  }
  if (msg.type === 'status') {
    if (msg.ev.phase !== 'FULL_TIME') return null;
    return { kind: 'full-time', side: null, minute: msg.ev.minute ?? null, hard: true, sourceId: `${matchId}:ft` };
  }
  if (msg.type === 'odds') {
    const t = msg.tick;
    const cur = { home: t.pHome, draw: t.pDraw, away: t.pAway };
    const nowMs = t.tMs;
    let win = tripleWindow.get(matchId);
    if (!win) {
      win = [];
      tripleWindow.set(matchId, win);
    }
    // age out anything older than the window BEFORE reading "the window's
    // start" — so the oldest surviving entry is always ~SWING_WINDOW_MS ago,
    // not whatever happened to be first in a long-lived array.
    while (win.length > 0 && nowMs - win[0]!.tMs > SWING_WINDOW_MS) win.shift();
    const start = win.length > 0 ? win[0]!.triple : null;
    win.push({ tMs: nowMs, triple: cur });
    if (!start) return null; // no baseline old enough yet — first tick(s) of a fresh window
    const dH = Math.abs(cur.home - start.home);
    const dD = Math.abs(cur.draw - start.draw);
    const dA = Math.abs(cur.away - start.away);
    const deltaMax = Math.max(dH, dD, dA);
    if (deltaMax < SWING_DELTA_MIN) return null; // below the noise floor — not a moment
    const toward: Side | null = deltaMax === dH ? 'home' : deltaMax === dA ? 'away' : null;
    return { kind: 'swing', side: toward, minute: null, hard: false, sourceId: null };
  }
  return null;
}

/** Drive the drama windows off the same broadcast every message rides. */
function momentLifecycle(matchId: string, msg: ServerMsg | FeedMsg): void {
  if (DISABLE_MOMENTS) return;
  const trig = detectMoment(matchId, msg);
  if (!trig) return;
  // getOrCreate (NOT get): a drama trigger is a property of the FEED, not of
  // whether any fan has helloed yet — matches handleHello/handleCheer/
  // handlePredict's use of getOrCreate elsewhere in this file (Pulse
  // post-mortem: `.get()` here meant a match with no crowd presence yet
  // silently dropped every trigger for its whole life, with nothing logged;
  // predictLifecycle a few lines up has the identical shape and was never
  // changed — it's already proven safe by the FULL_TIME resolve+crystallize
  // path succeeding live, and staying on `.get()` there keeps this change
  // surgical to the actually-reported-broken layer).
  const match = registry.getOrCreate(matchId);

  if (trig.hard) {
    // unconditional breadcrumb for hard triggers only (goal/red/var/full-time
    // — rare, never per-tick) — so a repeat of "zero moments all match" is
    // instantly diagnosable from Fly logs alone: was the trigger even seen?
    console.log(`[moment] hard trigger seen: ${matchId} ${trig.kind}@${trig.minute ?? '?'}' sourceId=${trig.sourceId ?? 'null'}`);
  }

  if (trig.sourceId) {
    const seen = openedTriggersFor(matchId);
    if (seen.has(trig.sourceId)) return; // already made a moment of this drama
    seen.add(trig.sourceId);
  }

  const active = match.activeMomentId();
  if (active) {
    if (!trig.hard) return; // a soft trigger never interrupts an open window
    closeMomentNow(matchId, active); // hard event supersedes: reveal the prior, then open
  } else if (!trig.hard && !match.canOpenSoft()) {
    return; // still inside the cooldown after the last close
  }

  const now = Date.now();
  const momentId = trig.sourceId ?? `${matchId}:${trig.kind}:${now}`;
  const palette = match.beginMoment(momentId, trig.kind, trig.side, trig.minute, now);
  if (!palette) return; // defensive — we ensured no window was open
  const open: MomentOpenMsg = {
    type: 'moment',
    matchId,
    momentId,
    kind: trig.kind,
    side: trig.side,
    minute: trig.minute,
    opensAtMs: now,
    closesAtMs: now + REACT_WINDOW_MS,
    palette,
  };
  broadcastToMatch(matchId, open);
  const timer = setTimeout(() => {
    try {
      closeMomentNow(matchId, momentId);
    } catch (err) {
      console.warn(`[moment] close error on ${matchId}: ${errDetail(err)}`);
    }
  }, REACT_WINDOW_MS);
  (timer as { unref?: () => void }).unref?.(); // a pending window must not hold the process open
  openMomentTimers.set(matchId, timer);
}

/** Close a window (on timer or supersede): aggregate the split + reveal it. */
function closeMomentNow(matchId: string, momentId: string): void {
  const timer = openMomentTimers.get(matchId);
  if (timer) {
    clearTimeout(timer);
    openMomentTimers.delete(matchId);
  }
  const match = registry.get(matchId);
  if (!match) return;
  const result = match.endMoment(momentId);
  if (!result) return; // already closed / superseded
  const msg: MomentResultMsg = {
    type: 'momentResult',
    matchId,
    momentId,
    kind: result.kind,
    minute: result.minute,
    byEnd: result.byEnd,
    closedAtMs: Date.now(),
  };
  broadcastToMatch(matchId, msg); // → clients (the reveal) + feedSentiment (into feel.moments)
  const h = msg.byEnd.home;
  const a = msg.byEnd.away;
  console.log(
    `[moment] ${matchId} ${result.kind}@${result.minute ?? '?'}' — home ${h.n}×${h.top || '—'} · away ${a.n}×${a.top || '—'}`,
  );
}

/* ── sentiment record (docs/SENTIMENT.md) ─────────────────────────────── */
const accumulators = new Map<string, SentimentAccumulator>();
/** The one place a match's SentimentAccumulator is created — used both by the
 * live feed path (feedSentiment) and by snapshot restore (registry's moments
 * hook, below), so a restart-restored accumulator and a freshly-fed one are
 * always the SAME instance per matchId. Unknown fixture -> null (no team
 * identity to record against — never a placeholder). */
function getOrCreateAccumulator(matchId: string): SentimentAccumulator | null {
  let acc = accumulators.get(matchId);
  if (!acc) {
    const fx = fixtureInfo(matchId);
    if (!fx) return null;
    acc = new SentimentAccumulator(matchId, fx);
    accumulators.set(matchId, acc);
  }
  return acc;
}

function feedSentiment(matchId: string, msg: ServerMsg | FeedMsg): void {
  const acc = getOrCreateAccumulator(matchId);
  if (!acc) return; // unknown fixture — no team identity to record against
  acc.onFeed(msg);
}

/** Full-time crystallization, persisted on the SAME durable dir the restart
 * snapshot uses (Task 3 — volume-ready: /data on Fly when the volume is
 * mounted, /tmp otherwise). One timestamped file per crystallization — never
 * overwritten by a later match — except the async anchor-tx-sig fill-in
 * below, which updates THIS SAME file (it's the same crystallization event,
 * just completing its on-chain anchor a little later). */
function crystallizeSentiment(
  matchId: string,
  match: ReturnType<MatchRegistry['get']>,
  /** The known-good final score (predictLifecycle's own resolvePredictions
   * input) — see the call-site comment. Optional so callers without one
   * (none today; kept optional to match SentimentAccumulator.crystallize's
   * own optional 3rd param) fall back to the accumulator's live-tracked
   * total. */
  finalScore?: { home: number; away: number },
): void {
  const acc = accumulators.get(matchId);
  if (!acc || !match) return;
  try {
    const record = acc.crystallize(
      { consensus: match.consensus(), rooted: match.counts() },
      { serial: 1, editionSize: null, caption: matchId },
      finalScore,
    );
    const dir = path.join(DATA_DIR, 'sentiment');
    const filePath = path.join(dir, `${matchId}-${Date.now()}.json`);
    mkdirSync(dir, { recursive: true });
    writeFileAtomic(filePath, JSON.stringify(record, null, 2));
    broadcastToMatch(matchId, { type: 'sentiment', record } as unknown as ServerMsg);
    console.log(`[sentiment] crystallized ${matchId}: ${record.headline} (hash ${record.provenance.recordHash.slice(0, 12)}) -> ${filePath}`);
    // anchor the hash on-chain (best-effort) → persist + re-emit with the txSig.
    void anchorRecordHash(matchId, record.provenance.recordHash).then((sig: string | null) => {
      if (!sig) return;
      record.provenance.anchorTxSig = sig;
      writeFileAtomic(filePath, JSON.stringify(record, null, 2));
      broadcastToMatch(matchId, { type: 'sentiment', record } as unknown as ServerMsg);
    });
  } catch (err) {
    console.warn(`[sentiment] crystallize failed for ${matchId}: ${errDetail(err)}`);
  }
}

/**
 * MATCH SNAPSHOT for mid-match joins (caught live at CAN–MAR, Jul 4: a fan
 * loading 20' in saw "KICK OFF SOON" and a still tide — status/score are
 * edge-triggered on the wire, so between events a fresh socket learns
 * nothing until the NEXT change, which can be many minutes). We cache the
 * last of each state-bearing message per match and replay them on join so
 * the page shows the TRUE live state instantly. Odds/score/status are single
 * latest-wins; ledger keeps a bounded recent tail so the story isn't blank.
 * Everything replayed is a REAL message the wire actually sent — no
 * fabrication, just "catch you up to now."
 */
interface JoinSnapshot {
  feedState?: Extract<FeedMsg, { type: 'feedState' }>;
  odds?: Extract<FeedMsg, { type: 'odds' }>;
  score?: Extract<FeedMsg, { type: 'score' }>;
  status?: Extract<FeedMsg, { type: 'status' }>;
  fixtureInfo?: Extract<FeedMsg, { type: 'fixtureInfo' }>;
  lineup?: Extract<FeedMsg, { type: 'lineup' }>;   // the starting XI — latest-wins, replayed on join
  /** The whole match, downsampled, so a JOIN weaves the full cloth — the belief
   * arc, every woven event, and the pressure shape — not one stretched-flat
   * point (owner caught the straight-line loom live, Jul 5). Odds carry no minute
   * of their own, so each kept tick is stamped with the match minute it landed at. */
  oddsHistory: Array<Extract<FeedMsg, { type: 'odds' }>>;
  eventHistory: Array<Extract<FeedMsg, { type: 'ledger' }>>;
  /** EVERY danger ledger event (not downsampled) — the stadium's attack/high-danger
   * counts must be exact on join, so the count can't be thinned like the loom's curve. */
  pressureHistory: Array<Extract<FeedMsg, { type: 'ledger' }>>;
  /** EVERY possession spell — possession% + territory reconstruct exactly on join
   * (the client rebuilds the time-share from the full spell sequence). */
  spellHistory: Array<Extract<FeedMsg, { type: 'spell' }>>;
  lastOddsMs?: number;
  lastMinute?: number;
}
const ODDS_HISTORY_MAX = 400;
const ODDS_HISTORY_GAP_MS = 12000; // ~1 belief point / 12s of wire time → a smooth curve
// keep the WHOLE match of discrete events (re-emissions included; the client dedupes by id),
// so a socket that joins at 70' still accumulates COMPLETE stats — not since-connect. A full
// 90'+ET match is ~500 event messages; 1200 leaves generous headroom before the oldest evict.
const EVENT_HISTORY_MAX = 1200;
const PRESSURE_HISTORY_MAX = 700; // ALL danger events (not thinned) — attack/high-danger counts exact on join
const SPELL_HISTORY_MAX = 1600;   // ALL possession spells — possession% + territory exact on join
// loom-woven marks…
const WOVEN_KINDS = new Set(['goal', 'yellow-card', 'red-card', 'var', 'shot', 'corner', 'possible', 'penalty-kick']);
// …plus the stats-only families the stadium/count tally but the loom doesn't weave. Without
// these on the join replay, a late joiner's subs/injuries/throw-ins/fouls/offsides stay empty
// (the "incomplete data" owner caught, Jul 7). free-kick carries fouls + offsides.
const STAT_KINDS = new Set(['substitution', 'injury', 'throw-in', 'free-kick']);
const joinSnapshots = new Map<string, JoinSnapshot>();
const lastFeedState = new Map<string, Extract<FeedMsg, { type: 'feedState' }>>();

function snapshotFor(matchId: string): JoinSnapshot {
  let snap = joinSnapshots.get(matchId);
  if (!snap) {
    snap = { oddsHistory: [], eventHistory: [], pressureHistory: [], spellHistory: [] };
    joinSnapshots.set(matchId, snap);
  }
  return snap;
}

function rememberForJoin(matchId: string, msg: ServerMsg | FeedMsg): void {
  switch (msg.type) {
    case 'feedState':
      lastFeedState.set(matchId, msg);
      snapshotFor(matchId).feedState = msg;
      break;
    case 'odds': {
      const snap = snapshotFor(matchId);
      snap.odds = msg;
      // downsample a belief CURVE, stamping the current match minute onto each
      // kept tick (odds carry no minute of their own) so a join weaves the arc.
      const tMs = msg.tick.tMs;
      if (snap.lastOddsMs === undefined || tMs - snap.lastOddsMs >= ODDS_HISTORY_GAP_MS) {
        snap.lastOddsMs = tMs;
        const stamped = { ...msg, tick: { ...msg.tick, minute: snap.lastMinute ?? msg.tick.minute } };
        snap.oddsHistory.push(stamped);
        if (snap.oddsHistory.length > ODDS_HISTORY_MAX) snap.oddsHistory.splice(0, snap.oddsHistory.length - ODDS_HISTORY_MAX);
      }
      break;
    }
    case 'score': {
      const snap = snapshotFor(matchId);
      snap.score = msg;
      if (typeof msg.ev.minute === 'number') snap.lastMinute = msg.ev.minute;
      break;
    }
    case 'status': {
      const snap = snapshotFor(matchId);
      snap.status = msg;
      if (typeof msg.ev.minute === 'number') snap.lastMinute = msg.ev.minute;
      break;
    }
    case 'fixtureInfo':
      snapshotFor(matchId).fixtureInfo = msg;
      break;
    case 'lineup':
      snapshotFor(matchId).lineup = msg;
      break;
    case 'ledger': {
      if (msg.msg.type !== 'event') break; // amend/discard: the chalk-off rides the score, not a replay
      const snap = snapshotFor(matchId);
      const ev = msg.msg.ev;
      // ledger events carry a real match minute (danger/shots are frequent) —
      // advance the clock used to stamp buffered odds, so the belief CURVE gets
      // real minutes even when status is quiet + there are no goals.
      if (typeof ev.minute === 'number' && ev.minute >= (snap.lastMinute ?? 0)) snap.lastMinute = ev.minute;
      if (WOVEN_KINDS.has(ev.kind) || STAT_KINDS.has(ev.kind)) {
        snap.eventHistory.push(msg);
        if (snap.eventHistory.length > EVENT_HISTORY_MAX) snap.eventHistory.splice(0, snap.eventHistory.length - EVENT_HISTORY_MAX);
      } else if (ev.kind === 'danger') {
        // KEEP EVERY danger event — the stadium's attack/high-danger COUNT must be exact
        // on join (can't be thinned like a curve; the loom handles the full rate live anyway).
        snap.pressureHistory.push(msg);
        if (snap.pressureHistory.length > PRESSURE_HISTORY_MAX) snap.pressureHistory.splice(0, snap.pressureHistory.length - PRESSURE_HISTORY_MAX);
      }
      break;
    }
    case 'spell': {
      // EVERY possession spell — the client rebuilds possession% + territory from the full
      // sequence on join. Not thinned: a downsample would skew the time-share and PRESS sums.
      const snap = snapshotFor(matchId);
      snap.spellHistory.push(msg);
      if (snap.spellHistory.length > SPELL_HISTORY_MAX) snap.spellHistory.splice(0, snap.spellHistory.length - SPELL_HISTORY_MAX);
      break;
    }
    default:
      break; // stands/room/callReceipt are live-only, not part of the join catch-up
  }
}

/** Replay the cached match state to a freshly-seated socket (order: identity →
 * feed health → status/score → the tide → recent story). Only sends what exists. */
function replaySnapshot(ws: WebSocket, matchId: string): void {
  // the crowd's prediction so far — a joiner sees the consensus instantly.
  const match = registry.get(matchId);
  if (match && match.predictionCount() > 0) send(ws, match.consensus());
  const snap = joinSnapshots.get(matchId);
  if (!snap) return;
  if (snap.fixtureInfo) send(ws, snap.fixtureInfo);
  if (snap.lineup) send(ws, snap.lineup);   // who's playing — instantly, before any event
  if (snap.feedState) send(ws, snap.feedState);
  if (snap.status) send(ws, snap.status);
  if (snap.score) send(ws, snap.score);
  // THE WHOLE MATCH, downsampled, so the loom weaves the full cloth on join: the
  // belief arc + the pressure shape + every event. Events/pressure go out marked
  // `_replay` so the loom weaves historical goals WITHOUT re-firing their GOOOOL.
  for (const o of snap.oddsHistory) send(ws, o);
  for (const s of snap.spellHistory) sendReplay(ws, s);   // full possession sequence → exact possession% + territory
  for (const p of snap.pressureHistory) sendReplay(ws, p); // every danger → exact attack/high-danger counts
  for (const e of snap.eventHistory) sendReplay(ws, e);
  if (snap.odds) send(ws, snap.odds);
  // a mid-window joiner sees the open drama immediately, so they can still react.
  const activeMoment = match?.activeMomentSnapshot();
  if (activeMoment) {
    const openMsg: MomentOpenMsg = {
      type: 'moment',
      matchId,
      momentId: activeMoment.momentId,
      kind: activeMoment.kind,
      side: activeMoment.side,
      minute: activeMoment.minute,
      opensAtMs: activeMoment.openedMs,
      closesAtMs: activeMoment.openedMs + REACT_WINDOW_MS,
      palette: FEELING_PALETTES[activeMoment.kind],
    };
    send(ws, openMsg);
  }
}

const registry = new MatchRegistry(
  (matchId, msg) => broadcastToMatch(matchId, msg),
  {
    // Task 3: the felt-moment history lives on the SentimentAccumulator, which
    // this file owns (registry.ts doesn't know about sentiment at all) — so the
    // registry's snapshot read/write goes through these two hooks instead of
    // reaching into `accumulators` directly.
    get: (matchId) => accumulators.get(matchId)?.getMoments() ?? [],
    restore: (matchId, moments) => { getOrCreateAccumulator(matchId)?.restoreMoments(moments); },
  },
  {
    // Critical fix (post-mortem): resolvedMatches lives here (predictLifecycle
    // owns the FULL_TIME → resolve+crystallize+anchor guard) — registry.ts
    // doesn't know about crystallize/anchor at all, so snapshot persistence of
    // "already resolved" goes through these two hooks, same pattern as moments
    // above. `restore` runs during registry.loadSnapshot(), BEFORE index.ts
    // starts TXLINE/REPLAY ingest, so a restart can never re-fire a real
    // devnet anchor tx for a match that already resolved in a prior process.
    get: (matchId) => resolvedMatches.has(matchId),
    restore: (matchId) => { resolvedMatches.add(matchId); },
  },
  {
    // Post-mortem fix (fanStats review follow-up): openedTriggerIds lives here
    // (momentLifecycle owns the moment-open dedup) — registry.ts doesn't know
    // what a "trigger" is, so snapshot persistence of "already opened a moment
    // for this sourceId" goes through these two hooks, same pattern as
    // moments/resolved above. `restore` runs during registry.loadSnapshot(),
    // BEFORE index.ts starts TXLINE/REPLAY ingest, so a restart can never let
    // a re-dispatched historical trigger (live seedSnapshot replay, or a
    // REPLAY_FILE restart replaying from line 0) reopen an already-run drama
    // moment — the ghost-window bug this closes. `get` reads only (never
    // creates) — the periodic snapshot writer must not fabricate an empty Set
    // entry for a match that never actually opened a moment.
    get: (matchId) => Array.from(openedTriggerIds.get(matchId) ?? []),
    restore: (matchId, triggerIds) => {
      const seen = openedTriggersFor(matchId);
      for (const id of triggerIds) seen.add(id);
    },
  },
);

function isValidSide(v: unknown): v is Side {
  return v === 'home' || v === 'away';
}

function broadcastRoomState(matchId: string, roomId: string): void {
  if (DISABLE_ROOMS) return;
  const match = registry.get(matchId);
  const room = match?.rooms.get(roomId);
  if (!match || !room) return;
  const msg: RoomStateMsg = { type: 'room', roomId, members: room.toWireMembers() };
  broadcastToMatch(matchId, msg);
}

function handleHello(ws: WebSocket, state: ConnState, msg: Extract<ClientMsg, { type: 'hello' }>): void {
  const now = Date.now();
  state.helloTimestamps = state.helloTimestamps.filter((t) => now - t < HELLO_WINDOW_MS);
  if (state.helloTimestamps.length >= HELLO_MAX_PER_WINDOW) {
    console.warn(`[stands] hello flood from anonId=${msg.anonId?.slice(0, 8)}, dropping`);
    return;
  }
  state.helloTimestamps.push(now);

  if (!msg.matchId || !msg.anonId) return; // malformed, ignore

  // cap: 1 room (match) per connection — a hello for a NEW matchId on an
  // already-joined connection is rejected rather than silently re-homing it.
  if (state.matchId && state.matchId !== msg.matchId) {
    console.warn(`[stands] conn already in match=${state.matchId}, rejecting hello for ${msg.matchId}`);
    return;
  }

  const match = registry.getOrCreate(msg.matchId);

  // A hello IS crowd presence — even when the socket was already feed-seated by
  // ?matchId= at connect (that set state.matchId but no crowd identity). Without
  // this, URL-seated fans never become "present", so isActive()===false and the
  // 4 Hz tick never broadcasts stands/consensus (Jul 4 post-mortem).
  //
  // Presence is a refcount (anonId -> open-socket count), fixing a second
  // post-mortem: a ground visit opens several sockets for one fan (tabs/
  // iframes); closing just one used to erase the fan's presence entirely even
  // with others still open. Touch the refcount only when THIS socket's adopted
  // identity actually changes (first hello, or an anonId switch) — a re-hello
  // with the same anonId (side pick, room join) must not double-count, so that
  // handleClose's single markDisconnected call always undoes exactly what this
  // socket added.
  const prevAnonId = state.anonId;
  if (prevAnonId !== msg.anonId) {
    if (prevAnonId) match.markDisconnected(prevAnonId);
    match.markConnected(msg.anonId);
  }

  state.matchId = msg.matchId;
  state.anonId = msg.anonId;
  if (msg.side) {
    match.root(msg.anonId, msg.side);
    // THE FAN SERIAL (design/HANDOFF-2026-07-10-fan-serial.md, the
    // coordinator's accepted MARGIN amendment): mints on the first hello
    // that CARRIES A SIDE — side-less hellos (diagnostics, the write-proof
    // smoke canary) never reach this branch, so they structurally can never
    // claim a number; the same anonId re-helloing WITH a side later mints
    // normally right here. registry.fanNoFor is mint-if-absent / else-return
    // the SAME number forever, so this is safe to call on every hello, not
    // just the first — the welcome is resent per-fan (this socket) on every
    // side-carrying hello/reconnect, same number, forever.
    const fanNo = registry.fanNoFor(msg.anonId);
    const welcome: WelcomeMsg = { type: 'welcome', matchId: msg.matchId, anonId: msg.anonId, fanNo };
    send(ws, welcome);
  }

  const cachedFeedState = lastFeedState.get(msg.matchId);
  if (cachedFeedState) send(ws, cachedFeedState);

  // A fan's full-time verdict is personal (post-mortem #6: a fan who reloaded
  // after full time got nothing, because the FT send only reached THEN-
  // connected sockets). If this match has already resolved this fan's
  // prediction, replay it into THIS hello's catch-up bundle — tagged _replay
  // like the rest of the join bundle, and idempotent: a re-hello may receive
  // it again, the client tolerates a repeat reveal.
  const verdict = match.verdictFor(msg.anonId);
  if (verdict) sendReplay(ws, verdict);

  if (msg.roomId && !DISABLE_ROOMS) {
    const room = match.getOrCreateRoom(msg.roomId);
    const result = room.join({
      anonId: msg.anonId,
      name: msg.name ?? 'fan',
      side: msg.side ?? 'home',
      present: true,
      ws,
    });
    if (result === 'full') {
      // reject overflow gracefully: no membership change, no crash — the
      // client's own hello simply doesn't seat them; StandsState still flows.
      console.warn(`[stands] room ${msg.roomId} full, anonId=${msg.anonId.slice(0, 8)} not seated`);
    } else {
      broadcastRoomState(msg.matchId, msg.roomId);
    }
  }
}

/* ── cheer echo — a discrete per-cheer signal (post-mortem: a single remote
 * fan's cheer was invisible in the smoothed roar rate). Honest: emitted 1:1
 * with server-ACCEPTED cheer MESSAGES (post-throttle) — one echo per accepted
 * `cheer` packet, never per tap/token, and it carries no count. Capped so a
 * flood of accepted cheers can't turn this into its own firehose — the roar
 * rate remains the volume signal, this is only "someone out there just
 * cheered." Past the cap: silently drop the echo — never queued, never
 * synthesized. */
const CHEER_ECHO_CAP_PER_SEC = 15;
const cheerEchoCounters = new Map<string, RollingCounter>();
function emitCheerEcho(matchId: string, side: Side, nowMs: number): void {
  let counter = cheerEchoCounters.get(matchId);
  if (!counter) {
    counter = new RollingCounter(1000);
    cheerEchoCounters.set(matchId, counter);
  }
  if (counter.sum(nowMs) >= CHEER_ECHO_CAP_PER_SEC) return; // at cap — silent drop
  counter.add(1, nowMs);
  const echo: CheerEchoMsg = { type: 'cheerEcho', matchId, side, atMs: nowMs };
  broadcastToMatch(matchId, echo);
}

function handleCheer(state: ConnState, msg: Extract<ClientMsg, { type: 'cheer' }>): void {
  if (!state.matchId || !state.anonId || state.matchId !== msg.matchId) return;
  if (!isValidSide(msg.side) || typeof msg.n !== 'number') return;
  const now = Date.now();
  const match = registry.getOrCreate(msg.matchId);
  const granted = match.cheer(state.anonId, msg.side, msg.n, now);
  if (granted > 0) emitCheerEcho(msg.matchId, msg.side, now);
}

function handleReact(state: ConnState, msg: Extract<ClientMsg, { type: 'react' }>): void {
  if (DISABLE_PULSE) return;
  if (!state.matchId || !state.anonId || state.matchId !== msg.matchId) return;
  if (!isValidSide(msg.side)) return;
  const match = registry.getOrCreate(msg.matchId);
  match.react(state.anonId, msg.side, msg.kind);
}

function handleMomentReact(state: ConnState, msg: Extract<ClientMsg, { type: 'momentReact' }>): void {
  if (DISABLE_MOMENTS) return;
  if (!state.matchId || !state.anonId || state.matchId !== msg.matchId) return;
  if (!isValidSide(msg.side) || typeof msg.momentId !== 'string' || typeof msg.token !== 'string') return;
  const match = registry.get(msg.matchId);
  if (!match) return;
  // trust the connection's identity, not the message's anonId (mirrors handleReact).
  match.momentReact(state.anonId, msg.momentId, msg.side, msg.token);
  // no per-react broadcast — the reveal at window close carries the aggregate.
}

function handlePredict(state: ConnState, msg: Extract<ClientMsg, { type: 'predict' }>): void {
  if (!state.matchId || !state.anonId || state.matchId !== msg.matchId) return;
  const match = registry.getOrCreate(msg.matchId);
  if (!match.predict(state.anonId, msg.home, msg.away, msg.atMs)) return; // locked/invalid
  // predictions are sparse (pre-match) — broadcast the fresh consensus on change.
  broadcastToMatch(msg.matchId, match.consensus());
}

function isValidCall(msg: CallMsg): boolean {
  return (
    typeof msg.matchId === 'string' &&
    msg.matchId.length > 0 &&
    typeof msg.anonId === 'string' &&
    msg.anonId.length > 0 &&
    isValidSide(msg.side) &&
    typeof msg.claim === 'string' &&
    msg.claim.length > 0 &&
    (msg.minute === null || typeof msg.minute === 'number') &&
    typeof msg.marketP === 'object' &&
    msg.marketP !== null &&
    typeof msg.marketP.home === 'number' &&
    typeof msg.marketP.draw === 'number' &&
    typeof msg.marketP.away === 'number' &&
    typeof msg.atMs === 'number'
  );
}

async function handleCall(ws: WebSocket, state: ConnState, msg: Extract<ClientMsg, { type: 'call' }>): Promise<void> {
  if (!state.matchId || state.matchId !== msg.matchId) return;
  if (!isValidCall(msg)) {
    console.warn(`[stands] malformed call from anonId=${msg.anonId?.slice?.(0, 8)}, dropping`);
    return;
  }
  // NOTE: marketP re-verification against the live feed window (per the
  // contracts/crowd.ts doc comment) is not implemented yet — tracked as a
  // remaining TODO alongside the real relayer. Today this only checks shape.
  const txSig = await relayCall(msg);
  const receipt: CallReceiptMsg = {
    type: 'callReceipt',
    matchId: msg.matchId,
    anonId: msg.anonId,
    claim: msg.claim,
    minute: msg.minute,
    marketP: msg.marketP,
    txSig,
    atMs: Date.now(),
  };
  send(ws, receipt);
}

function handleClose(ws: WebSocket): void {
  const state = conns.get(ws);
  conns.delete(ws);
  if (!state?.matchId || !state.anonId) return;
  const match = registry.get(state.matchId);
  if (!match) return;
  // mirrors handleHello's single markConnected call for whichever anonId this
  // socket currently holds — a feed-only socket never adopted one (state.anonId
  // stays null, caught by the guard above) and so never counted, unchanged.
  match.markDisconnected(state.anonId);
  const found = match.findRoomOf(state.anonId);
  if (found) {
    found.room.setPresent(state.anonId, false);
    broadcastRoomState(state.matchId, found.roomId);
  }
}

/** One keepalive round (WS_HEARTBEAT_INTERVAL_MS doc above): terminate any
 * connection that hasn't proven itself alive (a pong) since the round
 * before this one, then arm every survivor for the NEXT round with a fresh
 * ping. ws.terminate() destroys the underlying socket, which still emits
 * 'close' exactly like a normal disconnect — handleClose is already wired to
 * that event in createStandsServer below, so a terminated connection's
 * presence decrement / session close runs through the SAME path a real
 * client-initiated close does, never a separate one. */
function heartbeatTick(): void {
  for (const [ws, state] of conns) {
    if (ws.readyState !== WebSocket.OPEN) continue; // already closing — its own 'close'/'error' listener will clean up
    if (!state.isAlive) {
      ws.terminate();
      continue;
    }
    state.isAlive = false;
    ws.ping();
  }
}

function handleMessage(ws: WebSocket, state: ConnState, raw: string): void {
  let msg: ClientMsg;
  try {
    msg = JSON.parse(raw) as ClientMsg;
  } catch {
    return; // not JSON, ignore
  }
  switch (msg.type) {
    case 'hello':
      return handleHello(ws, state, msg);
    case 'cheer':
      return handleCheer(state, msg);
    case 'react':
      return handleReact(state, msg);
    case 'momentReact':
      return handleMomentReact(state, msg);
    case 'call':
      void handleCall(ws, state, msg);
      return;
    case 'predict':
      return handlePredict(state, msg);
    default:
      return; // unknown type, ignore
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * SEAT — self-custodial fan identity + mint-to-fan relics (YOUR SEAT).
 * Reconciled from the your-seat worktree branch (18 commits, base c9ffc84)
 * onto this file's current shape — docs/HANDOFF-2026-07-10-coordinator-
 * session.md §5 has the reconciliation plan. /seat/* HTTP routes sit
 * ALONGSIDE the crowd WebSocket protocol above; wired into createStandsServer
 * below in one additive block. Nothing above this fence was touched to add
 * SEAT (only the import block, grouped and commented the same way).
 * ════════════════════════════════════════════════════════════════════════ */

/** The REAL current score for matchId, as of right now — read from the same join-snapshot cache
 * that catches up a freshly-joined socket (this module's own state; MatchState carries no score).
 * `{home:0,away:0}` when no score message has arrived yet — a real, true tally, not a fabrication.
 * `decided` is true only once FULL_TIME was genuinely observed (`resolvedMatches`, populated in
 * predictLifecycle off the real status feed) — never guessed. */
function currentScoreSnapshot(matchId: string): LiveScoreSnapshot {
  const ev = joinSnapshots.get(matchId)?.score?.ev;
  return { home: ev?.home ?? 0, away: ev?.away ?? 0, decided: resolvedMatches.has(matchId) };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** CORS for /seat/* — the browser calls these cross-origin (rooot.club / a localhost preview →
 * this fly.dev host), so every seat response needs the headers below, and the preflight OPTIONS
 * request needs an explicit 204. Devnet MVP with no cookies/credentials, so a `*` origin is fine —
 * deliberately NOT paired with Access-Control-Allow-Credentials. WS routes don't go through HTTP
 * CORS at all, so they're untouched. */
const SEAT_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function setSeatCorsHeaders(res: ServerResponse): void {
  for (const [name, value] of Object.entries(SEAT_CORS_HEADERS)) res.setHeader(name, value);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Resolve the side the fan actually rooted for into its team tricode (design/
 * HANDOFF-coordinator-data-wiring.md: profile.sides must be tricodes, e.g. ['SUI','ARG'], never
 * 'home'/'away' — the cabinet renders flag stickers from these). Null when the fan never rooted, or
 * the match has no known fixture identity — never guessed. */
function sideTricode(matchId: string, side: Side | null): string | null {
  if (!side) return null;
  const fx = fixtureInfo(matchId);
  if (!fx) return null;
  return side === 'home' ? fx.home.code : fx.away.code;
}

/** POST /seat/claim {anonId,pubkey,method,matchId?} -> {profile, mint:{asset,txUrl}|null}.
 * When matchId names a live match, bindClaim folds the fan's REAL rooted side + locked call into
 * the record (never inventing one), profile.sides is patched with the resolved TEAM TRICODE (not
 * 'home'/'away'), and — once the match has genuinely reached FULL_TIME — the scarf is minted owned
 * by pubkey into the ROOOT scarf collection (service pays, devnet only; see seat/mint-scarf.ts). A
 * claim before full time, or with no matchId (or an unknown one), is identity-only: still honest,
 * nothing to fold in, and no mint is attempted (`mint: null`). */
async function handleSeatClaim(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: any;
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    sendJson(res, 400, { error: 'invalid json' });
    return;
  }
  const { anonId, pubkey, method, matchId } = body ?? {};
  if (!isValidPubkey(pubkey)) {
    sendJson(res, 400, { error: 'invalid pubkey' });
    return;
  }
  try {
    const match = typeof matchId === 'string' ? registry.get(matchId) : undefined;
    const record = match
      ? bindClaim(match, anonId, pubkey, method, Date.now())
      : { pubkey, method, side: null, call: null, matchId: matchId ?? null, boundAtMs: Date.now() };
    const tricode = match ? sideTricode(match.matchId, record.side) : null;
    const profile = saveProfile(pubkey, { sides: tricode ? [tricode] : [], since: record.boundAtMs });
    // The scarf mints for a REAL, FULL-TIME match claim only (mint-scarf.ts's own honesty gate) —
    // identity-only and mid-match claims stay mint:null. Independently try/caught — even though
    // mintScarfForClaim itself never throws (it catches internally), this belt-and-suspenders guard
    // means a mint problem can NEVER turn an already-saved bind into a 500: the claim always
    // responds 200 with mint:null on any mint-side issue.
    let mint: ScarfMint | null = null;
    if (match) {
      try {
        const result = match.verdictFor(anonId)?.verdict ?? null;
        const fanNo = registry.fanNoFor(anonId);
        mint = await mintScarfForClaim(record, currentScoreSnapshot(match.matchId), { result, fanNo });
      } catch (err) {
        console.warn(`[seat] mint threw unexpectedly for ${pubkey.slice(0, 8)}: ${String(err)}`);
      }
    }
    sendJson(res, 200, { profile, mint });
  } catch (err) {
    console.warn(`[seat] claim failed for ${pubkey.slice(0, 8)}: ${String(err)}`);
    sendJson(res, 500, { error: 'claim failed' });
  }
}

/** GET /seat/album?pubkey= -> {scarves}. Devnet DAS lookup — returns real minted scarves, filtered
 * to the ROOOT scarf collection (mint/collection.ts resolves it from ROOOT_SCARF_COLLECTION or its
 * own on-disk cache — see seat/album.ts). Prefers HELIUS_RPC_URL (a DAS-capable RPC —
 * getAssetsByOwner is a Helius/DAS-indexer method, not part of plain Solana JSON-RPC) over the
 * plain devnet RPC the mint path uses; falls back to that if unset (go-live checklist item: pin
 * HELIUS_RPC_URL as a Fly secret — the public devnet RPC has no DAS index). */
async function handleSeatAlbum(pubkey: string | null, res: ServerResponse): Promise<void> {
  if (!pubkey || !isValidPubkey(pubkey)) {
    sendJson(res, 400, { error: 'invalid pubkey' });
    return;
  }
  try {
    const rpcUrl = process.env.HELIUS_RPC_URL || networkFor('devnet').rpcUrl;
    const scarves = await assetsByOwner(pubkey, rpcUrl);
    sendJson(res, 200, { scarves });
  } catch (err) {
    console.warn(`[seat] album fetch failed for ${pubkey.slice(0, 8)}: ${String(err)}`);
    sendJson(res, 502, { error: 'album fetch failed' });
  }
}

/** GET /seat/me?pubkey= -> {profile}. Flat-file read-back (seat/profile-store.ts), no DB. */
function handleSeatMe(pubkey: string | null, res: ServerResponse): void {
  if (!pubkey || !isValidPubkey(pubkey)) {
    sendJson(res, 400, { error: 'invalid pubkey' });
    return;
  }
  const profile = loadProfile(pubkey);
  sendJson(res, 200, { profile });
}
/* ════════════════════════ END SEAT function block ═══════════════════════ */

export function createStandsServer() {
  const httpServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      const body = JSON.stringify({
        uptime: Math.floor((Date.now() - START_MS) / 1000),
        matchesActive: registry.activeMatchCount(),
        clients: registry.totalClientCount(),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }
    // ── SEAT: /seat/* HTTP routes (comment-fenced, additive — see the SEAT
    // function block above). CORS + OPTIONS preflight apply to this whole
    // subtree; routing needs a parsed URL, which nothing above this point
    // required (the /health check above is a raw req.url compare, untouched). ──
    let seatUrl: URL;
    try {
      seatUrl = new URL(req.url ?? '/', 'http://x');
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    if (seatUrl.pathname.startsWith('/seat/')) {
      setSeatCorsHeaders(res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === 'POST' && seatUrl.pathname === '/seat/claim') {
        void handleSeatClaim(req, res);
        return;
      }
      if (req.method === 'GET' && seatUrl.pathname === '/seat/album') {
        void handleSeatAlbum(seatUrl.searchParams.get('pubkey'), res);
        return;
      }
      if (req.method === 'GET' && seatUrl.pathname === '/seat/me') {
        handleSeatMe(seatUrl.searchParams.get('pubkey'), res);
        return;
      }
    }
    // ── END SEAT routes ──────────────────────────────────────────────────
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws: WebSocket, req) => {
    const state: ConnState = { ws, matchId: null, anonId: null, helloTimestamps: [], isAlive: true };
    // FEED SEATING BY URL (caught live at CAN-MAR, Jul 4): broadcastToMatch
    // filters on state.matchId, which only hello set — so a feed-only client
    // (LiveSource watches; it has no crowd identity to hello with) received
    // NOTHING. Watching the match is public: seat the socket into its match
    // from ?matchId= at connect. hello still owns crowd identity/actions,
    // and the 1-match-per-connection cap still holds (hello for a DIFFERENT
    // match on a URL-seated conn is rejected by handleHello as before).
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const mid = url.searchParams.get('matchId');
      if (mid) {
        state.matchId = mid;
        // catch a mid-match joiner up to the live state immediately (phase,
        // score, tide, recent story) — not just feed health.
        replaySnapshot(ws, mid);
      }
    } catch {
      // unparseable URL — stay unseated; hello can still seat this conn
    }
    conns.set(ws, state);
    ws.on('message', (data) => handleMessage(ws, state, data.toString()));
    ws.on('close', () => handleClose(ws));
    ws.on('error', () => handleClose(ws));
    ws.on('pong', () => {
      state.isAlive = true; // proof of life for heartbeatTick, below
    });
  });

  const heartbeatTimer = setInterval(heartbeatTick, WS_HEARTBEAT_INTERVAL_MS);

  registry.loadSnapshot();
  registry.start();

  httpServer.on('close', () => {
    registry.stop();
    clearInterval(heartbeatTimer);
  });

  return { httpServer, wss, registry, port: PORT, broadcastToMatch };
}
