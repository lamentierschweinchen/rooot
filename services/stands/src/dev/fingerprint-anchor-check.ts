/**
 * FINGERPRINT ANCHOR + MINT IMMUTABILITY CHECK — proves adopt-item #5
 * (docs/DATA-ARCHITECTURE.md §4): the sellable per-fan dataset gets an
 * on-chain commitment, and the minted scarf's immutability is a real,
 * built-into-the-mint-call fact — not just a claim in a doc comment.
 *
 * Drives the REAL server module in-process (createStandsServer + the real
 * crystallizeSentiment -> refoldAndAnchorFingerprints path — no
 * reimplementation), devnet-free via the same two seams anchor-durability-
 * check.ts uses:
 *   · RELAYER_KEYPAIR_FILE -> a nonexistent path (no keypair) so the LIVE
 *     anchor returns null until the stub is armed.
 *   · STANDS_ANCHOR_STUB   -> makes relay.ts's anchorRecordHash return a
 *     deterministic STUB… sig derived from `${kind}:${recordHash}` WITHOUT
 *     touching devnet — which lets this check assert the exact expected
 *     stub value and thereby PROVE kind:'fingerprints' was actually used
 *     (not just that some anchor fired), with no log-scraping.
 *
 * Cases:
 *   0. empty dir      — refoldAndAnchorFingerprints() no-ops safely (no
 *                        sentiment dir yet), never throws, writes nothing.
 *   1. RED            — a REAL match crystallizes (stub off, no keypair):
 *                        fingerprints.json is written with the fold + a real
 *                        recordHash, anchorTxSig stays null (the live anchor
 *                        attempt failed silently, exactly like the per-match
 *                        record's own RED case).
 *   2. GREEN + kind    — a SECOND match crystallizes with the stub armed:
 *                        the fold grows (2 -> 4 fanbases), the hash changes,
 *                        and anchorTxSig becomes EXACTLY the independently-
 *                        recomputed `kind:'fingerprints'` stub value — proof
 *                        the new kind param actually reached anchorRecordHash.
 *   3. stale-guard     — refoldAndAnchorFingerprints() is called directly,
 *                        then the file is overwritten to simulate a NEWER
 *                        seal landing before the in-flight anchor's write-
 *                        back resolves; the stale sig must NOT be merged
 *                        onto the newer fold (law #1: a sig must match the
 *                        hash it's attached to).
 *   4. mint immutability — mint/mint.ts's buildCreateArgs (the exact args
 *                        mintRelic passes to mpl-core's create()) carries a
 *                        PermanentFreezeDelegate{frozen:true} plugin — pure,
 *                        no devnet write, asserts the BUILT PARAMS directly.
 *
 * Usage: tsx src/dev/fingerprint-anchor-check.ts (or: npm run check:fingerprint-anchor)
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FeedMsg } from '@contracts/feed';
import type { FanbaseSentiment } from '@contracts/sentiment';

// ── env FIRST, before any dynamic import of the server (snapshot.ts resolves
// DATA_DIR at import time — same idiom as anchor-durability-check.ts). ─────
const CHECK_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rooot-fingerprint-anchor-'));
process.env.STANDS_DATA_DIR = CHECK_DATA_DIR;
process.env.STANDS_SNAPSHOT_PATH = path.join(CHECK_DATA_DIR, 'snapshot.json');
process.env.STANDS_SNAPSHOT_INTERVAL_MS = String(60 * 60_000);
// Devnet isolation — identical discipline to anchor-durability-check.ts.
delete process.env.RELAYER_KEYPAIR;
process.env.RELAYER_KEYPAIR_FILE = path.join(CHECK_DATA_DIR, 'no-such-keypair.json');
delete process.env.STANDS_ANCHOR_STUB;
process.env.SELF_PROBE_DISABLE = '1';

const SENTIMENT_DIR = path.join(CHECK_DATA_DIR, 'sentiment');
const FP_PATH = path.join(SENTIMENT_DIR, 'fingerprints.json');

interface FingerprintsFileShape {
  version: 1;
  fanbases: Record<string, FanbaseSentiment>;
  provenance: { recordHash: string; anchorTxSig: string | null };
}

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function readFp(): FingerprintsFileShape {
  return JSON.parse(readFileSync(FP_PATH, 'utf8')) as FingerprintsFileShape;
}
/** independently recomputes relay.ts's stub sig — the SAME formula, kept
 * separate on purpose so this check proves the real code's output, not a
 * tautology against itself. */
function expectedStubSig(kind: string, recordHash: string): string {
  return `STUB${createHash('sha256').update(`${kind}:${recordHash}`).digest('hex').slice(0, 40)}`;
}

