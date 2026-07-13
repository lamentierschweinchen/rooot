/**
 * ANCHOR DURABILITY CHECK (fix-forward gate) — proves a crystallized sentiment
 * record reliably carries the on-chain signature it earned, even when the LIVE
 * write-back is lost. The bug this guards: memos landed on devnet, yet the
 * persisted records read `anchorTxSig: null`, because the fire-and-forget `.then`
 * in crystallizeSentiment can die to the confirmation timeout, a machine
 * suspend, or an OOM before it resolves.
 *
 * Drives the REAL server module in-process (createStandsServer + the real
 * crystallize and backfillAnchors functions — no reimplementation), devnet-free
 * via two seams:
 *   · RELAYER_KEYPAIR_FILE → a nonexistent path (no keypair) so the LIVE anchor
 *     returns null — faithfully reproducing "the sig write-back was lost" (same
 *     devnet-isolation discipline as next-goal-check / restart-persistence-check).
 *   · STANDS_ANCHOR_STUB   → makes relay.ts's anchorRecordHash return a
 *     deterministic STUB… sig WITHOUT touching devnet, so the backfill can
 *     "land" a sig for the record to recover.
 *
 * Cases:
 *   1. red→green — a REAL crystallize with the live anchor lost writes a record
 *      with anchorTxSig:null (RED); backfillAnchors() fills it with a sig (GREEN),
 *      keeping the SAME recordHash and still EXACTLY ONE file for that match (no
 *      re-crystallize, no duplicate — proves it doesn't regress the C1 on-disk
 *      idempotence guard).
 *   2. idempotent — a second backfill leaves the now-anchored record byte-for-
 *      byte untouched (a record that already has a sig is skipped).
 *   3. disk-only / evicted — backfill fills a record for a match with NO
 *      in-memory state (never fed through the server; only the file exists),
 *      anchoring THAT record's own persisted hash.
 *   4. no-keypair no-op — with the stub off and no keypair, backfill leaves a
 *      null-sig record null and never throws.
 *
 * Usage: tsx src/dev/anchor-durability-check.ts (or: npm run check:anchor-durability)
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FeedMsg } from '@contracts/feed';
import type { SentimentRecord } from '@contracts/sentiment';

// ── env FIRST, before any dynamic import of the server (snapshot.ts resolves
// DATA_DIR at import time — hence the dynamic import in main(), same idiom as
// mem-evict-check / next-goal-check). ──────────────────────────────────────
const CHECK_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rooot-anchor-durability-'));
process.env.STANDS_DATA_DIR = CHECK_DATA_DIR;
process.env.STANDS_SNAPSHOT_PATH = path.join(CHECK_DATA_DIR, 'snapshot.json');
// keep the periodic snapshot timer from churning during the check.
process.env.STANDS_SNAPSHOT_INTERVAL_MS = String(60 * 60_000);
// Devnet isolation: strip RELAYER_KEYPAIR + point RELAYER_KEYPAIR_FILE at a
// nonexistent path so the LIVE anchor (and case 4's backfill) return null WITHOUT
// ever touching devnet. STANDS_ANCHOR_STUB is what lets the backfill land a sig,
// toggled per-case below (relay.ts reads it fresh each call).
delete process.env.RELAYER_KEYPAIR;
process.env.RELAYER_KEYPAIR_FILE = path.join(CHECK_DATA_DIR, 'no-such-keypair.json');
delete process.env.STANDS_ANCHOR_STUB;
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
function readRecord(filePath: string): SentimentRecord {
  return JSON.parse(readFileSync(filePath, 'utf8')) as SentimentRecord;
}

async function main(): Promise<void> {
  const { createStandsServer, backfillAnchors } = await import('../server');

  const srv = createStandsServer();
  const broadcast = srv.broadcastToMatch;

  /* ═════ case 1 — red→green: real crystallize, lost live anchor, backfill heals ═ */
  console.log('[anchor-durability] case 1: real crystallize with the live anchor lost → backfill fills the sig');
  const MATCH_A = '18175918'; // a REAL fixture id (ARG–CPV) — crystallize bails for an unknown one
  srv.registry.getOrCreate(MATCH_A); // predictLifecycle's FULL_TIME branch needs the match in the registry
  const now = Date.now();
  const feed: FeedMsg[] = [
    { type: 'status', ev: { tMs: now, phase: 'FIRST_HALF', minute: 0, source: 'replay' } }, // locks predictions
    { type: 'score', ev: { tMs: now + 1, minute: 90, home: 2, away: 1, source: 'replay' } }, // the final score joinSnapshots caches
    { type: 'status', ev: { tMs: now + 2, phase: 'FULL_TIME', minute: 90, source: 'replay' } }, // → crystallize
  ];
  for (const m of feed) broadcast(MATCH_A, m);
  await sleep(120); // let crystallize's synchronous write + the async live-anchor .then settle

  let filesA = recordFilesFor(MATCH_A);
  check('case1: crystallize wrote EXACTLY ONE sentiment record file', filesA.length === 1, `files=${JSON.stringify(filesA)}`);
  if (filesA.length !== 1) {
    console.log(`\n${failures} CHECK(S) FAILED (cannot proceed without the record)\n`);
    process.exit(1);
  }
  const filePathA = path.join(SENTIMENT_DIR, filesA[0]!);
  let recA = readRecord(filePathA);
  const hashBefore = recA.provenance.recordHash;
  check(
    'case1 RED: the freshly-crystallized record carries anchorTxSig:null (the live write-back was lost — no keypair)',
    recA.provenance.anchorTxSig === null,
    `anchorTxSig=${String(recA.provenance.anchorTxSig)}`,
  );
  check('case1: the record carries a real recordHash to re-anchor', typeof hashBefore === 'string' && hashBefore.length === 64, `hash=${hashBefore?.slice(0, 12)}`);

  // GREEN — a relayer that lands a sig (stub), then the durable sweep.
  process.env.STANDS_ANCHOR_STUB = '1';
  const r1 = await backfillAnchors();
  filesA = recordFilesFor(MATCH_A);
  recA = readRecord(filePathA);
  check(
    'case1 GREEN: backfill filled anchorTxSig with a landed sig',
    typeof recA.provenance.anchorTxSig === 'string' && (recA.provenance.anchorTxSig?.length ?? 0) > 0,
    `anchorTxSig=${recA.provenance.anchorTxSig?.slice(0, 14)}…`,
  );
  check('case1: backfill kept the SAME recordHash (only the sig was filled — never re-hashed)', recA.provenance.recordHash === hashBefore, `before=${hashBefore.slice(0, 12)} after=${recA.provenance.recordHash.slice(0, 12)}`);
  check('case1: STILL exactly one record file for the match (no re-crystallize, no duplicate — C1 intact)', filesA.length === 1, `files=${JSON.stringify(filesA)}`);
  check('case1: backfill tally reports exactly one fill', r1.filled === 1 && r1.scanned >= 1, JSON.stringify(r1));

  /* ═════ case 2 — idempotent: a record with a sig is left untouched ═════════ */
  console.log('[anchor-durability] case 2: a second sweep leaves the already-anchored record untouched');
  const contentAfterFill = readFileSync(filePathA, 'utf8');
  const r2 = await backfillAnchors(); // stub still on
  check('case2: the already-anchored record is byte-for-byte unchanged by a re-sweep', readFileSync(filePathA, 'utf8') === contentAfterFill);
  check('case2: the sweep filled nothing and counted the record as already-ok', r2.filled === 0 && r2.alreadyOk >= 1, JSON.stringify(r2));

  /* ═════ case 3 — disk-only: heal a record for a NEVER-loaded (evicted) match ═ */
  console.log('[anchor-durability] case 3: backfill heals a record for a match with NO in-memory state (disk only)');
  const MATCH_C = `evicted-${Date.now()}`; // never fed to the server → no accumulator, no registry, no resolvedMatches
  const orphanHashC = 'c'.repeat(64);
  const orphanC: SentimentRecord = {
    ...JSON.parse(JSON.stringify(recA)),
    matchId: MATCH_C,
    provenance: { ...recA.provenance, recordHash: orphanHashC, anchorTxSig: null },
  };
  const orphanPathC = path.join(SENTIMENT_DIR, `${MATCH_C}-${Date.now()}.json`);
  writeFileSync(orphanPathC, JSON.stringify(orphanC, null, 2));
  const r3 = await backfillAnchors(); // stub on
  const orphanCAfter = readRecord(orphanPathC);
  check(
    'case3 disk-only: backfill anchored a record for a match with NO in-memory state (file only)',
    typeof orphanCAfter.provenance.anchorTxSig === 'string' && (orphanCAfter.provenance.anchorTxSig?.length ?? 0) > 0,
    `anchorTxSig=${orphanCAfter.provenance.anchorTxSig?.slice(0, 14)}…`,
  );
  check("case3: it anchored THAT record's own persisted hash (unchanged)", orphanCAfter.provenance.recordHash === orphanHashC);
  check('case3: exactly this one new fill (the case-1 record already had a sig → not re-filled)', r3.filled === 1, JSON.stringify(r3));

  /* ═════ case 4 — no-keypair no-op: null stays null, no throw ═══════════════ */
  console.log('[anchor-durability] case 4: no keypair + no stub → backfill no-ops on a null-sig record without throwing');
  delete process.env.STANDS_ANCHOR_STUB; // stub OFF → anchorRecordHash falls through to the (absent) keypair → null
  const MATCH_D = `nokey-${Date.now()}`;
  const orphanHashD = 'd'.repeat(64);
  const orphanD: SentimentRecord = {
    ...JSON.parse(JSON.stringify(recA)),
    matchId: MATCH_D,
    provenance: { ...recA.provenance, recordHash: orphanHashD, anchorTxSig: null },
  };
  const orphanPathD = path.join(SENTIMENT_DIR, `${MATCH_D}-${Date.now()}.json`);
  writeFileSync(orphanPathD, JSON.stringify(orphanD, null, 2));
  let threw = false;
  let r4: Awaited<ReturnType<typeof backfillAnchors>> | null = null;
  try {
    r4 = await backfillAnchors();
  } catch {
    threw = true;
  }
  const orphanDAfter = readRecord(orphanPathD);
  check('case4: backfill did NOT throw with no keypair available', !threw);
  check('case4: the null-sig record is left null (no keypair, no stub → nothing to write)', orphanDAfter.provenance.anchorTxSig === null, `anchorTxSig=${String(orphanDAfter.provenance.anchorTxSig)}`);
  check('case4: tally counts it still-null with zero fills', !!r4 && r4.filled === 0 && r4.stillNull >= 1, JSON.stringify(r4));
  // and the two already-anchored records must not be clobbered by the keyless sweep
  check('case4: the previously-anchored records keep their sigs (no clobber on a keyless sweep)', readRecord(filePathA).provenance.anchorTxSig !== null && readRecord(orphanPathC).provenance.anchorTxSig !== null);

  srv.httpServer.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

process.once('exit', () => rmSync(CHECK_DATA_DIR, { recursive: true, force: true }));
main().catch((err) => {
  console.error('[anchor-durability] FATAL', err);
  process.exit(1);
});
