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
import { createServer, get as httpGet } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import type { CallMsg, CallReceiptMsg, CheerEchoMsg, ClientMsg, MomentKind, MomentOpenMsg, MomentResultMsg, RoomStateMsg, SeatTokenGrantMsg, ServerMsg, Side, WelcomeMsg } from '@contracts/crowd';
import { FEELING_PALETTES } from '@contracts/crowd';
import type { FeedMsg } from '@contracts/feed';
import type { LedgerEvent } from '@contracts/ledger';
import type { Fixture, MatchPhase } from '@contracts/match';
import type { FanbaseSentiment, SentimentRecord } from '@contracts/sentiment';
import { REACT_WINDOW_MS, RollingCounter, SWING_DELTA_MIN, SWING_WINDOW_MS } from './decay';
import { fetchProvenanceRefs } from './ingest/txline';
import { SettledScore } from './match-state';
import { MatchRegistry } from './registry';
import { anchorRecordHash, relayCall } from './relay';
import { DATA_DIR, writeFileAtomic } from './snapshot';
import { SentimentAccumulator } from './sentiment/accumulator';
import { foldFingerprints } from './sentiment/builder';
import { fixtureInfo } from './sentiment/teams';
// ── SEAT: self-custodial fan identity + mint-to-fan relics (YOUR SEAT) ─────
// Reconciled from the your-seat worktree branch onto this file's current shape —
// archive/docs-consumed/docs/HANDOFF-2026-07-10-coordinator-session.md §5. Imports grouped here so the
// whole SEAT surface (imports + the function block below + the route wiring
// inside createStandsServer) is easy to lift as one unit.
import { networkFor } from './mint/config';
import type { LiveScoreSnapshot } from './mint/relic-from-match';
import { assetsByOwner } from './seat/album';
import { bindClaim } from './seat/claim';
import { mintScarfForClaim, type ScarfMint } from './seat/mint-scarf';
import { assembleClothRecord } from './mint/assemble-cloth';
import type { ClothRecord } from './mint/scarf-capture';
import { loadProfile, saveProfile } from './seat/profile-store';
import { isValidPubkey } from './seat/validate';

const PORT = Number(process.env.PORT ?? 8787);
const DISABLE_PULSE = process.env.DISABLE_PULSE === '1';
const DISABLE_ROOMS = process.env.DISABLE_ROOMS === '1';
/** Kill switch for REACT drama windows (docs/MECHANISMS.md §4) — momentReact
 * handling + auto window open/close both stop; hello/cheer/predict/call stay. */
const DISABLE_MOMENTS = process.env.DISABLE_MOMENTS === '1';
/** Kill switch for NEXT GOAL in-game calls (docs/BACKLOG-full-version-and-
 * deferred-ideas.md §2) — handling + resolution both stop; every other
 * mechanism (hello/cheer/predict/call/moments) stays live. */
const DISABLE_NEXT_GOAL = process.env.DISABLE_NEXT_GOAL === '1';

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

/** The honest displayed scoreline per match (services/stands/src/match-state.ts
 * SettledScore). The score channel is stateless — every wire message reports its
 * own Total.Goals — so this reduces it to the ONE scoreline the fan is shown.
 * Memory-only and rebuilt from the resuming feed after a restart (Total.Goals is
 * absolute, so the next settled score re-establishes it); cleared on eviction. */
const settledScores = new Map<string, SettledScore>();
function settledScoreFor(matchId: string): SettledScore {
  let s = settledScores.get(matchId);
  if (!s) {
    s = new SettledScore();
    settledScores.set(matchId, s);
  }
  return s;
}