async function main(): Promise<void> {
  const { createStandsServer, refoldAndAnchorFingerprints } = await import('../server');

  const srv = createStandsServer();
  const broadcast = srv.broadcastToMatch;

  /* ═════ case 0 — empty dir: no-op, never throws ════════════════════════ */
  console.log('[fingerprint-anchor] case 0: refold with no sentiment dir yet is a safe no-op');
  const r0 = refoldAndAnchorFingerprints();
  check('case0: returns null (nothing to fold)', r0 === null, JSON.stringify(r0));

  /* ═════ case 1 — RED: a real match seal folds + writes, anchor fails silently ═ */
  console.log('[fingerprint-anchor] case 1: a real match seal writes fingerprints.json (live anchor lost — no keypair, stub off)');
  const MATCH_A = '18175918'; // ARG–CPV — a real sentiment/teams.ts fixture
  srv.registry.getOrCreate(MATCH_A);
  const t0 = Date.now();
  const feedA: FeedMsg[] = [
    { type: 'status', ev: { tMs: t0, phase: 'FIRST_HALF', minute: 0, source: 'replay' } },
    { type: 'score', ev: { tMs: t0 + 1, minute: 90, home: 2, away: 1, source: 'replay' } },
    { type: 'status', ev: { tMs: t0 + 2, phase: 'FULL_TIME', minute: 90, source: 'replay' } },
  ];
  for (const m of feedA) broadcast(MATCH_A, m);
  // THE SEAL is deferred (Codex pre-match review, findings 1+3): crystallize —
  // and the fingerprints refold it triggers — fire once the full-time reaction
  // window (25s) closes, so wait for the artifact rather than a fixed beat.
  {
    const by = Date.now() + 60_000;
    const folded = (): boolean => {
      try {
        return readdirSync(SENTIMENT_DIR).includes('fingerprints.json');
      } catch {
        return false;
      }
    };
    while (!folded() && Date.now() < by) await sleep(500);
  }
  await sleep(200); // let the async anchor .then settle

  check('case1: fingerprints.json exists on disk', readdirSync(SENTIMENT_DIR).includes('fingerprints.json'));
  let fp = readFp();
  check('case1: version 1', fp.version === 1, `version=${String(fp.version)}`);
  check('case1: both fanbases from the one match are present, contributing once each', fp.fanbases.ARG?.matchesContributed === 1 && fp.fanbases.CPV?.matchesContributed === 1, JSON.stringify(fp.fanbases));
  check('case1: exactly 2 fanbases so far', Object.keys(fp.fanbases).length === 2, JSON.stringify(Object.keys(fp.fanbases)));
  check('case1: a real 64-hex recordHash', typeof fp.provenance.recordHash === 'string' && /^[0-9a-f]{64}$/.test(fp.provenance.recordHash), fp.provenance.recordHash);
  check(
    'case1 RED: anchorTxSig stays null (the live anchor attempt had no keypair and no stub — same fire-and-forget loss the per-match record tolerates)',
    fp.provenance.anchorTxSig === null,
    `anchorTxSig=${String(fp.provenance.anchorTxSig)}`,
  );
  const hashAfterMatch1 = fp.provenance.recordHash;

  /* ═════ case 2 — GREEN + kind proof: a second seal re-folds + anchors with kind:'fingerprints' ═ */
  console.log("[fingerprint-anchor] case 2: a second match's seal re-folds (2->4 fanbases) and lands a stub sig proving kind:'fingerprints'");
  process.env.STANDS_ANCHOR_STUB = '1';
  const MATCH_B = '18176123'; // AUS–EGY — distinct fixture, distinct fanbases
  srv.registry.getOrCreate(MATCH_B);
  const t1 = Date.now();
  const feedB: FeedMsg[] = [
    { type: 'status', ev: { tMs: t1, phase: 'FIRST_HALF', minute: 0, source: 'replay' } },
    { type: 'score', ev: { tMs: t1 + 1, minute: 90, home: 1, away: 0, source: 'replay' } },
    { type: 'status', ev: { tMs: t1 + 2, phase: 'FULL_TIME', minute: 90, source: 'replay' } },
  ];
  for (const m of feedB) broadcast(MATCH_B, m);
  // deferred seal again (see case 1): match B's crystallize — and the refold it
  // triggers — land once its own full-time reaction window closes.
  {
    const by = Date.now() + 60_000;
    const grown = (): boolean => {
      try {
        return Object.keys(readFp().fanbases).length === 4;
      } catch {
        return false;
      }
    };
    while (!grown() && Date.now() < by) await sleep(500);
  }
  await sleep(200); // let the async anchor .then settle

  fp = readFp();
  check('case2: the fold grew to 4 fanbases (ARG/CPV from match 1 + AUS/EGY from match 2)', Object.keys(fp.fanbases).length === 4, JSON.stringify(Object.keys(fp.fanbases)));
  check('case2: AUS/EGY present, each contributing once', fp.fanbases.AUS?.matchesContributed === 1 && fp.fanbases.EGY?.matchesContributed === 1, JSON.stringify(fp.fanbases));
  check('case2: ARG/CPV are UNCHANGED by the refold (still matchesContributed:1, not double-counted)', fp.fanbases.ARG?.matchesContributed === 1 && fp.fanbases.CPV?.matchesContributed === 1, JSON.stringify(fp.fanbases));
  check("case2: the recordHash changed (it's a fresh fold, not the match-1-only hash)", fp.provenance.recordHash !== hashAfterMatch1, `before=${hashAfterMatch1.slice(0, 12)} after=${fp.provenance.recordHash.slice(0, 12)}`);
  const expected = expectedStubSig('fingerprints', fp.provenance.recordHash);
  check(
    "case2 GREEN + kind proof: anchorTxSig is EXACTLY the independently-recomputed kind:'fingerprints' stub (proves the live call used the new kind param, not just that SOME anchor landed)",
    fp.provenance.anchorTxSig === expected,
    `got=${String(fp.provenance.anchorTxSig)} expected=${expected}`,
  );

  /* ═════ case 3 — stale-anchor guard: a superseded fold must not be clobbered ═ */
  console.log('[fingerprint-anchor] case 3: an in-flight anchor for an OLD hash must not clobber a NEWER fold that lands first (honesty: sig must match its hash)');
  const r3 = refoldAndAnchorFingerprints(); // kicks off a fire-and-forget anchor for the CURRENT hash
  check('case3: refold returns a synchronous result', r3 !== null && typeof r3.recordHash === 'string', JSON.stringify(r3));
  const raceHash = 'f'.repeat(64);
  const raceFile: FingerprintsFileShape = {
    version: 1,
    fanbases: { ZZZ: { fanbase: 'ZZZ', optimism: 0, volatility: 0, foresight: 0, loyalty: 0, matchesContributed: 1 } },
    provenance: { recordHash: raceHash, anchorTxSig: null },
  };
  writeFileSync(FP_PATH, JSON.stringify(raceFile, null, 2)); // simulate a NEWER seal landing before case 3's anchor .then resolves
  await sleep(150); // let the in-flight anchor's write-back attempt run
  const afterRace = readFp();
  check("case3: the newer fold's recordHash is untouched by the stale write-back", afterRace.provenance.recordHash === raceHash, `got=${afterRace.provenance.recordHash}`);
  check('case3: the newer fold\'s anchorTxSig stays null (the stale sig was correctly refused, never merged onto a hash it does not match)', afterRace.provenance.anchorTxSig === null, `anchorTxSig=${String(afterRace.provenance.anchorTxSig)}`);

  srv.httpServer.close();

  /* ═════ case 4 — mint immutability: the plugin is in the create() params ═ */
  console.log('[fingerprint-anchor] case 4: mintRelic\'s create() params carry a permanent immutability plugin, in the SAME call');
  const { buildCreateArgs } = await import('../mint/mint');
  const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
  const { generateSigner } = await import('@metaplex-foundation/umi');
  const umi = createUmi('http://127.0.0.1:9'); // unroutable on purpose — generateSigner is pure local crypto, no network
  const dummyAsset = generateSigner(umi);
  const dummyOwner = generateSigner(umi).publicKey;
  const dummyRelic = {
    fixture: {
      id: 'check-fixture',
      home: { code: 'POR', name: 'Portugal', colors: ['#006600', '#FF0000'], flag: '🇵🇹' },
      away: { code: 'ESP', name: 'Spain', colors: ['#AA151B', '#F1BF00'], flag: '🇪🇸' },
      kickoffISO: '2026-07-06T00:00:00Z',
    },
    // buildOnChainName only reads .fixture — the rest of MatchRelicData is irrelevant to this check.
  } as unknown as Parameters<typeof buildCreateArgs>[1];
  const args = buildCreateArgs(dummyAsset, dummyRelic, 'https://example.com/meta.json', String(dummyOwner), undefined);
  const plugins = (args.plugins ?? []) as Array<{ type: string; frozen?: boolean }>;
  const frozen = plugins.find((p) => p.type === 'PermanentFreezeDelegate');
  check('case4: create() params carry a PermanentFreezeDelegate plugin', !!frozen, JSON.stringify(plugins));
  check('case4: the plugin is frozen:true (not just declared)', frozen?.frozen === true, JSON.stringify(frozen));
  check('case4: name/uri/owner still built alongside the plugin (the buildCreateArgs refactor did not regress the existing fields)', typeof args.name === 'string' && args.name.length > 0 && args.uri === 'https://example.com/meta.json' && String(args.owner) === String(dummyOwner), JSON.stringify({ name: args.name, uri: args.uri, owner: String(args.owner) }));

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

process.once('exit', () => rmSync(CHECK_DATA_DIR, { recursive: true, force: true }));
main().catch((err) => {
  console.error('[fingerprint-anchor] FATAL', err);
  process.exit(1);
});
