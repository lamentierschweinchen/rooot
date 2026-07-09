/**
 * Dev-only DEVNET PROOF (NOT part of the service — never imported by src/index.ts): drives the
 * REAL Task 6b claim -> mint -> album loop end-to-end through the actual HTTP routes (not a
 * hand-rolled reimplementation) —
 *
 *   1. boots createStandsServer() in-process on an ephemeral port (no TxLINE/replay ingest —
 *      those are wired in index.ts's main(), not createStandsServer() itself);
 *   2. seeds ONE real match (a fixture from sentiment/teams.ts's FIXTURE_INFO) with a rooted
 *      side + a locked prediction for one anonId, directly on the MatchState — the same real
 *      per-anonId state bindClaim folds from in production, just seeded here instead of arriving
 *      over the crowd WebSocket;
 *   3. POSTs /seat/claim for a throwaway devnet-valid pubkey (generated, never funded — the
 *      service pays; mirrors mint/scripts/proveOwnedMint.ts's unfunded-fan pattern);
 *   4. GETs /seat/album and asserts the minted scarf round-trips with the exact matchId/side/call
 *      the match was seeded with (retries a few times — DAS indexing can lag a few seconds after
 *      a mint confirms).
 *
 * Usage (from services/stands): needs a funded .secrets/mint-devnet.json (mint/keypair.ts) —
 *   STANDS_SNAPSHOT_PATH=/tmp/prove-claim-mint-snapshot.json ROOOT_SEAT_DIR=/tmp/prove-claim-mint-seat \
 *     npx tsx src/dev/prove-claim-mint.ts
 * (the env overrides keep this proof from touching a real dev server's snapshot/profile files).
 */
import { Keypair } from '@solana/web3.js';
import { createStandsServer } from '../server';

const MATCH_ID = '18198205'; // POR vs ESP — a real sentiment/teams.ts FIXTURE_INFO entry
const ANON_ID = `prove-claim-mint-${Date.now()}`;
const SEEDED_SIDE = 'home' as const;
const SEEDED_CALL = { home: 2, away: 1 };

function fail(msg: string): never {
  console.error(`[prove] FAILED: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

async function fetchAlbumWithRetry(base: string, pubkey: string, wantAsset: string, tries = 6): Promise<any> {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`${base}/seat/album?pubkey=${pubkey}`);
    const body = (await res.json()) as { scarves?: Array<{ asset: string }> };
    const scarf = body.scarves?.find((s) => s.asset === wantAsset);
    if (scarf) return { res, body, scarf };
    console.log(`[prove] album attempt ${i + 1}/${tries}: asset not indexed yet, retrying in 2s…`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { res: null, body: null, scarf: null };
}

async function main(): Promise<void> {
  const { httpServer, registry } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://localhost:${port}`;
  console.log(`[prove] server up on ${base}`);

  // Seed a REAL rooted side + locked prediction for one anonId — bindClaim folds these off
  // MatchState's real accessors, never invents them (see seat/claim.ts).
  const match = registry.getOrCreate(MATCH_ID);
  match.markConnected(ANON_ID);
  match.root(ANON_ID, SEEDED_SIDE);
  match.predict(ANON_ID, SEEDED_CALL.home, SEEDED_CALL.away, Date.now());
  match.lockPredictions();

  const fan = Keypair.generate(); // throwaway, NEVER funded — the service pays, fan just needs a pubkey
  const pubkey = fan.publicKey.toBase58();
  console.log(`[prove] fan pubkey (unfunded): ${pubkey}`);

  console.log('[prove] POST /seat/claim …');
  const claimRes = await fetch(`${base}/seat/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ anonId: ANON_ID, pubkey, method: 'privy', matchId: MATCH_ID }),
  });
  const claimBody = (await claimRes.json()) as {
    profile?: unknown;
    mint?: { asset: string; txUrl: string } | null;
  };
  console.log(`[prove] POST /seat/claim -> ${claimRes.status}`);
  console.log(JSON.stringify(claimBody, null, 2));

  if (claimRes.status !== 200 || !claimBody.mint) {
    fail('claim did not return a mint (see [seat:mint] warnings above for why)');
  }
  const mint = claimBody.mint!;
  console.log(`[prove] minted asset: ${mint.asset}`);
  console.log(`[prove] tx:           ${mint.txUrl}`);

  console.log('[prove] GET /seat/album (retrying for DAS indexing lag) …');
  const { res: albumRes, body: albumBody, scarf } = await fetchAlbumWithRetry(base, pubkey, mint.asset);
  if (!scarf) {
    fail('minted asset never appeared in /seat/album (DAS indexing lag beyond retry budget?)');
  }
  console.log(`[prove] GET /seat/album -> ${albumRes!.status}`);
  console.log(JSON.stringify(albumBody, null, 2));

  const okMatchId = scarf.matchId === MATCH_ID;
  const okSide = scarf.side === SEEDED_SIDE;
  const okCall = scarf.call?.home === SEEDED_CALL.home && scarf.call?.away === SEEDED_CALL.away;
  if (!okMatchId || !okSide || !okCall) {
    fail(`scarf attributes mismatch: ${JSON.stringify(scarf)}`);
  }

  console.log('\n[prove] OK — album scarf matches the seeded claim exactly:');
  console.log(`  matchId ${scarf.matchId} · side ${scarf.side} · call ${scarf.call.home}-${scarf.call.away}`);

  httpServer.close();
  registry.stop();
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error('[prove] error:', e);
  process.exit(1);
});
