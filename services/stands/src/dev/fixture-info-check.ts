/**
 * FIXTURE INFO CHECK (adopt-#1, docs/DATA-ARCHITECTURE.md §4) — proves the
 * server actually emits the `fixtureInfo` FeedMsg that contracts/feed.ts
 * already declared and the client adapters already had handling stubs for
 * (loom-adapter.js, match-read.js) — until this fix, nothing ever sent one
 * (server.ts only case-handled it defensively inside rememberForJoin's
 * switch). Kills the 8-file fixture/team hardcode by making team REFERENCE
 * data (names, tri-codes, colors) flow from services/stands/src/sentiment/
 * teams.ts's FIXTURE_INFO, the server's single source, instead of each
 * surface re-typing its own copy.
 *
 * Drives the REAL server module in-process (createStandsServer + the real
 * broadcastToMatch/ensureFixtureInfoSent — no reimplementation; same idiom as
 * seal-on-join-check.ts / anchor-durability-check.ts), devnet-free.
 *
 * Cases:
 *   1. room join (the ?matchId= WS-connect path, where replaySnapshot runs) —
 *      a fresh join to a KNOWN fixture (in sentiment/teams.ts's FIXTURE_INFO)
 *      receives {type:'fixtureInfo'} in its join-replay burst, with the exact
 *      team data teams.ts carries for that matchId (never fabricated).
 *   2. unknown fixture -> room join sends NO fixtureInfo message, ever —
 *      never invented.
 *   3. "match creation" (index.ts's ingest-boot hook, simulated here by
 *      calling the exported ensureFixtureInfoSent directly, standing in for
 *      what index.ts does once per TXLINE_FIXTURES/REPLAY_FIXTURE entry) —
 *      pre-seeding a match BEFORE any client ever connects means the FIRST
 *      joiner already has it in their own join-replay burst.
 *   4. room join ALONE already suffices — connecting to a known fixture's
 *      room delivers fixtureInfo immediately (the join handler calls
 *      ensureFixtureInfoSent itself, before replaySnapshot runs), so a
 *      match-creation call for the SAME fixture arriving AFTER a socket has
 *      already joined is a safe, idempotent no-op — never a second/duplicate
 *      broadcast to that already-seated socket.
 *   5. idempotent — calling ensureFixtureInfoSent twice for the same match
 *      broadcasts exactly once; an already-seated socket never sees a
 *      duplicate.
 *
 * Usage: tsx src/dev/fixture-info-check.ts (or: npm run check:fixture-info)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const CHECK_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rooot-fixture-info-'));
process.env.STANDS_DATA_DIR = CHECK_DATA_DIR;
process.env.STANDS_SNAPSHOT_PATH = path.join(CHECK_DATA_DIR, 'snapshot.json');
process.env.STANDS_SNAPSHOT_INTERVAL_MS = String(60 * 60_000);
process.env.STANDS_EVICT_SWEEP_MS = String(60 * 60_000);
delete process.env.RELAYER_KEYPAIR;
process.env.RELAYER_KEYPAIR_FILE = path.join(CHECK_DATA_DIR, 'no-such-keypair.json');
process.env.SELF_PROBE_DISABLE = '1';

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type AnyMsg = Record<string, any>;
function fixtureInfoMsgsOf(msgs: AnyMsg[]): AnyMsg[] {
  return msgs.filter((m) => m && m.type === 'fixtureInfo');
}
function typesOf(msgs: AnyMsg[]): string {
  return [...new Set(msgs.map((m) => m?.type))].join(', ');
}

async function main(): Promise<void> {
  const { createStandsServer } = await import('../server');
  const { fixtureInfo } = await import('../sentiment/teams');

  const srv = createStandsServer();
  const { httpServer } = srv;
  const ensureFixtureInfoSent = srv.ensureFixtureInfoSent;
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  console.log(`[fixture-info] server up on :${port}, dataDir=${CHECK_DATA_DIR}`);

  const openSockets: WebSocket[] = [];

  /** A fresh feed-only join — the exact shape the real client connects with
   * (every adapter opens ws://…?matchId=<id> first). Collects every message
   * this socket receives from the moment it opens. */
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
    await sleep(settleMs);
    return { ws, messages };
  }

  try {
    /* ═════ case 1 — room join: a known fixture gets the real teams.ts data ═════ */
    console.log('[fixture-info] case 1: room join to a KNOWN fixture receives fixtureInfo built from sentiment/teams.ts');
    const MATCH_A = '18175918'; // ARG–CPV, a real entry in FIXTURE_INFO
    const expectedA = fixtureInfo(MATCH_A);
    check('setup: teams.ts actually knows this fixture', !!expectedA, `fixtureInfo(${MATCH_A})=${JSON.stringify(expectedA)}`);

    const { messages: msgsA } = await freshJoin(MATCH_A);
    const fxMsgsA = fixtureInfoMsgsOf(msgsA);
    check('RED→GREEN: a fresh join receives {type:"fixtureInfo"} in its join replay', fxMsgsA.length >= 1, `received ${msgsA.length} msg(s), types=[${typesOf(msgsA)}]`);
    const fixtureA = fxMsgsA[0]?.fixture;
    check('carries a valid Fixture.id (the matchId — never blank)', fixtureA?.id === MATCH_A, `id=${fixtureA?.id}`);
    check("home team matches teams.ts exactly (code/name/colors — never fabricated)",
      !!expectedA && fixtureA?.home?.code === expectedA.home.code && fixtureA?.home?.name === expectedA.home.name &&
      fixtureA?.home?.colors?.[0] === expectedA.home.colors[0] && fixtureA?.home?.colors?.[1] === expectedA.home.colors[1],
      `home=${JSON.stringify(fixtureA?.home)}`);
    check("away team matches teams.ts exactly (code/name/colors — never fabricated)",
      !!expectedA && fixtureA?.away?.code === expectedA.away.code && fixtureA?.away?.name === expectedA.away.name &&
      fixtureA?.away?.colors?.[0] === expectedA.away.colors[0] && fixtureA?.away?.colors?.[1] === expectedA.away.colors[1],
      `away=${JSON.stringify(fixtureA?.away)}`);
    check('home.flag is present (contracts/match.ts TeamRef.flag is required — defaults to the tri-code)', fixtureA?.home?.flag === expectedA?.home.code, `flag=${fixtureA?.home?.flag}`);
    check('kickoffISO is a non-empty string (contracts/match.ts Fixture.kickoffISO is required)', typeof fixtureA?.kickoffISO === 'string' && fixtureA.kickoffISO.length > 0, `kickoffISO=${fixtureA?.kickoffISO}`);
    check('exactly one fixtureInfo arrived (not a duplicate burst)', fxMsgsA.length === 1, `count=${fxMsgsA.length}`);

    /* ═════ case 2 — negative: an unknown fixture sends nothing, ever ═════ */
    console.log('[fixture-info] case 2: room join to an UNKNOWN fixture sends NO fixtureInfo — never invented');
    const MATCH_UNKNOWN = '99999999'; // not in FIXTURE_INFO
    check('setup: teams.ts genuinely does not know this fixture', fixtureInfo(MATCH_UNKNOWN) === null);
    const { messages: msgsUnknown } = await freshJoin(MATCH_UNKNOWN);
    check('a fresh join to an unknown fixture receives NO fixtureInfo message', fixtureInfoMsgsOf(msgsUnknown).length === 0, `types=[${typesOf(msgsUnknown)}]`);
    // calling the match-creation hook directly for the same unknown id must also stay silent.
    ensureFixtureInfoSent(MATCH_UNKNOWN);
    await sleep(80);
    check('…and calling ensureFixtureInfoSent directly for it ALSO stays silent (no crash, no broadcast)', fixtureInfoMsgsOf(msgsUnknown).length === 0);

    /* ═════ case 3 — match creation: pre-seeded BEFORE any client connects ═════ */
    console.log('[fixture-info] case 3: "match creation" (ensureFixtureInfoSent called before any join, simulating index.ts ingest-boot) — the FIRST joiner already has it');
    const MATCH_B = '18176123'; // AUS–EGY, another real FIXTURE_INFO entry
    ensureFixtureInfoSent(MATCH_B);
    await sleep(50);
    const { messages: msgsB } = await freshJoin(MATCH_B);
    check('a join AFTER match-creation pre-seeding already carries fixtureInfo', fixtureInfoMsgsOf(msgsB).length >= 1, `types=[${typesOf(msgsB)}]`);

    /* ═════ case 4 — room join alone suffices; a later match-creation call is a safe no-op ═════ */
    console.log('[fixture-info] case 4: room join delivers fixtureInfo immediately; a match-creation call for the same fixture right after never double-sends');
    const MATCH_C = '18179549'; // COL–GHA, another real FIXTURE_INFO entry
    const { messages: msgsC } = await freshJoin(MATCH_C, 80);
    check('the join handler itself already delivered fixtureInfo (calls ensureFixtureInfoSent before replaySnapshot)', fixtureInfoMsgsOf(msgsC).length === 1, `types=[${typesOf(msgsC)}]`);
    ensureFixtureInfoSent(MATCH_C); // the "match creation" moment (index.ts's ingest-boot hook), arriving AFTER this socket already joined
    await sleep(120);
    check('a redundant match-creation call for the same fixture never double-sends to the already-seated socket', fixtureInfoMsgsOf(msgsC).length === 1, `types=[${typesOf(msgsC)}]`);

    /* ═════ case 5 — idempotent: a second call never double-broadcasts ═════ */
    console.log('[fixture-info] case 5: calling ensureFixtureInfoSent again for an already-sent match is a no-op (idempotent)');
    ensureFixtureInfoSent(MATCH_C);
    ensureFixtureInfoSent(MATCH_C);
    await sleep(100);
    check('no additional fixtureInfo arrived at the already-seated socket', fixtureInfoMsgsOf(msgsC).length === 1, `still count=${fixtureInfoMsgsOf(msgsC).length}`);
  } finally {
    for (const ws of openSockets) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    srv.registry.stop?.();
    httpServer.close();
    rmSync(CHECK_DATA_DIR, { recursive: true, force: true });
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[fixture-info] FATAL', err);
  process.exit(1);
});