/** Broadcast to every connection currently in matchId's room. */
function broadcastToMatch(matchId: string, msg: ServerMsg | FeedMsg): void {
  // Keep this match's eviction clock warm: every feed message AND every 4 Hz
  // stands tick flows through here, so a match stops being "quiet" exactly
  // when its wire falls silent AND its last client leaves (a client-less match
  // never ticks — registry.tick skips idle matches — so ticks can't falsely
  // keep a dead match alive). The memory-eviction sweep measures quiet time
  // against this stamp. One Map.set; never throws.
  registry.noteActivity(matchId);
  // SETTLED SCORE (honesty law #1 — never render a goal that didn't stand):
  // reduce the stateless score channel at this one fan-out chokepoint so the
  // scoreline EVERY downstream consumer sees — live fan-out, the join cache
  // (rememberForJoin → snap.score), the sentiment accumulator (feedSentiment),
  // the FULL_TIME final score (predictLifecycle reads snap.score) — only ever
  // advances or reverts on a SETTLED score. A provisional (unconfirmed) goal,
  // or a settled score identical to the one already shown, moves nothing: we
  // DROP it here, so the big number simply holds while the moment / ledger
  // 'possible' path (its own FeedMsg, never dropped) carries the suspense.
  // FRA–ESP Jul 14: the offside 0–3 (seq638 goal/Confirmed:false) is held; the
  // correction (seq642 action_discarded/0–2) keeps 0–2 — the app never shows 0–3.
  if (msg.type === 'score') {
    const line = settledScoreFor(matchId).apply(msg.ev);
    if (!line) return;
    if (msg.ev.home !== line.home || msg.ev.away !== line.away) {
      msg = { ...msg, ev: { ...msg.ev, home: line.home, away: line.away } };
    }
  }
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
  // NEXT GOAL (in-game, docs/BACKLOG-full-version-and-deferred-ideas.md §2) —
  // isolated the same way as every side-effect here: a fault must never
  // prevent the core broadcast, nor be caused by one of the others. MUST run
  // BEFORE predictLifecycle: at FULL_TIME predictLifecycle crystallizes the
  // SentimentRecord, and the FT resolution row this layer appends into the
  // accumulator (the record's nextGoal layer) has to be there by then — after,
  // and the record would silently lose its final cycle.
  try {
    nextGoalLifecycle(matchId, stamped);
  } catch (err) {
    console.warn(`[nextGoal] lifecycle error on ${matchId}: ${errDetail(err)}`);
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
/** The RESOLUTION-TIME final score per resolved match — the very fh/fa
 * predictLifecycle grades verdicts with, captured at the instant
 * resolvedMatches flips and persisted alongside it (snapshot v6, via the
 * registry's finalScore hooks below). Review merge-gate fix: the resolved
 * flag restored across a restart but the score lived only in the memory-only
 * join-snapshot cache, so a fan's FIRST post-restart claim on an
 * already-resolved match minted a false "Full-time 0–0" scarf that
 * contradicted its own restored verdict attribute. A resolved match with no
 * entry here and no live-cached score now REFUSES to mint
 * (currentScoreSnapshot in the SEAT fence) rather than fabricating a score. */
const finalScores = new Map<string, { home: number; away: number }>();

/* ── THE SEAL (Codex pre-match review, findings 1+3) ──────────────────────
 * The crystallize one-shot, decoupled from the FULL_TIME dispatch tick.
 * predictLifecycle resolves verdicts synchronously at the whistle but only
 * REGISTERS the seal here; the actual crystallize fires once every open
 * reaction window has closed (the FULL_TIME moment opens in the SAME dispatch
 * pass, after predictLifecycle — sealing immediately would lock its reactions
 * out of the record forever), retries a failed crystallize with bounded
 * backoff, and only forgets the match once the record provably exists on
 * disk. Single-flight per match; timers unref'd so a pending seal never by
 * itself holds the process open. */
const pendingSeals = new Map<string, { final: { home: number; away: number }; attempts: number; deferrals: number }>();
const SEAL_POLL_MS = 3_000; // re-check cadence while a reaction window is open
const SEAL_MAX_DEFER_MS = 90_000; // ceiling on waiting for windows (defensive — REACT_WINDOW_MS is 25s)
// crystallize-failure backoff (Codex audit, finding 2: the old three-step
// ladder gave up after ~42s, so a minute of volume trouble ended the night
// with no record and nobody awake to restart). Now it keeps trying across
// ~9 minutes — comfortably inside the 15-minute post-full-time eviction
// grace, and the restore-recovery seal on the next boot (the cutover deploy
// restarts the process after every whistle) remains the backstop beyond that.
const SEAL_RETRY_MS = [2_000, 10_000, 30_000, 60_000, 120_000, 300_000];

function scheduleSeal(matchId: string, final: { home: number; away: number }, why: string): void {
  if (pendingSeals.has(matchId)) return; // single-flight — one seal per match
  // NOTE: no disk pre-check here on purpose. crystallizeSentiment owns the
  // durable idempotency (its on-disk guard logs the skip and returns success),
  // and short-circuiting ahead of it silently swallowed that line — which is
  // the one an operator (and the eviction check) reads to tell "already sealed,
  // correctly declined" apart from "never sealed at all". One owner, one log.
  pendingSeals.set(matchId, { final, attempts: 0, deferrals: 0 });
  console.log(`[sentiment] ${matchId} seal pending (${why}) — crystallize fires once reaction windows close`);
  const tick = (): void => {
    const pending = pendingSeals.get(matchId);
    if (!pending) return;
    const match = registry.getOrCreate(matchId);
    // wait (bounded) for any OPEN reaction window — the full-time moment must
    // be inside the record, and a stoppage-drama window deserves the same.
    if (match.activeMomentId() && pending.deferrals * SEAL_POLL_MS < SEAL_MAX_DEFER_MS) {
      pending.deferrals += 1;
      const t = setTimeout(tick, SEAL_POLL_MS);
      (t as { unref?: () => void }).unref?.();
      return;
    }
    void (async () => {
      const sealed = await crystallizeSentiment(matchId, match, pending.final);
      if (sealed) {
        pendingSeals.delete(matchId);
        // restore-recovery path arrives here with the flag deliberately
        // withheld — set it now that the record is real (Set.add is a no-op
        // on the live path, which already added it at FULL_TIME), and
        // persist promptly rather than waiting for the periodic timer.
        resolvedMatches.add(matchId);
        try {
          registry.snapshotNow();
        } catch (err) {
          console.warn(`[stands] post-seal snapshot failed for ${matchId}: ${errDetail(err)}`);
        }
        return;
      }
      const backoff = SEAL_RETRY_MS[pending.attempts];
      pending.attempts += 1;
      if (backoff === undefined) {
        pendingSeals.delete(matchId);
        console.error(
          `[sentiment] ${matchId} seal FAILED after ${pending.attempts} attempts — record NOT on disk. finalScore is persisted and the resolved flag will be withheld on restore, so restarting the process retries the seal (restore-recovery).`,
        );
        return;
      }
      console.warn(`[sentiment] ${matchId} seal attempt ${pending.attempts} failed — retrying in ${Math.round(backoff / 1000)}s`);
      const t = setTimeout(tick, backoff);
      (t as { unref?: () => void }).unref?.();
    })();
  };
  const t = setTimeout(tick, SEAL_POLL_MS);
  (t as { unref?: () => void }).unref?.();
}

/** The final score this process can HONESTLY name for a match at full time,
 * or null when it genuinely does not know (Codex pre-match audit, finding 1).
 * Order of truth: the live-cached score message (a real goal/penalty/
 * correction on the wire) → else 0–0, but ONLY with the accumulator's positive
 * evidence that we listened from kickoff (watchedFromKickoff), which is what
 * makes silence mean "goalless" rather than "we weren't there". Null is the
 * honest third answer, and callers must wait rather than invent. */
function knownFinalScore(matchId: string): { home: number; away: number } | null {
  const ev = joinSnapshots.get(matchId)?.score?.ev;
  if (ev && typeof ev.home === 'number' && typeof ev.away === 'number') return { home: ev.home, away: ev.away };
  // the match's OWN sealed record, if one is already on the volume: written at
  // the real whistle by this service, it is authoritative — and it is exactly
  // what an evicted-then-redelivered FULL_TIME has to work from (eviction
  // clears the live cache and the accumulator, so without this the process
  // would poll for a score it already wrote down). crystallizeSentiment's
  // disk-exists guard then makes the re-entry a clean no-op.
  const disk = latestSentimentRecordOnDisk(matchId);
  if (disk && typeof disk.finalScore?.home === 'number' && typeof disk.finalScore?.away === 'number') {
    return { home: disk.finalScore.home, away: disk.finalScore.away };
  }
  if (accumulators.get(matchId)?.watchedFromKickoff()) {
    console.warn(`[predict] ${matchId} reached FULL_TIME with no score message all match — settling 0–0 (goalless wire, watched from kickoff)`);
    return { home: 0, away: 0 };
  }
  return null;
}

/** Full time arrived but the score is genuinely unknown (a late-joined
 * process — see knownFinalScore). Keep looking: a snapshot seed landing late,
 * a correction, or a redelivered goal all populate the cache, and the moment
 * one does we run the real resolution. Single-flight, unref'd, bounded at
 * ~10 minutes — after which the match stays UNRESOLVED (no verdicts, no
 * record) rather than carrying a fabricated score. That is the honest
 * failure: a missing record is recoverable by an operator; an anchored lie
 * is not. */
const pendingScoreRechecks = new Set<string>();
const SCORE_RECHECK_MS = 10_000;
const SCORE_RECHECK_TRIES = 60;
function scheduleScoreRecheck(matchId: string): void {
  if (pendingScoreRechecks.has(matchId)) return;
  pendingScoreRechecks.add(matchId);
  console.error(
    `[predict] ${matchId} FULL_TIME with NO usable final score (no score message cached, and this process did not watch from kickoff — likely a restart whose snapshot seeding missed) — REFUSING to fabricate 0–0; re-checking every ${SCORE_RECHECK_MS / 1000}s for the real score`,
  );
  let tries = 0;
  const tick = (): void => {
    if (!pendingScoreRechecks.has(matchId)) return;
    if (resolvedMatches.has(matchId)) { pendingScoreRechecks.delete(matchId); return; } // a redelivered FULL_TIME got there first
    const known = knownFinalScore(matchId);
    if (known) {
      pendingScoreRechecks.delete(matchId);
      console.log(`[predict] ${matchId} the real final score arrived (${known.home}–${known.away}) — resolving + sealing now`);
      finalizeFullTime(matchId, registry.getOrCreate(matchId), known.home, known.away);
      return;
    }
    tries += 1;
    if (tries >= SCORE_RECHECK_TRIES) {
      pendingScoreRechecks.delete(matchId);
      console.error(`[predict] ${matchId} still no final score after ${Math.round((SCORE_RECHECK_TRIES * SCORE_RECHECK_MS) / 60000)} min — leaving the match UNRESOLVED (operator action required). No verdicts, no record, and nothing invented.`);
      return;
    }
    const t = setTimeout(tick, SCORE_RECHECK_MS);
    (t as { unref?: () => void }).unref?.();
  };
  const t = setTimeout(tick, SCORE_RECHECK_MS);
  (t as { unref?: () => void }).unref?.();
}

function predictLifecycle(matchId: string, msg: ServerMsg | FeedMsg): void {
  if (msg.type !== 'status') return;
  const phase = msg.ev.phase;
  // getOrCreate, NOT get (Codex pre-match review, finding 9): the FULL_TIME
  // seal is a property of the FEED — contracts/sentiment.ts requires a match
  // with ZERO fans to still crystallize its (empty-crowd) record, and `.get()`
  // here silently skipped the entire resolve+seal for a fan-less match. Same
  // reasoning momentLifecycle already documents for its own getOrCreate.
  const match = registry.getOrCreate(matchId);
  if (phase === 'FIRST_HALF' && !match.predictionsLocked()) {
    match.lockPredictions();
    broadcastToMatch(matchId, match.consensus()); // clients flip to the locked view
  }
  if (phase === 'FULL_TIME' && !resolvedMatches.has(matchId)) {
    const known = knownFinalScore(matchId);
    if (!known) {
      // Codex pre-match AUDIT, finding 1 — the honesty law, restated: an
      // absent cached score is NOT evidence of 0–0. The score channel is
      // edge-triggered, so silence means either "goalless, and we heard the
      // whole match" or "we joined late and never heard the goals" (a restart
      // whose snapshot seeding failed). Fabricating 0–0 in the second case
      // would grade every prediction against a score that never happened and
      // anchor that lie forever — strictly worse than waiting. So: refuse,
      // and keep looking for the real score (a late seed, a correction, a
      // redelivered goal all still land here). resolvedMatches is deliberately
      // NOT set, so a redelivered FULL_TIME re-enters this path for free.
      scheduleScoreRecheck(matchId);
      return;
    }
    finalizeFullTime(matchId, match, known.home, known.away);
  }
}

/** The full-time resolution itself, once the final score is genuinely known:
 * arm the resolved guard, capture the resolution-time score, deliver personal
 * verdicts, register the seal, and persist immediately. Extracted from
 * predictLifecycle (Codex audit, finding 1) so the score-recheck path can run
 * the IDENTICAL resolution when a late score finally arrives — one code path,
 * never a second half-copy that drifts. */
function finalizeFullTime(matchId: string, match: ReturnType<MatchRegistry['getOrCreate']>, fh: number, fa: number): void {
  {
      resolvedMatches.add(matchId);
      // capture the SAME final score the verdicts below are graded with — it
      // rides the immediate post-FT snapshot (finalScore hooks) so a restarted
      // process's scarf mints can never contradict the restored verdicts.
      finalScores.set(matchId, { home: fh, away: fa });
      // per-fan delivery, not a match broadcast — a verdict is personal
      // (Task 4 point 2: confirmed sendToAnon already scopes to this anonId's
      // own sockets only). Late joiners/reconnects get theirs via handleHello's
      // verdictFor(anonId) replay instead of a resend here.
      for (const v of match.resolvePredictions(fh, fa)) sendToAnon(matchId, v.anonId, v);
      // pass the SAME known-good final score used above to resolve verdicts
      // (fh/fa, sourced from joinSnapshots' cached score — proven reliable,
      // it's what the resolved-verdict path already depends on) straight into
      // the seal, rather than trusting the accumulator's OWN independently-
      // tracked `this.final` (fed by a separate 'score' case in
      // accumulator.ts's onFeed). Folded fix: the crystallized record's
      // finalScore came out empty despite the match reaching FT 2-1 on the
      // wire — two parallel trackers of "the final score" can drift; this
      // collapses onto the one already proven correct.
      //
      // Codex pre-match review, findings 1+3: crystallize is NO LONGER fired
      // here. Verdicts stay in this sync tick (personal, at the whistle), but
      // the record itself seals via scheduleSeal — which waits for open
      // reaction windows to close (the FULL_TIME moment opens ~this same
      // dispatch pass, AFTER this function; sealing now would lock its
      // reactions out of the record forever), retries a failed crystallize
      // with backoff, and only forgets the match once the record provably
      // exists on disk. The immediate snapshotNow below stays in this tick
      // (TESTED invariant — verdict-replay-check.ts asserts a snapshot on
      // disk by the time this function returns, Fix 1/review I1); the crash
      // window between it and the delayed seal is closed by the persisted
      // finalScore-without-record marker (the `resolved` restore hook below
      // withholds the flag AND schedules a restore-recovery seal).
      scheduleSeal(matchId, { home: fh, away: fa }, 'full-time'); // the record — persist + emit (docs/SENTIMENT.md)
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
        // Honesty (docs/POSTMORTEM-2026-07-14-live.md): a goal arrives
        // Confirmed:false first (provisional — can still be VAR-overturned and
        // discarded, exactly as tonight's Id570 was, 26s later) then
        // Confirmed:true once settled. Only a SETTLED goal opens a
        // celebration window — never celebrate a goal that hasn't stood.
        // Proven against the captured feed: gating here means Id570 (which
        // never reached Confirmed:true — it went straight to
        // action_discarded) never opens a moment at all, while Id551 (the
        // real goal) opens exactly once, off its Confirmed:true sighting.
        if (ev.confirmed !== true) return null;
        return { kind: 'goal', side: ev.side, minute: ev.minute, hard: true, sourceId: ev.id };
      case 'possible':
        // SOFT, not hard: "the held breath" is real drama but it is frequent
        // and mostly resolves to nothing (tonight: ~16 across the match, for
        // one real goal). Hard meant every one of these could supersede —
        // and cut short — an actually-open goal/red/var/penalty window. Soft
        // means it never interrupts a real moment and still respects the
        // cooldown, so the flood can no longer crowd out the moments fans
        // actually want to react to (docs/POSTMORTEM-2026-07-14-live.md).
        return { kind: 'possible', side: ev.side, minute: ev.minute, hard: false, sourceId: ev.id };
      case 'red-card':
        // side was hardcoded null — the wire's Participant (ev.side) is
        // already parsed above and was simply never read here, so a red
        // card opened a window with no team attached.
        return { kind: 'red', side: ev.side, minute: ev.minute, hard: true, sourceId: ev.id };
      case 'var':
        return { kind: 'var', side: null, minute: ev.minute, hard: true, sourceId: ev.id };
      case 'penalty-kick':
        // Never wired at all — 'penalty' already had a palette
        // (contracts/crowd.ts FEELING_PALETTES) and a client title
        // (terrace.html MOMENT_TITLE) but no trigger path ever produced one,
        // so a real in-game or shootout penalty could never open a window —
        // one of the task's required minimum kinds.
        return { kind: 'penalty', side: ev.side, minute: ev.minute, hard: true, sourceId: ev.id };
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

/** True if a crystallized sentiment record for this match is already on the
 * volume (the durable dedup for C1 — see the guard in crystallizeSentiment).
 * Matches the `${matchId}-<timestamp>.json` naming written below; the trailing
 * `-` in the prefix prevents a shorter id from matching a longer one's file.
 * readdirSync on a small per-match dir is cheap and only runs once per
 * FULL_TIME. Absent/unreadable dir ⇒ nothing crystallized yet (false), never
 * throws into the FT branch. */
function sentimentRecordExistsOnDisk(matchId: string): boolean {
  const prefix = `${matchId}-`;
  try {
    return readdirSync(path.join(DATA_DIR, 'sentiment')).some((f) => f.startsWith(prefix) && f.endsWith('.json'));
  } catch {
    return false;
  }
}

/** The newest crystallized sentiment record for matchId, read straight off the
 * volume (DATA_DIR/sentiment/<matchId>-<timestamp>.json) — the fix for a fan
 * who joins AFTER full time (post-mortem: replaySnapshot replayed
 * oddsHistory/eventHistory/status/score/etc from the joinSnapshots cache but
 * never checked whether the match had already crystallized, so a post-FT
 * joiner's room stayed "LIVE" forever with no verdict card, no Collect).
 * DISK, not memory: joinSnapshots/resolvedMatches are cleared by eviction
 * (registry.sweepEvictions) and don't survive a restart either, but a fan can
 * join hours later against a cold process — the record FILE is the one truth
 * that outlives both, same reasoning as sentimentRecordExistsOnDisk's own
 * on-disk C1 guard just above. Sorts defensively by the numeric `-<timestamp>`
 * suffix and returns the newest (today's dedup keeps exactly one file per
 * match, but never trust that blindly). Deliberately UNCACHED: writeAnchorSig
 * can rewrite this SAME file later (filling in anchorTxSig once the on-chain
 * anchor lands), and joins are rare enough that a fresh read every time is the
 * honest choice over a cache that could hand a joiner a stale
 * anchorTxSig:null. Absent dir / no match / unreadable / bad JSON ⇒ null —
 * NEVER fabricates a record; a genuinely unresolved match stays live-looking. */
function latestSentimentRecordOnDisk(matchId: string): SentimentRecord | null {
  const dir = path.join(DATA_DIR, 'sentiment');
  const prefix = `${matchId}-`;
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  } catch {
    return null; // no sentiment dir yet (or unreadable) — nothing crystallized
  }
  if (files.length === 0) return null;
  // newest by the timestamp suffix (readdir order is not guaranteed to be
  // chronological) — defensive even though the C1 dedup keeps exactly one.
  files.sort((a, b) => {
    const ta = Number(a.slice(prefix.length, -'.json'.length));
    const tb = Number(b.slice(prefix.length, -'.json'.length));
    return tb - ta;
  });
  try {
    return JSON.parse(readFileSync(path.join(dir, files[0]!), 'utf8')) as SentimentRecord;
  } catch (err) {
    console.warn(`[sentiment] join replay: unreadable record for ${matchId} (${files[0]}): ${errDetail(err)}`);
    return null;
  }
}

/**
 * Merge a freshly-earned anchor signature into the ON-DISK sentiment record
 * without clobbering any concurrent update: re-read the file, set ONLY
 * provenance.anchorTxSig (never re-serialize a possibly-stale in-memory copy),
 * write it back atomically, and re-emit. Shared by the live anchor path (the
 * .then in crystallizeSentiment) and the durable backfill sweep (backfillAnchors
 * below) — the re-read is exactly what makes it safe to call LATE, from either.
 * Returns true iff it wrote (record found, parseable, provenance present, sig
 * was still absent). Idempotent: a record that already carries a sig is left
 * untouched (returns false), so two racing fills can't double-write and a
 * re-anchor of an already-filled record is a no-op. Best-effort: any fs/parse
 * fault logs and returns false, never throws into a timer or promise chain.
 */
function writeAnchorSig(filePath: string, matchId: string, sig: string): boolean {
  try {
    const rec = JSON.parse(readFileSync(filePath, 'utf8')) as SentimentRecord;
    if (!rec.provenance) return false;
    if (rec.provenance.anchorTxSig) return false; // already anchored — never clobber
    rec.provenance.anchorTxSig = sig;
    writeFileAtomic(filePath, JSON.stringify(rec, null, 2));
    broadcastToMatch(matchId, { type: 'sentiment', record: rec } as unknown as ServerMsg);
    return true;
  } catch (err) {
    console.warn(`[sentiment] anchor sig write-back failed for ${matchId} (${path.basename(filePath)}): ${errDetail(err)}`);
    return false;
  }
}

/** Full-time crystallization, persisted on the SAME durable dir the restart
 * snapshot uses (Task 3 — volume-ready: /data on Fly when the volume is
 * mounted, /tmp otherwise). One timestamped file per crystallization — never
 * overwritten by a later match — except the async anchor-tx-sig fill-in
 * below, which updates THIS SAME file (it's the same crystallization event,
 * just completing its on-chain anchor a little later). Idempotent across
 * eviction + restart via the on-disk guard at the top (review C1).
 *
 * ASYNC (docs/DATA-ARCHITECTURE.md §4 item 2 — relic provenance): fetches
 * this match's TxLINE validation refs BEFORE building the record, because
 * SentimentRecord.provenance.txlineRefs is part of what recordHash covers
 * (unlike anchorTxSig, deliberately excluded so it CAN be filled in later —
 * see writeAnchorSig above). That fetch is bounded but not instant, so the
 * call site (predictLifecycle) fires this fire-and-forget (`void`) rather
 * than awaiting it — same convention as anchorRecordHash below — and its own
 * registry.snapshotNow() keeps firing SYNCHRONOUSLY, in the same tick as
 * FULL_TIME (a tested invariant, verdict-replay-check.ts), not after this
 * function's await. Consequence: resolvedMatches can now be durably
 * persisted (by that synchronous snapshotNow) BEFORE this function's write
 * lands, if the process dies mid-fetch. Closed at RESTORE time instead of
 * by reordering: the `resolved` snapshot hook (MatchRegistry construction,
 * below) only trusts a restored resolved=true when a durable sentiment
 * record actually exists on disk for the match; otherwise it leaves the
 * flag unset so a redelivered FULL_TIME retries crystallize for real
 * (predictLifecycle's resolvePredictions/sendToAnon re-run harmlessly —
 * match-state.ts's resolvePredictions recomputes+overwrites the same
 * verdicts from the same predictions+final score, never accumulates). */
async function crystallizeSentiment(
  matchId: string,
  match: ReturnType<MatchRegistry['get']>,
  /** The known-good final score (predictLifecycle's own resolvePredictions
   * input) — see the call-site comment. Optional so callers without one
   * (none today; kept optional to match SentimentAccumulator.crystallize's
   * own optional 3rd param) fall back to the accumulator's live-tracked
   * total. */
  finalScore?: { home: number; away: number },
): Promise<boolean> {
  // getOrCreate, not a bare map read (Codex finding 1's restore-recovery
  // path): after a crash-and-restore the accumulator may not have been
  // recreated yet — it is rebuilt here from fixture identity exactly the way
  // feedSentiment would. Null only for an UNKNOWN fixture (no team identity
  // to record against) — that can never seal, and the caller's bounded
  // retries surface it loudly instead of looping forever.
  const acc = getOrCreateAccumulator(matchId);
  if (!acc || !match) return false;
  // ── C1 idempotency backstop (review — the same dup mechanism as the
  // ARG-SUI double record): eviction clears the in-memory resolvedMatches
  // guard AND drops the match from the restart snapshot, so a post-eviction
  // RESTART re-dispatches this fixture's FULL_TIME at boot (TxLINE seedSnapshot
  // / a REPLAY-from-0), predictLifecycle sees !resolvedMatches.has() with a
  // cached score, and re-enters here. The DURABLE record was already written
  // to the volume at the first FULL_TIME — so if any sentiment record file for
  // this matchId already exists on disk, this is a re-crystallize: skip the
  // record write AND the on-chain anchor entirely. The disk is the durable
  // dedup that survives eviction, restart, AND a lost in-memory guard; the
  // resolvedMatches Set stays the cheap same-process fast-path (predictLifecycle
  // never even calls this twice within one process). One honest log line, then
  // return — anchorRecordHash below is downstream of the write, so skipping the
  // write provably skips the anchor.
  if (sentimentRecordExistsOnDisk(matchId)) {
    console.log(`[sentiment] ${matchId} already crystallized on disk — skipping re-crystallize + re-anchor (idempotent; the on-disk record is the durable dedup)`);
    return true; // sealed IS the outcome the caller cares about — the record exists
  }
  try {
    // Relic provenance refs (docs/DATA-ARCHITECTURE.md §4 item 2): never
    // throws (ingest/txline.ts's fetchProvenanceRefs catches everything
    // internally and honest-degrades to []); awaited here so the hash below
    // covers them, same call for a replay/demo match (no TxLINE ingest ⇒ no
    // candidates ⇒ [] with zero I/O) as for a live one.
    const txlineRefs = await fetchProvenanceRefs(matchId);
    // ── THE HARVEST (owner, 18 Jul: all recorded, all processed) — fold the
    // per-fan server tallies into the crystal: the full scoreline histogram,
    // the night's engagement totals + arrivals, and the earned points (the ONE
    // formula — apps/web/public/fan-record.js `score`; weights kept in
    // lockstep, formulaV bumps if they ever diverge). Serials only, never ids.
    const preds = match.predictionsAll();
    const stats = match.fanStatsAll();
    const scoreMap = new Map<string, { h: number; a: number; n: number }>();
    for (const pr of preds) {
      const k = `${pr.home}-${pr.away}`;
      const row = scoreMap.get(k) ?? { h: pr.home, a: pr.away, n: 0 };
      row.n += 1; scoreMap.set(k, row);
    }
    const scorelines = Array.from(scoreMap.values()).sort((x, y) => y.n - x.n);
    // NERVE DRIFT (contracts/sentiment.ts fans.nerveDrift): the changed minds
    // before the lock. Paths only for fans who actually changed, serials only
    // (read-only — existingFanNo, same rule as the points top-5), capped at 25
    // paths — plenty for a real crowd, bounded against a scripted one.
    const drift = match.predictHistoryAll().filter((r) => r.path.length > 1);
    const nerveDrift = {
      fansChanged: drift.length,
      totalEdits: drift.reduce((n, r) => n + (r.path.length - 1), 0),
      ...(drift.length ? { paths: drift.slice(0, 25).map((r) => ({ serial: registry.existingFanNo(r.anonId), path: r.path })) } : {}),
    };
    const firstArrival = stats.length ? Math.min(...stats.map((f) => f.firstSeenMs)) : 0;
    const arrivalBuckets = new Map<number, number>();
    for (const f of stats) {
      const minute = Math.max(0, Math.floor((f.firstSeenMs - firstArrival) / 60000 / 5) * 5);
      arrivalBuckets.set(minute, (arrivalBuckets.get(minute) ?? 0) + 1);
    }
    const engagement = {
      fans: stats.length,
      cheers: stats.reduce((n, f) => n + f.cheers, 0),
      reacts: stats.reduce((n, f) => n + f.reacts, 0),
      watchMinutes: Math.round(stats.reduce((n, f) => n + f.watchMs, 0) / 60000),
      arrivals: Array.from(arrivalBuckets.entries()).map(([minute, n]) => ({ minute, n })).sort((x, y) => x.minute - y.minute),
    };
    const CONV_MULT = [1, 1, 1.25, 1.5, 2]; // lockstep with fan-record.js score()
    const fh2 = finalScore?.home; const fa2 = finalScore?.away;
    const byFan = new Map<string, number>();
    for (const f of stats) {
      let p = Math.min(f.cheers, 300) + f.reacts * 2 + Math.min(Math.floor(f.watchMs / 60000), 130);
      byFan.set(f.anonId, p);
    }
    for (const pr of preds) {
      let p = (byFan.get(pr.anonId) ?? 0) + 25;
      if (fh2 !== undefined && fa2 !== undefined) {
        const m = CONV_MULT[pr.conv ?? 0] ?? 1;
        if (pr.home === fh2 && pr.away === fa2) p += Math.round(200 * m);
        else if (Math.sign(pr.home - pr.away) === Math.sign(fh2 - fa2)) p += Math.round(75 * m);
      }
      byFan.set(pr.anonId, p);
    }
    const pointRows = Array.from(byFan.entries()).map(([anonId, points]) => ({ anonId, points }));
    const points = {
      formulaV: 1,
      total: pointRows.reduce((n, r) => n + r.points, 0),
      fans: pointRows.length,
      top: pointRows.sort((x, y) => y.points - x.points).slice(0, 5)
        // existingFanNo, NEVER fanNoFor (Codex finding 7): this is a read —
        // a side-less lurker in the top five renders serial:null, honestly,
        // rather than being minted a serial mid-harvest.
        .map((r) => ({ serial: registry.existingFanNo(r.anonId), points: r.points })),
    };
    const record = acc.crystallize(
      { consensus: match.consensus(), rooted: match.counts(), scorelines, engagement, nerveDrift, points },
      { serial: 1, editionSize: null, caption: matchId },
      finalScore,
      txlineRefs,
    );
    const dir = path.join(DATA_DIR, 'sentiment');
    const filePath = path.join(dir, `${matchId}-${Date.now()}.json`);
    mkdirSync(dir, { recursive: true });
    writeFileAtomic(filePath, JSON.stringify(record, null, 2));
    broadcastToMatch(matchId, { type: 'sentiment', record } as unknown as ServerMsg);
    console.log(
      `[sentiment] crystallized ${matchId}: ${record.headline} (hash ${record.provenance.recordHash.slice(0, 12)}, ${txlineRefs.length} txlineRef${txlineRefs.length === 1 ? '' : 's'}) -> ${filePath}`,
    );
    // Anchor the hash on-chain (best-effort). Kept ASYNC so the dispatch loop is
    // never blocked for the up-to-20s confirmation — but the write-back is now
    // robust: writeAnchorSig re-reads the file and merges ONLY provenance.
    // anchorTxSig, so a late .then can never clobber a concurrent update, and
    // both outcomes are logged honestly. If the sig is lost here (confirmation
    // timeout, machine suspend, or OOM before this resolves — the exact
    // durability bug the backfill sweep below closes), the record simply stays
    // on disk with anchorTxSig:null and backfillAnchors() re-anchors its
    // EXISTING hash on a later sweep/boot.
    void anchorRecordHash(matchId, record.provenance.recordHash)
      .then((sig: string | null) => {
        if (!sig) {
          console.warn(`[sentiment] ${matchId} live anchor did not land — leaving anchorTxSig:null for the backfill sweep to retry (hash ${record.provenance.recordHash.slice(0, 12)})`);
          return;
        }
        if (writeAnchorSig(filePath, matchId, sig)) {
          console.log(`[sentiment] ${matchId} anchored on-chain ${sig.slice(0, 12)}… — sig persisted to ${path.basename(filePath)} (live path)`);
        }
      })
      .catch((err) => console.warn(`[sentiment] ${matchId} live anchor write-back errored: ${errDetail(err)}`));
    // Tournament-long fold + its own on-chain commitment (docs/DATA-ARCHITECTURE.md
    // §4 adopt #5) — re-fold DATA_DIR/sentiment into fingerprints.json and anchor
    // it, at the same "match seal" moment as the per-match record just above.
    // Own guard: the RECORD is already durably on disk by here — a refold
    // fault must not read as a failed seal (the caller would retry, hit the
    // disk-exists fast path, and log confusingly).
    try {
      refoldAndAnchorFingerprints();
    } catch (err) {
      console.warn(`[sentiment] fingerprints refold failed after sealing ${matchId}: ${errDetail(err)}`);
    }
    return true;
  } catch (err) {
    console.warn(`[sentiment] crystallize failed for ${matchId}: ${errDetail(err)}`);
    return false;
  }
}

/* ── ANCHOR DURABILITY — the backfill sweep (the durable fix) ─────────────
 * The live anchor above is fire-and-forget by design (never block the dispatch
 * loop for the up-to-20s confirmation). Its write-back can therefore be lost —
 * to the confirmation timeout, a machine suspend, or an OOM before the .then
 * resolves — leaving a persisted record with a REAL on-chain memo but
 * anchorTxSig:null on disk (the bug this closes: memos landed, records read
 * null). This sweep heals that FROM DISK: it scans DATA_DIR/sentiment/*.json and
 * for any record still carrying a null sig, re-anchors its EXISTING recordHash
 * and writes back ONLY the sig.
 *
 * Why it is safe next to the on-disk crystallize skip (sentimentRecordExistsOnDisk,
 * review C1): that guard prevents a re-CRYSTALLIZE (recompute the hash / write a
 * 2nd record / re-emit a full record) after eviction+restart. This sweep NEVER
 * crystallizes and NEVER recomputes the hash — it operates on the persisted
 * record exactly as-is and only fills provenance.anchorTxSig. Two orthogonal
 * disk-driven paths that never touch the same field.
 *
 * Disk-driven ⇒ it heals records for matches long EVICTED from memory (their
 * in-memory state is gone, but the file remains). Idempotent: a record that
 * already has a sig is skipped untouched. Bounded: a record whose anchor keeps
 * failing is retried at most STANDS_BACKFILL_MAX_ATTEMPTS times across this
 * process's life (tracked in memory, keyed by filename), so a permanently-
 * failing anchor is not hammered every sweep. No keypair (dev/replay) ⇒
 * anchorRecordHash returns null ⇒ every record is left exactly as-is, no crash.
 *
 * Re-anchoring a record whose memo DID land but whose sig write-back was lost
 * creates a 2nd identical-hash memo — ACCEPTABLE: same hash, the record ends
 * with one valid sig. We deliberately do NOT chain-query for a prior memo to
 * dedup (weekend scale; a duplicate provenance memo is harmless).
 */
const backfillAttempts = new Map<string, number>();
function backfillMaxAttempts(): number {
  const raw = Number(process.env.STANDS_BACKFILL_MAX_ATTEMPTS ?? 5);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 5;
}
let backfillInFlight = false;

export interface BackfillResult {
  /** record files inspected */
  scanned: number;
  /** null-sig records that got a sig this sweep */
  filled: number;
  /** records skipped because they already carry a sig */
  alreadyOk: number;
  /** null-sig records the anchor could not fill this sweep (no keypair / failure / attempt cap) */
  stillNull: number;
}

/**
 * One backfill sweep over DATA_DIR/sentiment/*.json. Never throws; returns a
 * tally. Exported so the dev check drives it directly and armAnchorBackfill runs
 * it on a timer. Deliberately NOT called from createStandsServer — dev checks
 * import the server module and manage their own relayer/keypair, and an
 * auto-sweep would fire real devnet anchors inside unrelated checks (mirrors
 * armSelfProbe's "not armed inside createStandsServer" reasoning).
 */
export async function backfillAnchors(): Promise<BackfillResult> {
  const result: BackfillResult = { scanned: 0, filled: 0, alreadyOk: 0, stillNull: 0 };
  if (backfillInFlight) return result; // never overlap a slow sweep with the next tick
  backfillInFlight = true;
  try {
    const dir = path.join(DATA_DIR, 'sentiment');
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      return result; // no sentiment dir yet — nothing crystallized, nothing to heal
    }
    const maxAttempts = backfillMaxAttempts();
    for (const f of files) {
      // fingerprints.json (the tournament-long fold, refoldAndAnchorFingerprints
      // below) is NOT a per-match record: it carries its own provenance envelope
      // (recordHash/anchorTxSig) that would otherwise structurally pass the
      // well-formed-record check below and get "healed" here — WRONGLY, via
      // writeAnchorSig's per-match merge (no matchId, no staleness guard against
      // a fold that's moved on since). It has its own fire-and-forget anchor,
      // self-retried at every subsequent match seal — explicitly excluded here.
      if (f === 'fingerprints.json') continue;
      const filePath = path.join(dir, f);
      let rec: SentimentRecord;
      try {
        rec = JSON.parse(readFileSync(filePath, 'utf8')) as SentimentRecord;
      } catch (err) {
        console.warn(`[sentiment:backfill] unreadable ${f} — skipping: ${errDetail(err)}`);
        continue;
      }
      result.scanned++;
      const prov = rec.provenance;
      if (!prov || typeof prov.recordHash !== 'string') continue; // not a well-formed record
      if (prov.anchorTxSig) {
        result.alreadyOk++; // already anchored — untouched (idempotent skip)
        continue;
      }
      const attempts = backfillAttempts.get(f) ?? 0;
      if (attempts >= maxAttempts) {
        result.stillNull++; // gave up (bounded) — don't hammer a permanently-failing anchor
        continue;
      }
      const matchId = typeof rec.matchId === 'string' && rec.matchId ? rec.matchId : f.replace(/-\d+\.json$/, '');
      backfillAttempts.set(f, attempts + 1);
      let sig: string | null;
      try {
        sig = await anchorRecordHash(matchId, prov.recordHash);
      } catch (err) {
        console.warn(`[sentiment:backfill] anchor threw for ${matchId} (${f}): ${errDetail(err)}`);
        result.stillNull++;
        continue;
      }
      if (!sig) {
        result.stillNull++; // no keypair / anchor failed — retry next sweep, until the cap
        continue;
      }
      if (writeAnchorSig(filePath, matchId, sig)) {
        backfillAttempts.delete(f);
        result.filled++;
        console.log(`[sentiment:backfill] ${matchId} back-anchored ${sig.slice(0, 12)}… (${f}) — sig recovered onto disk, recordHash unchanged`);
      } else {
        result.alreadyOk++; // filled by a concurrent path between our read and write
      }
    }
  } finally {
    backfillInFlight = false;
  }
  if (result.filled > 0 || result.stillNull > 0) {
    console.log(`[sentiment:backfill] sweep done — filled ${result.filled}, still-null ${result.stillNull}, already-ok ${result.alreadyOk}, scanned ${result.scanned}`);
  }
  return result;
}

/**
 * Arm the anchor-durability backfill: one sweep shortly after boot (heals any
 * record a prior process left null before it died) plus a periodic sweep
 * thereafter (retries transient anchor failures). Opt-in via
 * STANDS_ANCHOR_BACKFILL=1 — default OFF so importing/booting the server in a
 * dev check never fires real devnet anchors; prod turns it on in fly.toml.
 * Returns a disposer clearing the timers. Called by index.ts once, at boot;
 * never by createStandsServer (same reasoning as armSelfProbe). Env:
 * STANDS_ANCHOR_BACKFILL_INTERVAL_MS (default 60000, floor 5000).
 */
export function armAnchorBackfill(): () => void {
  if (process.env.STANDS_ANCHOR_BACKFILL !== '1') {
    console.log('[sentiment:backfill] disarmed (set STANDS_ANCHOR_BACKFILL=1 to enable the lost-sig backfill sweep)');
    return () => {};
  }
  const raw = Number(process.env.STANDS_ANCHOR_BACKFILL_INTERVAL_MS ?? 60_000);
  const intervalMs = Number.isFinite(raw) && raw >= 5_000 ? raw : 60_000;
  const run = (why: string): void => {
    void backfillAnchors()
      .then((r) => {
        if (r.filled > 0) console.log(`[sentiment:backfill] ${why}: recovered ${r.filled} lost sig(s)`);
      })
      .catch((err) => console.warn(`[sentiment:backfill] ${why} errored: ${errDetail(err)}`));
  };
  // boot sweep on a short delay so it never sits in the listen() hot path.
  const bootTimer = setTimeout(() => run('boot sweep'), 2_000);
  (bootTimer as { unref?: () => void }).unref?.();
  const timer = setInterval(() => run('periodic sweep'), intervalMs);
  (timer as { unref?: () => void }).unref?.();
  console.log(`[sentiment:backfill] armed — boot sweep + every ${intervalMs}ms (heals sentiment records whose on-chain sig write-back was lost)`);
  return () => {
    clearTimeout(bootTimer);
    clearInterval(timer);
  };
}

/* ── FINGERPRINTS ANCHOR — the sellable per-fan dataset's on-chain commitment ──
 * (docs/DATA-ARCHITECTURE.md §4 adopt #5: "Anchor fingerprints.json (same
 * helper, new kind) ... 'yours forever' becomes on-chain fact.") DATA_DIR/
 * sentiment/fingerprints.json is the tournament-long fold of every crystallized
 * match's fingerprint.home/away (builder.ts's foldFingerprints) — NOT part of
 * the frozen contracts/sentiment.ts (FanbaseSentiment there is a per-record
 * embed, not a persisted-FILE shape), so the on-disk envelope is defined
 * locally, right here. */

/** Local on-disk envelope for the folded artifact. Wraps foldFingerprints' Map
 * output with the SAME provenance idiom SentimentRecord carries (recordHash +
 * anchorTxSig), so the longitudinal dataset gets the same on-chain commitment
 * its per-match records do. */
interface FingerprintsFile {
  version: 1;
  fanbases: Record<string, FanbaseSentiment>;
  provenance: { recordHash: string; anchorTxSig: string | null };
}

/**
 * Merge an anchor sig into fingerprints.json IFF its recordHash still matches
 * what was anchored. Unlike writeAnchorSig (a per-match record file, written
 * exactly ONCE), this file is REWRITTEN by every match's seal (below) — so by
 * the time an async anchor resolves, the fold may already have moved on to a
 * newer hash. Writing a stale sig onto a newer hash would misattribute the
 * memo (law #1: every mark maps to reality) — so this checks recordHash
 * equality, not just sig-absence, before merging. Best-effort; never throws.
 */
function writeFingerprintsAnchorSig(filePath: string, expectedHash: string, sig: string): boolean {
  try {
    const cur = JSON.parse(readFileSync(filePath, 'utf8')) as FingerprintsFile;
    if (!cur.provenance || cur.provenance.recordHash !== expectedHash) return false; // superseded by a later seal — don't clobber
    if (cur.provenance.anchorTxSig) return false; // already anchored (e.g. a concurrent write got there first)
    cur.provenance.anchorTxSig = sig;
    writeFileAtomic(filePath, JSON.stringify(cur, null, 2));
    return true;
  } catch (err) {
    console.warn(`[fingerprints] anchor sig write-back failed: ${errDetail(err)}`);
    return false;
  }
}

export interface FingerprintsFoldResult {
  /** per-match record files folded in */
  records: number;
  /** distinct fanbases in the fold */
  fanbases: number;
  recordHash: string;
}

/**
 * Re-fold every persisted per-match record (DATA_DIR/sentiment/<matchId>-
 * <timestamp>.json — the live-crystallized naming; excludes fingerprints.json
 * itself) into the tournament-long fingerprints.json, and anchor its hash —
 * REUSING anchorRecordHash's exact pattern (relay.ts), kind:'fingerprints'.
 * Called at the END of crystallizeSentiment, i.e. at every match seal, so the
 * fold (and its anchor) are always current as of the latest match. The
 * fold+write is synchronous (a handful of small files); the ANCHOR itself is
 * fire-and-forget, same reasoning as the per-match anchor above — never block
 * the dispatch loop for the up-to-20s confirmation.
 *
 * DURABILITY, WITH A NOTED GAP (task instruction: prefer fire-and-forget + an
 * honest comment over bolting this onto the backfill sweep if it can't be
 * surgical): a failed anchor here is naturally retried at the NEXT match's
 * seal, because every seal re-folds AND re-anchors from scratch — self-healing
 * by cadence, unlike a per-match record, which anchors exactly once ever. The
 * gap: the LAST fold of a session (no subsequent match to retry it) has no
 * sweep to heal a lost sig. backfillAnchors() EXPLICITLY SKIPS fingerprints.json
 * (see the filename check at the top of its loop) rather than silently
 * mishandling it — its scan assumes a SentimentRecord's shape (a matchId +
 * provenance.recordHash keyed per match, healed via a per-match writeAnchorSig
 * merge with no staleness check); this file has no matchId and its provenance
 * can legitimately move between the read and the write-back (a newer seal
 * landing mid-sweep), so folding it in properly needs writeFingerprintsAnchorSig's
 * hash-equality guard wired through the sweep too — real code, not a one-line
 * generalization — judged not surgical enough for tonight. Acceptable for a
 * hackathon demo; a real fix is a small scheduled sweep (or a filename branch
 * in backfillAnchors that reuses writeFingerprintsAnchorSig), left as follow-up.
 */
export function refoldAndAnchorFingerprints(): FingerprintsFoldResult | null {
  const dir = path.join(DATA_DIR, 'sentiment');
  let files: string[];
  try {
    // per-match record files only (live naming = `<matchId>-<ts>.json`) —
    // excludes fingerprints.json itself (no numeric suffix) and anything else.
    files = readdirSync(dir).filter((f) => /-\d+\.json$/.test(f));
  } catch {
    return null; // no sentiment dir yet — nothing to fold
  }
  const records: SentimentRecord[] = [];
  for (const f of files) {
    try {
      records.push(JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as SentimentRecord);
    } catch (err) {
      console.warn(`[fingerprints] unreadable record ${f} — skipped from fold: ${errDetail(err)}`);
    }
  }
  if (records.length === 0) return null;
  const fold = foldFingerprints(records);
  const fanbases = Object.fromEntries(fold);
  const recordHash = createHash('sha256').update(JSON.stringify(fanbases)).digest('hex');
  const filePath = path.join(dir, 'fingerprints.json');
  const file: FingerprintsFile = { version: 1, fanbases, provenance: { recordHash, anchorTxSig: null } };
  try {
    writeFileAtomic(filePath, JSON.stringify(file, null, 2));
    console.log(`[fingerprints] refolded ${records.length} record(s) -> ${fold.size} fanbase(s) (hash ${recordHash.slice(0, 12)}) -> ${filePath}`);
  } catch (err) {
    console.warn(`[fingerprints] refold write failed: ${errDetail(err)}`);
    return null; // don't anchor a hash that never made it to disk
  }
  void anchorRecordHash('fingerprints', recordHash, 'fingerprints')
    .then((sig) => {
      if (!sig) {
        console.warn(`[fingerprints] anchor did not land — the next match's seal will re-fold + retry (hash ${recordHash.slice(0, 12)})`);
        return;
      }
      if (writeFingerprintsAnchorSig(filePath, recordHash, sig)) {
        console.log(`[fingerprints] anchored on-chain ${sig.slice(0, 12)}… — sig persisted (live path)`);
      } else {
        console.log(`[fingerprints] anchor ${sig.slice(0, 12)}… landed but the fold moved on (superseded by a newer seal) — not written back`);
      }
    })
    .catch((err) => console.warn(`[fingerprints] anchor write-back errored: ${errDetail(err)}`));
  return { records: records.length, fanbases: fold.size, recordHash };
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
/** The join-replay buffer caps, exported for the dev soak (src/dev/
 * mem-evict-check.ts) to assert the bound directly rather than hard-coding
 * magic numbers that could drift from the splice()s below. These already
 * ring-buffer via splice-oldest in rememberForJoin — the HONESTY tradeoff:
 * odds/pressure/spell are downsampled/rolling so a late joiner sees RECENT
 * market + pressure context (not a fabricated gap), while eventHistory keeps
 * the whole discrete story (goals/cards/subs) up to a generous cap so the
 * loom's late-join weaves every REAL event. */
export const JOIN_BUFFER_CAPS = {
  odds: ODDS_HISTORY_MAX,
  events: EVENT_HISTORY_MAX,
  pressure: PRESSURE_HISTORY_MAX,
  spells: SPELL_HISTORY_MAX,
} as const;
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
  // THE SEAL: a fan joining AFTER full time still deserves the sealed
  // sentiment record (post-mortem — see latestSentimentRecordOnDisk's doc
  // comment). Checked FIRST and independent of `snap` below on purpose: this
  // must still fire for a COLD match (evicted from every in-memory map, or a
  // fan returning after a restart) — the on-disk file is the only truth that
  // survives either. Sent ONLY to this joining socket (`sendReplay`, never a
  // room broadcast — the room already got it live via crystallizeSentiment),
  // tagged _replay like the rest of this catch-up bundle so a client's reveal
  // animation can't re-fire for a record that crystallized hours ago. Never
  // fabricates: no file on disk -> nothing sent, a genuinely unresolved match
  // stays live-looking.
  const sealedRecord = latestSentimentRecordOnDisk(matchId);
  if (sealedRecord) sendReplay(ws, { type: 'sentiment', record: sealedRecord } as unknown as ServerMsg);

  // the crowd's prediction so far — a joiner sees the consensus instantly.
  const match = registry.get(matchId);
  if (match && match.predictionCount() > 0) send(ws, match.consensus());
  // NEXT GOAL (in-game) — the crowd's current open-call state, so a
  // mid-cycle joiner sees it instantly (mirrors the consensus replay above).
  if (match && match.nextGoalOpenCount() > 0) send(ws, match.nextGoalState(currentTriple(matchId)));
  const snap = joinSnapshots.get(matchId);
  if (!snap) return;
  if (snap.fixtureInfo) send(ws, snap.fixtureInfo);
  if (snap.lineup) send(ws, snap.lineup);   // who's playing — instantly, before any event
  if (snap.feedState) send(ws, snap.feedState);
  // THE WHOLE MATCH, downsampled, so the loom weaves the full cloth on join: the
  // belief arc + the pressure shape + every event. Events/pressure go out marked
  // `_replay` so the loom weaves historical goals WITHOUT re-firing their GOOOOL.
  for (const o of snap.oddsHistory) send(ws, o);
  for (const s of snap.spellHistory) sendReplay(ws, s);   // full possession sequence → exact possession% + territory
  for (const p of snap.pressureHistory) sendReplay(ws, p); // every danger → exact attack/high-danger counts
  for (const e of snap.eventHistory) sendReplay(ws, e);
  // STATUS + SCORE go out AFTER the events (not before), so a JOIN matches the LIVE
  // dispatch order — ingest/replay.ts fans ledger-THEN-score per wire message. This is
  // the fix for two confirm/retract JOIN bugs (docs/POSTMORTEM-2026-07-14-live.md):
  //  · the loom sealed on the FULL_TIME status BEFORE it wove the historical goals, so a
  //    fresh post-full-time open showed an EMPTY scarf; now it weaves, THEN seals.
  //  · the stadium set the score (running reconcileScorers) BEFORE the goal events
  //    recorded their scorers, so an overturned goal's scorer wasn't dropped on a
  //    post-overturn join; now scorers are recorded first, THEN the score reconciles.
  // SCORE before STATUS: the scoreline settles + reconciles while the loom cloth is still
  // unsealed; the status then seals it (loom) and stamps the final phase (all surfaces).
  if (snap.score) send(ws, snap.score);
  if (snap.status) send(ws, snap.status);
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

/** adopt-#1 (docs/DATA-ARCHITECTURE.md §4): bridge sentiment/teams.ts's leaner
 * reference row (Fx = SentimentRecord['fixture'] — code/name/colors per side, no
 * id/kickoff/flag) into contracts/feed.ts's FeedMsg Fixture shape (id/kickoffISO/
 * flag required). Never invents: `id` is the matchId already in hand, `flag`
 * defaults to the tri-code (the same convention every page's own fixture map
 * already uses — see gate.html's FLAG_EXC comment "default flag=code"),
 * `kickoffISO` reuses the real calendar date teams.ts carries (no time-of-day is
 * known from this table — a client must never format it as a precise kickoff
 * clock, only a date). Unknown fixture -> null, never a placeholder. */
function fixtureForWire(matchId: string): Fixture | null {
  const fx = fixtureInfo(matchId);
  if (!fx) return null;
  return {
    id: matchId,
    home: { code: fx.home.code, name: fx.home.name, colors: [fx.home.colors[0], fx.home.colors[1]], flag: fx.home.code },
    away: { code: fx.away.code, name: fx.away.name, colors: [fx.away.colors[0], fx.away.colors[1]], flag: fx.away.code },
    kickoffISO: fx.dateISO,
  };
}

/** Broadcast this match's fixtureInfo exactly once. Two call sites (adopt-#1's
 * design): room join (the WS `?matchId=` connect handler below, right before
 * replaySnapshot — so THIS same joiner's replay already carries it, via
 * rememberForJoin's existing `case 'fixtureInfo'` cache) and match creation
 * (index.ts, when ingest first learns a fixtureId — TXLINE_FIXTURES/
 * REPLAY_FIXTURE at boot), so a room that's already occupied when ingest starts
 * also gets it live, not just future joiners. Idempotent: the join-snapshot
 * cache is the guard, so calling this repeatedly for the same match after the
 * first success is a cheap no-op, never a duplicate broadcast. */
function ensureFixtureInfoSent(matchId: string): void {
  if (joinSnapshots.get(matchId)?.fixtureInfo) return; // already sent — never re-broadcast
  const fixture = fixtureForWire(matchId);
  if (!fixture) return; // unknown fixture — never invent
  broadcastToMatch(matchId, { type: 'fixtureInfo', fixture });
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
    //
    // Provenance-fetch crash-window guard (docs/DATA-ARCHITECTURE.md §4 item
    // 2, crystallizeSentiment's own doc comment): resolvedMatches can now be
    // snapshotted (by predictLifecycle's synchronous, same-tick snapshotNow)
    // BEFORE crystallizeSentiment's awaited provenance fetch finishes writing
    // the sentiment record — a process dying in that EXACT narrow window
    // would otherwise restore resolved=true with NO record ever having been
    // written, permanently skipping crystallize on every future restart
    // (predictLifecycle's guard would never re-enter).
    //
    // Distinguish that failure signature from the PRE-EXISTING, already-
    // handled "resolved but score unknown" case (seat-check.ts's v5-snapshot
    // scenario: an old/doctored file with resolved=true and NO finalScore —
    // currentScoreSnapshot's caller is SUPPOSED to trust resolved=true there
    // and refuse-to-mint with a friendly retryable note, never retry
    // crystallize): predictLifecycle sets finalScores SYNCHRONOUSLY, in the
    // SAME tick as resolvedMatches, strictly BEFORE crystallizeSentiment is
    // even called — so a genuinely crash-interrupted match's snapshot always
    // carries a finalScore alongside resolved=true, while the old/unrelated
    // "score unknown" case never does. Only withhold trust when BOTH signals
    // of the NEW failure mode are present (finalScore known + no record on
    // disk); a resolved=true with no finalScore restores exactly as before
    // (snapshot.ts's applySnapshot restores finalScore before calling this,
    // specifically so finalScores.has() below is already accurate here).
    // Withheld -> the NEXT redelivered FULL_TIME (the same TXLINE
    // seedSnapshot / REPLAY-from-0 path the eviction case below already
    // relies on) retries crystallize for real; re-running
    // resolvePredictions/sendToAnon ahead of it is harmless (idempotent —
    // see match-state.ts's resolvePredictions doc).
    get: (matchId) => resolvedMatches.has(matchId),
    restore: (matchId) => {
      if (!finalScores.has(matchId) || sentimentRecordExistsOnDisk(matchId)) {
        resolvedMatches.add(matchId);
      } else {
        console.warn(`[sentiment] ${matchId} restored as resolved with a known final score but no sentiment record on disk — treating as unresolved so the seal retries (crystallize crash window)`);
        // Codex finding 1 follow-through: don't WAIT for a redelivered
        // FULL_TIME (TxLINE may never resend one) — the persisted
        // finalScore-without-record IS the pending-seal marker. Re-seal
        // shortly after boot; this hook runs during loadSnapshot, before
        // ingest starts, and 10s clears the boot rush. scheduleSeal's own
        // disk check re-verifies, and on success it sets resolvedMatches +
        // snapshots, closing the loop.
        const final = finalScores.get(matchId);
        if (final) {
          const t = setTimeout(() => scheduleSeal(matchId, final, 'restore-recovery'), 10_000);
          (t as { unref?: () => void }).unref?.();
        }
      }
    },
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
  {
    // NEXT GOAL resolution dedup (review Critical 2 — the fenced NEXT GOAL
    // region below owns nextGoalResolvedIds): in-memory-only, a restart used
    // to re-arm it empty, and TxLINE's seedSnapshot (ingest/txline.ts) replays
    // the FULL historical action list through the same dispatch on every
    // ingest boot — the EXACT mechanism that forced persistence for
    // resolvedMatches and openedTriggerIds above. Without this, a re-dispatched
    // historical confirmed goal could resolve a FRESH cycle's open calls
    // against stale history. Mirrors openedTriggerIds' hooks exactly; same
    // boot-ordering guarantee (`restore` runs during registry.loadSnapshot(),
    // BEFORE ingest starts). `get` reads only — never fabricates an entry.
    get: (matchId) => Array.from(nextGoalResolvedIds.get(matchId) ?? []),
    restore: (matchId, ids) => {
      const seen = nextGoalResolvedIdsFor(matchId);
      for (const id of ids) seen.add(id);
    },
  },
  {
    // NEXT GOAL resolved-cycle rows (review Important 3): the record's
    // nextGoal layer lives on the SentimentAccumulator (this file owns it),
    // exactly like the felt-moment history above — so a full-time
    // crystallization after a mid-match restart still carries cycles resolved
    // before it. Same hooks pattern as moments; tolerant (absent = none).
    get: (matchId) => accumulators.get(matchId)?.getNextGoalRows() ?? [],
    restore: (matchId, rows) => { getOrCreateAccumulator(matchId)?.restoreNextGoalRows(rows); },
  },
  {
    // Review merge-gate fix: the resolution-time final score (finalScores,
    // captured in predictLifecycle's FULL_TIME branch alongside
    // resolvedMatches) rides the snapshot through these hooks — same pattern
    // as moments/resolved/openedTriggers above. `restore` runs during
    // registry.loadSnapshot(), BEFORE any ingest, so the very first
    // post-restart claim on an already-resolved match already knows the TRUE
    // score its restored verdicts were graded against — never a fabricated
    // 0–0. `get` returns null for a never-resolved match (the field is then
    // omitted from the snapshot, never zero-filled).
    get: (matchId) => finalScores.get(matchId) ?? null,
    restore: (matchId, score) => { finalScores.set(matchId, score); },
  },
  // ── THE EVICTION SEAM (the memory fix) ──────────────────────────────────
  // registry.ts decides WHEN a finished/stale match dies (FT + 15 min quiet +
  // zero clients, or 3 h idle); this callback frees WHAT that death must free
  // on the server side. ONE place, mirroring the persistence hooks above — so
  // the audited list of per-match maps lives here and only here (the dev soak
  // asserts the SAME list, via perMatchStateFootprint, goes empty). Every
  // entry below is keyed by matchId except seatTokens (keyed by opaque token —
  // purged by its bound matchId). These consts are declared later in the file
  // but this arrow only RUNS during a sweep, long after module load, so the
  // forward references resolve fine (same pattern the nextGoalResolvedIds hook
  // above already relies on).
  (matchId: string) => {
    // clear the open drama-window timer FIRST — clearTimeout before dropping
    // the ref, or the pending close would fire on an already-freed match.
    const timer = openMomentTimers.get(matchId);
    if (timer) {
      clearTimeout(timer);
      openMomentTimers.delete(matchId);
    }
    resolvedMatches.delete(matchId);
    finalScores.delete(matchId);
    pendingSeals.delete(matchId); // a pending seal's next tick sees no entry and stops (eviction is ≥15min post-FT — the seal is long done or long failed)
    settledScores.delete(matchId); // frees the per-match settled-scoreline reducer
    tripleWindow.delete(matchId);
    openedTriggerIds.delete(matchId);
    accumulators.delete(matchId); // frees the accumulator's per-tick market curve too
    joinSnapshots.delete(matchId); // frees the capped odds/event/pressure/spell replay buffers
    lastFeedState.delete(matchId);
    cheerEchoCounters.delete(matchId);
    nextGoalResolvedIds.delete(matchId);
    // seatTokens are keyed by opaque token, not matchId — purge any still
    // bound to this match (they are short-lived + single-use + swept on issue,
    // so this is belt-and-braces: a match evicted 15 min post-FT has only long-
    // expired tokens, but leaving them would pin a stale per-match entry).
    for (const [tok, rec] of seatTokens) {
      if (rec.matchId === matchId) seatTokens.delete(tok);
    }
  },
  // ── I2: the eviction gate's client count ────────────────────────────────
  // ALL open sockets seated in this room — helloed fans AND feed-only
  // spectators (LiveSource seats via ?matchId= at connect, never hellos, so
  // MatchState.presenceCount() can't see it). broadcastToMatch already fans out
  // to exactly these sockets, so this is the honest "is anyone watching?".
  (matchId: string) => {
    let n = 0;
    for (const state of conns.values()) if (state.matchId === matchId) n++;
    return n;
  },
  {
    // Codex finding 10: the roar samples ride the snapshot the same way
    // moments do — so a full-time seal after a mid-match restart (hotfix
    // deploy during the half) carries the whole curve, not a truncated one.
    get: (matchId) => accumulators.get(matchId)?.getRoarSeries() ?? [],
    restore: (matchId, rows) => { getOrCreateAccumulator(matchId)?.restoreRoarSeries(rows); },
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
    // THE FAN SERIAL (archive/design-docs-consumed/design/HANDOFF-2026-07-10-fan-serial.md, the
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

  // NEXT GOAL (in-game) — a fan's most recent verdict, replayed on hello
  // exactly like predictVerdict above (the CURRENT cycle's — nextGoalVerdicts
  // is overwritten at each resolution, so this is always the latest one).
  const nextGoalVerdict = match.nextGoalVerdictFor(msg.anonId);
  if (nextGoalVerdict) sendReplay(ws, nextGoalVerdict);

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
  if (!match.predict(state.anonId, msg.home, msg.away, msg.atMs, Date.now(), (msg as { conv?: number }).conv)) return; // locked/invalid
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

/* ══════════════════════════════════════════════════════════════════════
 * NEXT GOAL (in-game) — docs/BACKLOG-full-version-and-deferred-ideas.md §2.
 * A fan's live in-round call: which end scores next, or 'none' (no more
 * goals this match). Stamped from the server's OWN observed market (never
 * client-supplied, unlike CallMsg.marketP — see handleCall's TODO above),
 * accepted only during live play, resolved on the next CONFIRMED goal or at
 * FULL_TIME (review Critical 1: an unconfirmed goal is the held breath and
 * may be disallowed outright — it never resolves the book; the honest
 * semantic is "your call resolves when the goal CONFIRMS", observed lag
 * ~1-2 minutes on the premiere wire). A goal here means a confirmed 'goal'
 * ledger event OR a confirmed, SCORED, IN-PLAY penalty (re-review Critical:
 * PAR–FRA Jul 4 — France's only goal exists exclusively as penalty_outcome
 * envelopes, ledger kind 'penalty-kick'; kind==='goal' alone left a correct
 * caller permanently WRONG). Shootout kicks NEVER resolve: they arrive
 * under phase PENALTIES and score into PE.Goals with Total.Goals unchanged
 * (SUI–COL wire proof) — the 'none'-resolves-correct-at-FULL_TIME semantic
 * is theirs. Each resolution with open calls also appends a row into the
 * SentimentRecord's nextGoal layer (contracts/sentiment.ts — §1.4
 * Courage-Adjusted Calls' substrate). Self-contained region (tonight-gate
 * merge note: keep edits here, outside it only the minimal wiring —
 * dispatch case, the broadcastToMatch hook, the registry persistence hooks,
 * the two join/hello replay lines — all marked "NEXT GOAL" at their call
 * sites). ═══════════════════════════════════════════════════════════════ */

/** Only these phases count as "live play" for a call — pre-kickoff (PRE),
 * the dead-ball breaks (HALF_TIME/PENALTIES), and post-FT all reject. */
const NEXT_GOAL_LIVE_PHASES = new Set<MatchPhase>(['FIRST_HALF', 'SECOND_HALF', 'EXTRA_TIME']);

/** The market's current de-vigged triple for a match — the SAME cached
 * latest 'odds' tick the join-replay snapshot already carries
 * (rememberForJoin above), reused here so a NEXT GOAL call is stamped from
 * server-observed truth. Null until the first odds tick for this match
 * has arrived. */
function currentTriple(matchId: string): { home: number; draw: number; away: number } | null {
  const tick = joinSnapshots.get(matchId)?.odds?.tick;
  return tick ? { home: tick.pHome, draw: tick.pDraw, away: tick.pAway } : null;
}

/** The match's current phase, off the SAME cached latest 'status' message
 * join-replay uses — server.ts's single source of truth for "what phase is
 * this match in right now" (MatchState itself stays feed-agnostic). */
function isNextGoalLivePhase(matchId: string): boolean {
  const phase = joinSnapshots.get(matchId)?.status?.ev.phase;
  return phase !== undefined && NEXT_GOAL_LIVE_PHASES.has(phase);
}

function isValidNextGoalCall(v: unknown): v is 'home' | 'away' | 'none' {
  return v === 'home' || v === 'away' || v === 'none';
}

function handleNextGoalCall(state: ConnState, msg: Extract<ClientMsg, { type: 'nextGoalCall' }>): void {
  if (DISABLE_NEXT_GOAL) return;
  if (!state.matchId || !state.anonId || state.matchId !== msg.matchId) return;
  if (!isValidNextGoalCall(msg.call)) return;
  if (!isNextGoalLivePhase(msg.matchId)) {
    console.log(`[nextGoal] rejected — not live play: anonId=${state.anonId.slice(0, 8)} match=${msg.matchId} phase=${joinSnapshots.get(msg.matchId)?.status?.ev.phase ?? 'unknown'}`);
    return;
  }
  const match = registry.getOrCreate(msg.matchId);
  const marketAtCall = currentTriple(msg.matchId);
  // normalize a missing/garbage client stamp to the server clock — the stored
  // atMs feeds the record row's openedAtMs (min over the book), which must
  // never be NaN/undefined (same trust level as PredictMsg.atMs otherwise).
  const atMs = typeof msg.atMs === 'number' && Number.isFinite(msg.atMs) ? msg.atMs : Date.now();
  // the live match minute at call time (the join cache's running latch) — stamps where this call
  // will knot on the fan's scarf when it resolves. Null when no clocked message has arrived yet.
  const minute = joinSnapshots.get(msg.matchId)?.lastMinute ?? null;
  match.nextGoalCall(state.anonId, msg.call, marketAtCall, atMs, minute);
  broadcastToMatch(msg.matchId, match.nextGoalState(marketAtCall));
}

/** Dedup so a re-emitted goal (a confirmed goal re-emits with the same
 * ev.id) or a re-delivered FULL_TIME status can never resolve the SAME
 * real-world event twice — parallels openedTriggerIds' discipline (the
 * moment-open dedup, same id scheme: a goal's ev.id, a `${matchId}:`-prefixed
 * synthetic for full-time) with its OWN Set, so this stays correct
 * independent of DISABLE_MOMENTS (which would otherwise leave
 * openedTriggerIds unfed). PERSISTED per match via the registry's
 * NEXT-GOAL hooks (review Critical 2): TxLINE's seedSnapshot
 * (ingest/txline.ts) replays the FULL historical action list through the
 * same dispatch on every ingest boot — and a REPLAY_FILE restart always
 * plays from line 0 — so an in-memory-only Set here would let a
 * re-dispatched historical confirmed goal resolve a FRESH cycle's open
 * calls against stale history after any restart. The Set's size doubles as
 * the cycle ordinal (a resolution event count — see the row append below). */
const nextGoalResolvedIds = new Map<string, Set<string>>();
function nextGoalResolvedIdsFor(matchId: string): Set<string> {
  let seen = nextGoalResolvedIds.get(matchId);
  if (!seen) {
    seen = new Set();
    nextGoalResolvedIds.set(matchId, seen);
  }
  return seen;
}

/** The wire-confirmed flag of a scoring ledger event, both shapes: normalize
 * stamps ev.confirmed for kind 'goal' ONLY — a 'penalty-kick' event's
 * Confirmed lives on the raw envelope it carries (ev.raw, always set by
 * parseLedgerMessage). Fail-closed: absent/unreadable = NOT confirmed — the
 * book never resolves on unproven confirmation. */
function isWireConfirmed(ev: LedgerEvent): boolean {
  if (ev.confirmed === true) return true;
  const raw = ev.raw as { Confirmed?: unknown } | undefined;
  return raw?.Confirmed === true;
}

/** Resolve the open book against what happened: personal verdicts to each
 * caller, a SentimentRecord row into the accumulator (ONLY when the cycle
 * had open calls — an uncalled cycle appends nothing, its ordinal is the
 * honest gap), and the emptied-book state broadcast. Shared by the goal and
 * FULL_TIME branches of nextGoalLifecycle below. */
function resolveNextGoalBook(matchId: string, cycle: number, happened: Side | 'none', confirmedGoalId: string | null): void {
  const match = registry.get(matchId);
  if (!match) return; // no crowd state ever — nothing to resolve (the dedup id stays marked)
  if (match.nextGoalOpenCount() === 0) return; // nothing open — no-op, nothing to broadcast
  const now = Date.now();
  const res = happened === 'none' ? match.resolveNextGoalAtFullTime(now) : match.resolveNextGoalOnGoal(happened, now);
  for (const v of res.verdicts) sendToAnon(matchId, v.anonId, v);
  // the record row (contracts/sentiment.ts nextGoal doc) — real resolutions
  // only, real counts only. getOrCreateAccumulator is null for an unknown
  // fixture (no team identity to record against) — same silent skip as
  // feedSentiment's.
  const acc = getOrCreateAccumulator(matchId);
  if (acc) {
    acc.nextGoalResolved({
      cycle,
      openedAtMs: res.openedAtMs ?? now, // openedAtMs is non-null whenever the book was non-empty (guarded above)
      resolvedAtMs: now,
      happened,
      confirmedGoalId,
      crowd: res.crowd,
      marketAtResolution: currentTriple(matchId),
    });
  }
  broadcastToMatch(matchId, match.nextGoalState(currentTriple(matchId)));
}

/** Drive NEXT GOAL resolution off the same broadcast every message rides
 * (mirrors predictLifecycle/momentLifecycle above — but ordered BEFORE
 * predictLifecycle in broadcastToMatch, so a FULL_TIME row lands in the
 * accumulator before crystallize reads it). A CONFIRMED goal resolves the
 * book against the scoring side; FULL_TIME (no further goal this cycle)
 * resolves it against 'none'. The dedup mark happens BEFORE the match
 * lookup, so a fanless match's confirmed goal still consumes its cycle
 * ordinal and can never resolve calls placed between two re-emissions of
 * the same goal. */
function nextGoalLifecycle(matchId: string, msg: ServerMsg | FeedMsg): void {
  if (DISABLE_NEXT_GOAL) return;

  if (msg.type === 'ledger') {
    if (msg.msg.type !== 'event') return;
    const ev = msg.msg.ev;
    if (!ev.side) return;
    if (ev.kind === 'penalty-kick') {
      // Re-review Critical: a converted IN-PLAY penalty IS the next goal —
      // PAR–FRA Jul 4 proof (apps/web/public/replay/par-fra-20260704.jsonl):
      // France's only goal exists exclusively as three penalty_outcome
      // envelopes (Id 609, Confirmed false→true→true, Outcome "Scored",
      // Total.Goals moves) — zero Action:'goal' envelopes all match. Without
      // this branch a fan correctly calling the penalty side stayed open and
      // graded permanently WRONG at FULL_TIME.
      // Shootout kicks are EXCLUDED: they arrive under phase PENALTIES
      // (StatusId 12) and score into Score.ParticipantN.PE.Goals with
      // Total.Goals UNCHANGED (SUI–COL wire proof; normalize.ts documents
      // the same) — a shootout is not "the next goal", and today's semantic
      // (side calls resolve wrong / 'none' correct at FULL_TIME) stands.
      // Gate off the same cached status truth the call gate uses.
      if (joinSnapshots.get(matchId)?.status?.ev.phase === 'PENALTIES') return;
      // Only a SCORED penalty is a goal — normalize puts the wire Outcome in
      // ev.detail for penalty-kick ('Scored' | 'Missed' | …). Fail-closed on
      // anything else: a miss/save/unknown outcome resolves nothing.
      if (ev.detail !== 'Scored') return;
    } else if (ev.kind !== 'goal') {
      return;
    }
    // Review Critical 1: ONLY a confirmed scoring event resolves. The
    // premiere capture is the proof of both halves of this gate:
    // 18209181:495 emitted confirmed:false ONCE, never confirmed, and the
    // final score excludes it (a disallowed goal — resolving on it would
    // have graded real fans against a goal that never happened);
    // 18209181:683/:729 each emitted confirmed:false first and confirmed
    // TRUE ~105s/~67s later — the gate sits BEFORE the dedup mark so the
    // provisional emission never consumes the id, and the confirming
    // emission still resolves exactly once. isWireConfirmed covers both
    // event shapes (ev.confirmed for goals; the raw envelope's Confirmed
    // for penalty-kick, which normalize doesn't stamp).
    if (!isWireConfirmed(ev)) return;
    const seen = nextGoalResolvedIdsFor(matchId);
    if (seen.has(ev.id)) return; // re-emission of an already-resolved scoring event
    seen.add(ev.id);
    resolveNextGoalBook(matchId, seen.size, ev.side, ev.id);
    return;
  }

  if (msg.type === 'status') {
    if (msg.ev.phase !== 'FULL_TIME') return;
    const sourceId = `${matchId}:nextgoal:ft`;
    const seen = nextGoalResolvedIdsFor(matchId);
    if (seen.has(sourceId)) return; // a re-delivered FULL_TIME — already resolved
    seen.add(sourceId);
    resolveNextGoalBook(matchId, seen.size, 'none', null);
  }
}
/* ══════════════════════════════════════ END NEXT GOAL ═══════════════════ */

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
    case 'nextGoalCall':
      return handleNextGoalCall(state, msg);
    case 'seatToken': // SEAT: one-time claim token, session-bound (see the SEAT fence below)
      return handleSeatToken(ws, state, msg);
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
 * below in one additive block. SEAT's entire footprint outside this fence:
 * the grouped import block up top, ONE `case 'seatToken'` line in
 * handleMessage's switch (the session-bound claim-token request — review fix,
 * risk 2), and the fenced route block inside createStandsServer.
 * ════════════════════════════════════════════════════════════════════════ */

/** The REAL score for matchId as this process knows it. `decided` is true ONLY when full time was
 * genuinely observed (`resolvedMatches`) AND a genuine final score is known — belt from the review
 * merge-gate fix: a restart used to restore the resolved flag while the score cache (memory-only
 * joinSnapshots) came back empty, so this returned {0,0,decided:true} and the fan's first
 * post-restart claim minted a permanent "Full-time 0–0" scarf contradicting its own verdict
 * attribute. Order of truth for a RESOLVED match: `finalScores` first (the resolution-time score
 * the verdicts were graded with — persisted in the snapshot, restored on boot), then the live
 * join-snapshot cache (covers a resolved-in-this-process match; identical by construction, since
 * predictLifecycle sourced fh/fa from that same cache); neither known -> fall through to the disk
 * fallback below rather than refusing outright.
 * EVICTION fallback (delta-review Bug E): `onEvict` clears `resolvedMatches`/`finalScores`/
 * `joinSnapshots` together, so a finished-then-evicted match looks in-memory exactly like one that
 * never started — a post-eviction hello resurrects an empty, unresolved MatchState (registry.ts's
 * getOrCreate), so neither branch above fires. Before giving up, check the SAME durable on-disk
 * sentiment record the seal-on-join path already trusts (`latestSentimentRecordOnDisk`, above,
 * crystallized once at FULL_TIME and outliving both eviction and a restart) — its `finalScore` is
 * real, resolution-time truth, never fabricated. Absent/unresolved on disk too -> decided:false,
 * same honest refusal as before (a genuinely live or never-seen match still reports undecided).
 * For an UNRESOLVED match this stays the live-cache read it always was ({0,0} before any score
 * message — a real, true tally) unless the disk fallback finds a record, and decided:false keeps
 * the mint gate shut anyway.
 * Exported for the dev check (src/dev/seat-check.ts, src/dev/seal-consume-check.ts) — this is the
 * exact value handleSeatClaim hands to mintScarfForClaim, so asserting it post-restore/post-evict
 * IS asserting what a mint would carry. */
export function currentScoreSnapshot(matchId: string): LiveScoreSnapshot {
  const ev = joinSnapshots.get(matchId)?.score?.ev;
  // Resolution-time truth FIRST, independent of the resolved flag (Codex
  // finding 1 rework): finalScores is set ONLY in the genuine FULL_TIME tick
  // (and restored from the snapshot persisted in that same tick), so its
  // presence alone proves full time was observed. The resolved flag is now
  // deliberately WITHHELD at restore for a crashed-mid-seal match (so the
  // seal re-fires) — but the score truth is unchanged, and a fan's claim
  // during that short recovery window must mint with the true score, not
  // refuse. The doctored resolved-without-score case still falls through to
  // the same honest refusal as before.
  const final = finalScores.get(matchId);
  if (final) return { home: final.home, away: final.away, decided: true };
  if (resolvedMatches.has(matchId)) {
    if (ev && typeof ev.home === 'number' && typeof ev.away === 'number') return { home: ev.home, away: ev.away, decided: true };
  }
  const disk = latestSentimentRecordOnDisk(matchId);
  if (disk) return { home: disk.finalScore.home, away: disk.finalScore.away, decided: true };
  return { home: ev?.home ?? 0, away: ev?.away ?? 0, decided: false }; // no memory, no disk record — refuse, never fabricate
}

/** Dev-soak introspection (src/dev/mem-evict-check.ts) — NEVER imported by
 * index.ts. Returns, for every server-side per-match collection, whether it
 * still holds an entry for matchId. This is the SAME enumeration the onEvict
 * seam clears (wired into the registry above), so the check asserts the map
 * that actually exists rather than a hand-copied list that could silently
 * drift from it. After an eviction every value here MUST be false. */
export function perMatchStateFootprint(matchId: string) {
  return {
    resolvedMatches: resolvedMatches.has(matchId),
    finalScores: finalScores.has(matchId),
    openMomentTimers: openMomentTimers.has(matchId),
    tripleWindow: tripleWindow.has(matchId),
    openedTriggerIds: openedTriggerIds.has(matchId),
    accumulators: accumulators.has(matchId),
    joinSnapshots: joinSnapshots.has(matchId),
    lastFeedState: lastFeedState.has(matchId),
    cheerEchoCounters: cheerEchoCounters.has(matchId),
    nextGoalResolvedIds: nextGoalResolvedIds.has(matchId),
    seatTokens: [...seatTokens.values()].some((r) => r.matchId === matchId),
  };
}

/** Dev-soak introspection (src/dev/mem-evict-check.ts) — the current length of
 * each join-replay ring buffer for matchId, or null if the match has no
 * join-snapshot cache. Asserted ≤ JOIN_BUFFER_CAPS to prove the buffers stay
 * bounded even under a pathological message flood. */
export function joinBufferSizes(
  matchId: string,
): { odds: number; events: number; pressure: number; spells: number } | null {
  const s = joinSnapshots.get(matchId);
  if (!s) return null;
  return {
    odds: s.oddsHistory.length,
    events: s.eventHistory.length,
    pressure: s.pressureHistory.length,
    spells: s.spellHistory.length,
  };
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

/** Resolve the side the fan actually rooted for into its team tricode
 * (archive/design-docs-consumed/design/HANDOFF-coordinator-data-wiring.md: profile.sides must be tricodes, e.g. ['SUI','ARG'], never
 * 'home'/'away' — the cabinet renders flag stickers from these). Null when the fan never rooted, or
 * the match has no known fixture identity — never guessed. */
function sideTricode(matchId: string, side: Side | null): string | null {
  if (!side) return null;
  const fx = fixtureInfo(matchId);
  if (!fx) return null;
  return side === 'home' ? fx.home.code : fx.away.code;
}

/* ── SEAT claim tokens (review fix, risk 2) ─────────────────────────────────
 * POST /seat/claim used to trust body.anonId — any pubkey could harvest any
 * anonId's side/call/verdict/serial with a bare POST. Now a claim requires a
 * one-time token requested OVER THE WEBSOCKET (contracts/crowd.ts SeatTokenMsg
 * → SeatTokenGrantMsg): the server grants ONLY for the connection's own
 * adopted identity (state.anonId/state.matchId — the same trust anchor
 * cheer/predict/momentReact already use), and the HTTP claim derives its
 * anonId + matchId FROM THE TOKEN, never from the body. Tokens are single-use
 * (burned on redemption, even when expired), short-lived (~2 min), and
 * in-memory only — a restart invalidates pending tokens, which is correct: a
 * token is a session credential, and the client just requests a fresh one.
 * TTL is env-tunable (SEAT_TOKEN_TTL_MS, floor 1s) so the dev check can run a
 * real expiry test in seconds — same pattern as WS_HEARTBEAT_INTERVAL_MS. */
function seatTokenTtlMs(): number {
  const raw = process.env.SEAT_TOKEN_TTL_MS;
  const n = raw !== undefined ? Number(raw) : 120_000;
  return Number.isFinite(n) ? Math.max(1_000, n) : 120_000;
}
const SEAT_TOKEN_TTL_MS = seatTokenTtlMs();

interface SeatTokenRecord {
  matchId: string;
  anonId: string;
  expiresAtMs: number;
}
const seatTokens = new Map<string, SeatTokenRecord>();

/** Issue a claim token to THIS connection's adopted identity. Mirrors
 * handleCheer's guard shape: the session must be seated (hello adopted an
 * anonId) and the request's matchId/anonId must BOTH equal the session's own —
 * anything else is silently dropped, exactly like a cheer for the wrong match.
 * At most one live token per (matchId, anonId): re-issuing replaces the prior
 * (bounds the map by active fans), and every issue sweeps expired entries. */
function handleSeatToken(ws: WebSocket, state: ConnState, msg: Extract<ClientMsg, { type: 'seatToken' }>): void {
  if (!state.matchId || !state.anonId) return;
  if (state.matchId !== msg.matchId || state.anonId !== msg.anonId) return;
  const now = Date.now();
  for (const [tok, rec] of seatTokens) {
    if (now > rec.expiresAtMs) seatTokens.delete(tok); // sweep expired
    else if (rec.matchId === state.matchId && rec.anonId === state.anonId) seatTokens.delete(tok); // replace prior
  }
  const token = randomBytes(24).toString('base64url');
  const expiresAtMs = now + SEAT_TOKEN_TTL_MS;
  seatTokens.set(token, { matchId: state.matchId, anonId: state.anonId, expiresAtMs });
  const grant: SeatTokenGrantMsg = { type: 'seatTokenGrant', matchId: state.matchId, anonId: state.anonId, token, expiresAtMs };
  send(ws, grant); // ONLY to the requesting socket — the token is a credential, never broadcast
}

/** Redeem (single-use): returns the bound identity, or null for anything
 * invalid — unknown, expired, or already redeemed. A token is burned on ANY
 * redemption attempt that finds it, even an expired one. */
function redeemSeatToken(token: unknown): SeatTokenRecord | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  const rec = seatTokens.get(token);
  if (!rec) return null;
  seatTokens.delete(token); // single-use
  if (Date.now() > rec.expiresAtMs) return null;
  return rec;
}

/** POST /seat/claim {token,pubkey,method} -> {profile, mint:{asset,txUrl}|null}.
 * The anonId + matchId being claimed are derived FROM THE TOKEN (session-bound,
 * single-use — see the block comment above), never from the body: a body
 * anonId/matchId, if sent, is ignored. bindClaim folds the token-bound fan's
 * REAL rooted side + locked call into the record (never inventing one),
 * profile.sides is patched with the resolved TEAM TRICODE (not 'home'/'away'),
 * and — once the match has genuinely reached FULL_TIME — the scarf is minted
 * owned by pubkey into the ROOOT scarf collection (service pays, devnet only;
 * idempotent per (pubkey, matchId) — see seat/mint-scarf.ts). A claim before
 * full time still binds; `mint: null` until the match actually ends. */
async function handleSeatClaim(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: any;
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    sendJson(res, 400, { error: 'invalid json' });
    return;
  }
  const { token, pubkey } = body ?? {};
  if (!isValidPubkey(pubkey)) {
    sendJson(res, 400, { error: 'invalid pubkey' });
    return;
  }
  const grant = redeemSeatToken(token);
  if (!grant) {
    sendJson(res, 401, { error: 'invalid or expired claim token' });
    return;
  }
  const method: 'passkey' | 'privy' = body?.method === 'privy' ? 'privy' : 'passkey';
  try {
    // The token's matchId was getOrCreate'd by the very hello that earned the
    // token, so this lookup succeeds in practice; the identity-only fallback
    // stays as defense (e.g. future GC of idle matches), never inventing state.
    const match = registry.get(grant.matchId);
    const record = match
      ? bindClaim(match, grant.anonId, pubkey, method, Date.now())
      : { pubkey, method, side: null, call: null, matchId: grant.matchId, boundAtMs: Date.now() };
    const tricode = match ? sideTricode(match.matchId, record.side) : null;
    const profile = saveProfile(pubkey, { sides: tricode ? [tricode] : [], since: record.boundAtMs });
    // The scarf mints for a REAL, FULL-TIME match claim only (mint-scarf.ts's own honesty gate) —
    // mid-match claims stay mint:null. Independently try/caught — even though mintScarfForClaim
    // itself never throws (it catches internally), this belt-and-suspenders guard means a mint
    // problem can NEVER turn an already-saved bind into a 500: the claim always responds 200 with
    // mint:null on any mint-side issue.
    let mint: ScarfMint | null = null;
    let mintNote: string | undefined;
    if (match) {
      const score = currentScoreSnapshot(match.matchId);
      if (resolvedMatches.has(match.matchId) && !score.decided) {
        // Review merge-gate fix: the match genuinely finished, but THIS process does not know
        // the real final score (restored from a pre-v6 snapshot, or the score never persisted).
        // Refuse plainly and retryably — the bind is saved, no token/marker is burned by this
        // branch, and no scarf is ever minted with a fabricated 0–0.
        mintNote = 'final score not available right now — your seat is saved; claim again shortly';
        console.warn(`[seat] ${match.matchId} is resolved but its final score is unknown to this process (pre-finalScore snapshot?) — refusing to mint rather than fabricate a 0–0 scarf; the claim stays retryable`);
      } else {
        try {
          const result = match.verdictFor(grant.anonId)?.verdict ?? null;
          const fanNo = registry.fanNoFor(grant.anonId);
          // Assemble the fan's cloth record from the server's OWN authoritative data (the market's
          // belief path, the on-disk goals, their rooted side + resolved NEXT GOAL calls) so the mint
          // captures their REAL loom keepsake — never a client-sent record (law 1 + the claim gate).
          // Null (unknown fixture / no belief) → the mint falls back to scarf-svg.
          const fx = fixtureInfo(match.matchId);
          let cloth: ClothRecord | null = null;
          if (fx) {
            let outcome: { sub: string; hit: boolean } | null = null;
            if (record.call && result) {
              const sub = record.call.home > record.call.away ? fx.home.code
                : record.call.away > record.call.home ? fx.away.code : 'DRAW';
              outcome = { sub, hit: result !== 'wrong' };
            }
            cloth = assembleClothRecord({
              matchId: match.matchId,
              home: { tri: fx.home.code, ink: fx.home.colors[0] },
              away: { tri: fx.away.code, ink: fx.away.colors[0] },
              score: [score.home, score.away],
              root: record.side ?? null,
              beliefPath: accumulators.get(match.matchId)?.getBeliefPath() ?? [],
              record: latestSentimentRecordOnDisk(match.matchId),
              nextGoalLog: match.fanStatsFor(grant.anonId)?.nextGoalLog ?? [],
              outcome,
              ks: {
                editionNo: fanNo,
                owner: pubkey,
                call: outcome
                  ? { label: `CALLED ${outcome.sub}${result === 'exact' ? ' · EXACT' : outcome.hit ? ' · OUTCOME' : ' · MISSED'}`, hit: outcome.hit }
                  : null,
              },
            });
          }
          mint = await mintScarfForClaim(record, score, { result, fanNo, cloth });
        } catch (err) {
          console.warn(`[seat] mint threw unexpectedly for ${pubkey.slice(0, 8)}: ${String(err)}`);
        }
      }
    }
    sendJson(res, 200, { profile, mint, ...(mintNote ? { mintNote } : {}) });
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
        // adopt-#1: on room join, make sure this match's fixtureInfo exists before
        // the replay below — a first-ever joiner for a known fixture gets it in
        // THIS join's own burst, not just future joiners (idempotent; see doc
        // comment on ensureFixtureInfoSent).
        try { ensureFixtureInfoSent(mid); } catch (err) { console.warn(`[fixtureInfo] emit failed for ${mid}: ${String(err)} - join replay continues`); }
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

  return { httpServer, wss, registry, port: PORT, broadcastToMatch, ensureFixtureInfoSent };
}

/* ── SELF-PROBE DEAD-MAN (Jul 11 NOR–ENG wedge post-mortem) ───────────────
 * The wedge's proven shape: the event loop stayed ALIVE (4 Hz stands ticks
 * still reached established sockets as late as 22:18Z; timers fine) while the
 * ACCEPT PATH died — Fly's own /health checks (which hit the machine
 * directly, 2s timeout) failed with "context deadline exceeded", fresh WS
 * joins got 0 messages or 503, curl timed out awaiting headers, for 40+
 * minutes, and a machine restart fixed everything instantly. Whatever
 * exhausts in the guest (fd table / kernel memory on a 256mb machine / a
 * rotting accept backlog), the process cannot serve NEW connections but sees
 * no error it could react to — so it probes ITSELF through the same real
 * listener external traffic uses, and exits nonzero after N consecutive
 * failures. Fly's restart policy reboots the machine — turning a silent
 * multi-hour outage into a bounded ~2-minute self-heal, with a loud log line
 * naming exactly why. The external ops dead-man stays as the backstop for the
 * one mode this cannot catch (a HARD-blocked loop never runs this timer).
 *
 * Called by index.ts once the real port is known. Deliberately NOT armed
 * inside createStandsServer: dev checks import the server module and manage
 * their own lifecycles — a self-exiting process would poison them.
 * Env: SELF_PROBE_INTERVAL_MS (default 30s, floor 1s) · SELF_PROBE_TIMEOUT_MS
 * (default 5s, floor 250ms) · SELF_PROBE_MAX_MISSES (default 4, floor 1) ·
 * SELF_PROBE_DISABLE=1 kills the whole mechanism. */
export function armSelfProbe(actualPort: number): () => void {
  if (process.env.SELF_PROBE_DISABLE === '1') {
    console.log('[stands:selfprobe] disabled by env (SELF_PROBE_DISABLE=1)');
    return () => {};
  }
  const intervalRaw = Number(process.env.SELF_PROBE_INTERVAL_MS ?? 30_000);
  const intervalMs = Number.isFinite(intervalRaw) ? Math.max(1_000, intervalRaw) : 30_000;
  const timeoutRaw = Number(process.env.SELF_PROBE_TIMEOUT_MS ?? 5_000);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.max(250, timeoutRaw) : 5_000;
  const missesRaw = Number(process.env.SELF_PROBE_MAX_MISSES ?? 4);
  const maxMisses = Number.isFinite(missesRaw) ? Math.max(1, Math.floor(missesRaw)) : 4;

  let misses = 0;
  const miss = (reason: string): void => {
    misses++;
    console.warn(`[stands:selfprobe] /health self-probe failed (${misses}/${maxMisses}): ${reason}`);
    if (misses >= maxMisses) {
      console.error(
        `[stands:selfprobe] WEDGED — ${maxMisses} consecutive self-probes failed over ~${Math.round((maxMisses * intervalMs) / 1000)}s; the accept path is dead while this process still runs (Jul 11 NOR–ENG signature). Exiting 1 for a supervisor restart.`,
      );
      process.exit(1);
    }
  };
  const timer = setInterval(() => {
    const req = httpGet({ host: '127.0.0.1', port: actualPort, path: '/health', timeout: timeoutMs }, (res) => {
      res.resume(); // drain — the status line is the whole verdict
      if (res.statusCode === 200) misses = 0;
      else miss(`http ${res.statusCode}`);
    });
    req.on('timeout', () => req.destroy(new Error(`no response headers within ${timeoutMs}ms`)));
    req.on('error', (err) => miss(String(err)));
  }, intervalMs);
  console.log(`[stands:selfprobe] armed — every ${intervalMs}ms, ${timeoutMs}ms timeout, exit after ${maxMisses} consecutive misses`);
  return () => clearInterval(timer);
}
