/**
 * SEAL ON JOIN CHECK (fix-forward gate) — proves a fan who joins a match AFTER
 * full time still receives the sealed sentiment record.
 *
 * The bug: crystallizeSentiment broadcasts {type:'sentiment', record} ONLY to
 * sockets already seated in the room at the instant it crystallizes (a plain
 * broadcastToMatch fan-out). A socket that connects LATER gets replaySnapshot's
 * join replay (oddsHistory/eventHistory/status/score/… from the joinSnapshots
 * cache) — which never included the sealed record — so a post-FT joiner's room
 * stayed "LIVE at 123'" forever: no verdict card, no Collect. Verified live
 * tonight in the walkthrough rig ahead of the 19:00 UTC match.
 *
 * Drives the REAL server module in-process (createStandsServer + the real
 * broadcastToMatch dispatch — no reimplementation; same idiom as
 * anchor-durability-check.ts / mem-evict-check.ts), devnet-free (no
 * RELAYER_KEYPAIR — irrelevant here anyway: the record write is synchronous
 * and unconditional on the async anchor).
 *
 * Cases:
 *   1. red→green — drive a REAL fixture to FULL_TIME (crystallizes: one
 *      sentiment file lands on disk), then open a FRESH ws client the exact
 *      way the real client does (stands-adapter.js: connect with ?matchId=,
 *      hello follows on open) and assert its join replay carries
 *      {type:'sentiment', record} for THIS match, sent to it ALONE (not a
 *      second room broadcast), plus the FULL_TIME status that flips the
 *      client out of "LIVE" mode. RED on main (nothing arrives); GREEN with
 *      the join-path fix. Also proves a REAL fan join (hello, not just a
 *      feed-only spectator) gets it too.
 *   2. disk-driven / cold memory (the restart proxy) — close every socket in
 *      the match's room, then sweep the registry's eviction past every grace
 *      window (mem-evict-check.ts's proven mechanism for "memory cold, disk
 *      file intact": clears joinSnapshots/resolvedMatches/accumulators/etc,
 *      never touches the sentiment file on disk). A brand new fresh join
 *      STILL gets the SAME record (identical recordHash) — proving the fix
 *      reads disk, not any in-memory cache that eviction (or a restart) wipes.
 *   3. negative — a genuinely unresolved match (never reaches FULL_TIME) gets
 *      NO sentiment message on join; nothing is ever fabricated.
 *
 * Usage: tsx src/dev/seal-on-join-check.ts (or: npm run check:seal-on-join)
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import type { FeedMsg } from '@contracts/feed';
import type { SentimentRecord } from '@contracts/sentiment';

// ── env FIRST, before any dynamic import of the server (snapshot.ts resolves
// DATA_DIR at import time — same idiom as anchor-durability-check.ts /
// mem-evict-check.ts). ──────────────────────────────────────────────────────
const CHECK_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rooot-seal-on-join-'));
process.env.STANDS_DATA_DIR = CHECK_DATA_DIR;
process.env.STANDS_SNAPSHOT_PATH = path.join(CHECK_DATA_DIR, 'snapshot.json');
process.env.STANDS_SNAPSHOT_INTERVAL_MS = String(60 * 60_000); // no periodic churn
process.env.STANDS_EVICT_SWEEP_MS = String(60 * 60_000); // the check drives sweeps explicitly
// Devnet isolation (same convention as next-goal-check / mem-evict-check /
// anchor-durability-check): strip RELAYER_KEYPAIR + point RELAYER_KEYPAIR_FILE
// at a nonexistent path so crystallize's fire-and-forget anchor can NEVER
// attempt a real devnet tx from this check.
delete process.env.RELAYER_KEYPAIR;
process.env.RELAYER_KEYPAIR_FILE = path.join(CHECK_DATA_DIR, 'no-such-keypair.json');
process.env.SELF_PROBE_DISABLE = '1';

const SENTIMENT_DIR = path.join(CHECK_DATA_DIR, 'sentiment');

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function recordFilesFor(matchId: string): string[] {
  try {
    return readdirSync(SENTIMENT_DIR).filter((f) => f.startsWith(`${matchId}-`) && f.endsWith('.json'));
  } catch {
    return [];
  }
}

type AnyMsg = Record<string, any>;
function sentimentMsgsOf(msgs: AnyMsg[]): AnyMsg[] {
  return msgs.filter((m) => m && m.type === 'sentiment');
}
function typesOf(msgs: AnyMsg[]): string {
  return [...new Set(msgs.map((m) => m?.type))].join(', ');
}

async function main(): Promise<void> {
  const { createStandsServer, perMatchStateFootprint } = await import('../server');
  const { FT_EVICT_GRACE_MS } = await import('../registry');

  const srv = createStandsServer();
  const { httpServer, registry } = srv;
  const broadcast = srv.broadcastToMatch;
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  console.log(`[seal-on-join] server up on :${port}, dataDir=${CHECK_DATA_DIR}`);

  const openSockets: WebSocket[] = [];

  /** A fresh feed-only join — the exact shape the real client connects with
   * (stands-adapter.js always opens ws://…?matchId=<id> first; hello follows
   * on open). Collects every message this socket receives. */
  async function freshJoin(matchId: string, settleMs = 200): Promise<{ ws: WebSocket; messages: AnyMsg[] }> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?matchId=${matchId}`);
    openSockets.push(ws);
    const messages: AnyMsg[] = [];
    ws.on('message', (data) => {
      try {
        messages.push(JSON.parse(data.toString()) as AnyMsg);
      } catch {
        /* ignore unparsable */
      }
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    await sleep(settleMs); // catch the whole replaySnapshot burst
    return { ws, messages };
  }

  /** A real fan join: connect (?matchId=, same as freshJoin) THEN hello with a
   * side — the actual stands-adapter.js sequence, not just a feed spectator. */
  async function freshFanJoin(matchId: string, anonId: string, settleMs = 200): Promise<{ ws: WebSocket; messages: AnyMsg[] }> {
    const { ws, messages } = await freshJoin(matchId, 0);
    ws.send(JSON.stringify({ type: 'hello', matchId, anonId, side: 'home' }));
    await sleep(settleMs);
    return { ws, messages };
  }

  async function closeAndWait(ws: WebSocket): Promise<void> {
    if (ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve());
      ws.close();
    });
  }

  try {
    /* ═════ case 1 — red→green: a fresh post-FT join gets the seal ═══════ */
    console.log('[seal-on-join] case 1: a fan joining AFTER full time receives the sealed sentiment record on join');
    const MATCH_A = '18175918'; // real fixture id (ARG–CPV) — crystallize bails for an unknown one
    registry.getOrCreate(MATCH_A); // predictLifecycle's FULL_TIME branch needs the match in the registry
    const now = Date.now();
    const feedA: FeedMsg[] = [
      { type: 'status', ev: { tMs: now, phase: 'FIRST_HALF', minute: 0, source: 'replay' } },
      { type: 'score', ev: { tMs: now + 1, minute: 90, home: 2, away: 1, source: 'replay' } },
      { type: 'status', ev: { tMs: now + 2, phase: 'FULL_TIME', minute: 90, source: 'replay' } },
    ];
    for (const m of feedA) broadcast(MATCH_A, m);
    // THE SEAL is deferred (Codex pre-match review, findings 1+3): crystallize
    // fires once the full-time reaction window (25s) closes, so wait for the
    // artifact rather than the old same-tick synchronous write.
    const sealBy = Date.now() + 60_000;
    while (recordFilesFor(MATCH_A).length === 0 && Date.now() < sealBy) await sleep(500);

    const filesA = recordFilesFor(MATCH_A);
    check('setup: FULL_TIME crystallized exactly one sentiment record on disk', filesA.length === 1, `files=${JSON.stringify(filesA)}`);
    if (filesA.length !== 1) {
      console.log(`\n${failures} CHECK(S) FAILED (cannot proceed without the record)\n`);
      process.exit(1);
    }

    const { ws: joinerWs, messages: joinerMsgs } = await freshJoin(MATCH_A);
    const sentimentMsgs = sentimentMsgsOf(joinerMsgs);
    check(
      'RED→GREEN: a FRESH client joining AFTER full time receives {type:"sentiment"} in its join replay',
      sentimentMsgs.length >= 1,
      `received ${joinerMsgs.length} msg(s), types=[${typesOf(joinerMsgs)}]`,
    );
    const deliveredRecord = sentimentMsgs[0]?.record as SentimentRecord | undefined;
    check("the delivered record is THIS match's record (matchId matches)", deliveredRecord?.matchId === MATCH_A, `record.matchId=${deliveredRecord?.matchId}`);
    check(
      'the delivered record carries a real recordHash (not fabricated)',
      typeof deliveredRecord?.provenance?.recordHash === 'string' && deliveredRecord.provenance.recordHash.length === 64,
      `hash=${deliveredRecord?.provenance?.recordHash?.slice(0, 12)}`,
    );
    check('the seal was sent to THIS socket exactly once (not a second room broadcast)', sentimentMsgs.length === 1, `count=${sentimentMsgs.length}`);
    check(
      'the FULL_TIME status rides the SAME join replay (what flips the client out of "LIVE" mode)',
      joinerMsgs.some((m) => m?.type === 'status' && m.ev?.phase === 'FULL_TIME'),
      `types=[${typesOf(joinerMsgs)}]`,
    );

    // a REAL fan (hello + side), not just a feed-only spectator, gets it too.
    const { ws: fanWs, messages: fanMsgs } = await freshFanJoin(MATCH_A, 'fan-post-ft');
    check('a REAL fan join (hello, post-FT) also receives the seal', sentimentMsgsOf(fanMsgs).length >= 1, `types=[${typesOf(fanMsgs)}]`);

    /* ═════ case 2 — disk-driven: cold memory, disk file intact ═════════ */
    console.log('[seal-on-join] case 2: memory evicted (cold) — a fresh join STILL gets the seal, proving it is disk-driven');
    // zero out every open socket in this match's room first — sweepEvictions'
    // hard gate refuses to evict a watched match (mem-evict-check.ts PART 2).
    for (const ws of openSockets) await closeAndWait(ws);
    await sleep(80);
    registry.sweepEvictions(Date.now() + FT_EVICT_GRACE_MS + 60_000); // past the FT grace, zero clients
    const footprint = perMatchStateFootprint(MATCH_A);
    const stillLive = Object.entries(footprint).filter(([, v]) => v).map(([k]) => k);
    check('memory is genuinely cold: registry entry gone', registry.get(MATCH_A) === undefined);
    check(
      'memory is genuinely cold: EVERY per-match map cleared (joinSnapshots/resolvedMatches/accumulators/…)',
      stillLive.length === 0,
      stillLive.length ? `still holding: ${stillLive.join(', ')}` : 'all clear',
    );
    check('the sentiment record FILE survives eviction untouched on disk', recordFilesFor(MATCH_A).length === 1, `files=${JSON.stringify(recordFilesFor(MATCH_A))}`);

    const { ws: coldJoinerWs, messages: coldJoinerMsgs } = await freshJoin(MATCH_A);
    const coldSentimentMsgs = sentimentMsgsOf(coldJoinerMsgs);
    check(
      'DISK-DRIVEN: a fresh join against a COLD (evicted) match still receives the seal',
      coldSentimentMsgs.length >= 1,
      `received ${coldJoinerMsgs.length} msg(s), types=[${typesOf(coldJoinerMsgs)}]`,
    );
    const coldRecord = coldSentimentMsgs[0]?.record as SentimentRecord | undefined;
    check(
      "the cold-join record matches the pre-eviction recordHash (SAME durable record, never re-crystallized)",
      !!coldRecord && coldRecord.provenance?.recordHash === deliveredRecord?.provenance?.recordHash,
      `before=${deliveredRecord?.provenance?.recordHash?.slice(0, 12)} after=${coldRecord?.provenance?.recordHash?.slice(0, 12)}`,
    );

    /* ═════ case 3 — negative: an unresolved match sends nothing ════════ */
    console.log('[seal-on-join] case 3: a genuinely unresolved (LIVE) match sends NO sentiment message on join — never fabricated');
    const MATCH_B = '18176123'; // a different real fixture id, kept live — no FULL_TIME ever dispatched
    registry.getOrCreate(MATCH_B);
    const liveFeed: FeedMsg[] = [
      { type: 'status', ev: { tMs: Date.now(), phase: 'SECOND_HALF', minute: 60, source: 'replay' } },
      { type: 'score', ev: { tMs: Date.now() + 1, minute: 60, home: 1, away: 0, source: 'replay' } },
    ];
    for (const m of liveFeed) broadcast(MATCH_B, m);
    await sleep(80);
    check('setup: no sentiment record exists on disk for the unresolved match', recordFilesFor(MATCH_B).length === 0, `files=${JSON.stringify(recordFilesFor(MATCH_B))}`);

    const { ws: liveJoinerWs, messages: liveJoinerMsgs } = await freshJoin(MATCH_B);
    check(
      'a fresh join to a LIVE (unresolved) match receives NO sentiment message',
      sentimentMsgsOf(liveJoinerMsgs).length === 0,
      `types=[${typesOf(liveJoinerMsgs)}]`,
    );
    check(
      '…yet the ordinary join replay still works (live status/score still ride it)',
      liveJoinerMsgs.some((m) => m?.type === 'status' && m.ev?.phase === 'SECOND_HALF'),
      `types=[${typesOf(liveJoinerMsgs)}]`,
    );

    await closeAndWait(fanWs);
    await closeAndWait(coldJoinerWs);
    await closeAndWait(liveJoinerWs);
    void joinerWs; // already closed in the case-2 cleanup loop above
  } finally {
    for (const ws of openSockets) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    registry.stop?.();
    httpServer.close();
    rmSync(CHECK_DATA_DIR, { recursive: true, force: true });
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[seal-on-join] FATAL', err);
  process.exit(1);
});
