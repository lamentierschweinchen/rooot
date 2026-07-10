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
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import type { CallMsg, CallReceiptMsg, CheerEchoMsg, ClientMsg, MomentKind, MomentOpenMsg, MomentResultMsg, RoomStateMsg, ServerMsg, Side } from '@contracts/crowd';
import { FEELING_PALETTES } from '@contracts/crowd';
import type { FeedMsg } from '@contracts/feed';
import { REACT_WINDOW_MS, RollingCounter, SWING_DELTA_MIN } from './decay';
import { MatchRegistry } from './registry';
import { anchorRecordHash, relayCall } from './relay';
import { DATA_DIR, writeFileAtomic } from './snapshot';
import { SentimentAccumulator } from './sentiment/accumulator';
import { fixtureInfo } from './sentiment/teams';

const PORT = Number(process.env.PORT ?? 8787);
const DISABLE_PULSE = process.env.DISABLE_PULSE === '1';
const DISABLE_ROOMS = process.env.DISABLE_ROOMS === '1';
/** Kill switch for REACT drama windows (docs/MECHANISMS.md §4) — momentReact
 * handling + auto window open/close both stop; hello/cheer/predict/call stay. */
const DISABLE_MOMENTS = process.env.DISABLE_MOMENTS === '1';

/** Rate-limit hello floods: max hellos per connection per window. */
const HELLO_MAX_PER_WINDOW = 5;
const HELLO_WINDOW_MS = 10_000;

const START_MS = Date.now();

interface ConnState {
  ws: WebSocket;
  matchId: string | null;
  anonId: string | null;
  helloTimestamps: number[];
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

/** Broadcast to every connection currently in matchId's room. */
function broadcastToMatch(matchId: string, msg: ServerMsg | FeedMsg): void {
  const stamped = withMatchId(matchId, msg);
  const payload = JSON.stringify(stamped);
  for (const [ws, state] of conns) {
    if (state.matchId === matchId && ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
  rememberForJoin(matchId, stamped); // snapshot the match state for mid-match joiners
  feedSentiment(matchId, stamped); // accumulate the sentiment record (docs/SENTIMENT.md)
  predictLifecycle(matchId, stamped); // lock at KO, resolve at FT (docs/MECHANISMS.md §2)
  // REACT drama windows (docs/MECHANISMS.md §4) — isolated: this new layer must
  // NEVER be able to break the core crowd/feed broadcast above.
  try {
    momentLifecycle(matchId, stamped);
  } catch (err) {
    console.warn(`[moment] lifecycle error on ${matchId}: ${String(err)}`);
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
      crystallizeSentiment(matchId, match); // the record — persist + emit (docs/SENTIMENT.md)
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
        console.warn(`[stands] immediate post-FT snapshot failed for ${matchId}: ${String(err)}`);
      }
    }
  }
}

/* ── REACT / the Pulse — drama moments (docs/MECHANISMS.md §4) ─────────── */
/** per-match close timer for the one open window. */
const openMomentTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** last de-vigged triple per match — the baseline for swing detection. */
const lastTriple = new Map<string, { home: number; draw: number; away: number }>();
/** trigger sources already turned into a moment (a goal re-emits as it upgrades;
 * full-time can repeat) — dedupe so one drama opens exactly one window. */
const openedTriggerIds = new Map<string, Set<string>>();

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
    const prev = lastTriple.get(matchId);
    lastTriple.set(matchId, cur);
    if (!prev) return null;
    const dH = Math.abs(cur.home - prev.home);
    const dD = Math.abs(cur.draw - prev.draw);
    const dA = Math.abs(cur.away - prev.away);
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
  const match = registry.get(matchId);
  if (!match) return;

  if (trig.sourceId) {
    let seen = openedTriggerIds.get(matchId);
    if (!seen) {
      seen = new Set();
      openedTriggerIds.set(matchId, seen);
    }
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
      console.warn(`[moment] close error on ${matchId}: ${String(err)}`);
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
function crystallizeSentiment(matchId: string, match: ReturnType<MatchRegistry['get']>): void {
  const acc = accumulators.get(matchId);
  if (!acc || !match) return;
  try {
    const record = acc.crystallize(
      { consensus: match.consensus(), rooted: match.counts() },
      { serial: 1, editionSize: null, caption: matchId },
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
    console.warn(`[sentiment] crystallize failed for ${matchId}: ${String(err)}`);
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
  if (msg.side) match.root(msg.anonId, msg.side);

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
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws: WebSocket, req) => {
    const state: ConnState = { ws, matchId: null, anonId: null, helloTimestamps: [] };
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
  });

  registry.loadSnapshot();
  registry.start();

  httpServer.on('close', () => registry.stop());

  return { httpServer, wss, registry, port: PORT, broadcastToMatch };
}
