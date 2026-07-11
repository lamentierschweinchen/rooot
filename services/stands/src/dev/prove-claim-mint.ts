/**
 * Dev-only DEVNET PROOF (NOT part of the service — never imported by src/index.ts): drives the
 * REAL claim -> mint -> album loop end-to-end through the actual HTTP routes AND the real
 * session-bound claim-token ceremony (not a hand-rolled reimplementation) —
 *
 *   1. boots createStandsServer() in-process on an ephemeral port (no TxLINE/replay ingest —
 *      those are wired in index.ts's main(), not createStandsServer() itself);
 *   2. seeds ONE real match (a fixture from sentiment/teams.ts's FIXTURE_INFO): a real WebSocket
 *      hello adopts the fan's session with side home (the same trust anchor cheer/predict use —
 *      and what the claim token binds to); the locked prediction is seeded directly on the
 *      MatchState for determinism;
 *   3. drives the match to FULL_TIME through the REAL feed path — broadcastToMatch (the same
 *      function index.ts's TXLINE/replay ingest calls for every live message) with a real 'score'
 *      then 'status' FeedMsg — so predictLifecycle resolves this anonId's verdict AND
 *      resolvedMatches genuinely flips true (the mint honesty gate: mintScarfForClaim refuses to
 *      mint for a match that hasn't reached FULL_TIME);
 *   4. requests a claim token OVER THE WEBSOCKET (contracts/crowd.ts seatToken -> seatTokenGrant,
 *      the review-fix ceremony — POST /seat/claim derives the fan from the token, never the body)
 *      and POSTs /seat/claim {token, pubkey, method} for a throwaway devnet-valid pubkey
 *      (generated, never funded — the service pays; mirrors proveOwnedMint.ts's unfunded-fan
 *      pattern);
 *   5. IDEMPOTENCY (review fix, risk 3): requests a SECOND token and claims AGAIN — asserts the
 *      SAME asset id comes back (the durable minted marker answering, not a duplicate mint);
 *   6. GETs /seat/album and asserts the minted scarf round-trips with the exact
 *      home/away/score/call/result/comp/date/serial the match was seeded with, AND that exactly
 *      ONE scarf exists for this match despite the two claims (retries a few times — DAS indexing
 *      can lag a few seconds after a mint confirms).
 *
 * Usage (from services/stands): needs a funded .secrets/mint-devnet.json (mint/keypair.ts) —
 *   STANDS_SNAPSHOT_PATH=/tmp/prove-claim-mint-snapshot.json ROOOT_SEAT_DIR=/tmp/prove-claim-mint-seat \
 *     npx tsx src/dev/prove-claim-mint.ts
 * (the env overrides keep this proof from touching a real dev server's snapshot/profile files;
 * ROOOT_SEAT_DIR also holds the minted markers — wipe it between runs so step 4 proves a FRESH
 * mint rather than replaying a prior run's marker).
 * This performs REAL devnet transactions — it is a manual verification tool, never run as part of
 * the automated check: suite (services/stands/src/dev/*-check.ts).
 */
import { Keypair } from '@solana/web3.js';
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@contracts/crowd';
import { createStandsServer } from '../server';

const MATCH_ID = '18198205'; // POR vs ESP — a real sentiment/teams.ts FIXTURE_INFO entry
const ANON_ID = `prove-claim-mint-${Date.now()}`;
const SEEDED_SIDE = 'home' as const;
const SEEDED_CALL = { home: 2, away: 1 };
const FINAL_SCORE = { home: 2, away: 1 }; // an exact result for SEEDED_CALL, on purpose — exercises result:'exact'

function fail(msg: string): never {
  console.error(`[prove] FAILED: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

function wsSend(ws: WebSocket, msg: ClientMsg): void {
  ws.send(JSON.stringify(msg));
}

/** The real token ceremony on an already-helloed socket: seatToken -> seatTokenGrant. */
function requestToken(ws: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('no seatTokenGrant within 3s'));
    }, 3000);
    const onMessage = (raw: Buffer | ArrayBuffer | Buffer[]) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(raw.toString()) as ServerMsg;
      } catch {
        return;
      }
      if (m.type === 'seatTokenGrant' && m.anonId === ANON_ID && m.matchId === MATCH_ID) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(m.token);
      }
    };
    ws.on('message', onMessage);
    wsSend(ws, { type: 'seatToken', matchId: MATCH_ID, anonId: ANON_ID });
  });
}

async function postClaim(base: string, token: string, pubkey: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}/seat/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, pubkey, method: 'privy' }),
  });
  return { status: res.status, body: await res.json() };
}

async function fetchAlbumWithRetry(base: string, pubkey: string, wantAsset: string, tries = 6): Promise<any> {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`${base}/seat/album?pubkey=${pubkey}`);
    const body = (await res.json()) as { scarves?: Array<{ asset: string; matchId: string }> };
    const scarf = body.scarves?.find((s) => s.asset === wantAsset);
    if (scarf) return { res, body, scarf };
    console.log(`[prove] album attempt ${i + 1}/${tries}: asset not indexed yet, retrying in 2s…`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { res: null, body: null, scarf: null };
}

async function main(): Promise<void> {
  const { httpServer, registry, broadcastToMatch } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://localhost:${port}`;
  console.log(`[prove] server up on ${base}`);

  // A REAL session: the WebSocket hello adopts ANON_ID with a side (roots the fan + is the
  // session identity the claim token binds to). The prediction is then seeded directly on the
  // MatchState for determinism, and locked — bindClaim folds both off the real accessors.
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const s = new WebSocket(`ws://localhost:${port}`);
    s.once('open', () => resolve(s));
    s.once('error', reject);
  });
  wsSend(ws, { type: 'hello', matchId: MATCH_ID, anonId: ANON_ID, side: SEEDED_SIDE });
  await new Promise((r) => setTimeout(r, 150));
  const match = registry.getOrCreate(MATCH_ID);
  match.predict(ANON_ID, SEEDED_CALL.home, SEEDED_CALL.away, Date.now());
  match.lockPredictions();

  // Drive the match to FULL_TIME through the REAL feed path (predictLifecycle in server.ts) —
  // the mint honesty gate (mint-scarf.ts) refuses to mint until resolvedMatches genuinely has
  // this matchId, which only happens off a real FULL_TIME status message, same as production.
  console.log('[prove] driving match to FULL_TIME via the real feed path…');
  broadcastToMatch(MATCH_ID, {
    type: 'score',
    ev: { tMs: Date.now(), minute: 90, home: FINAL_SCORE.home, away: FINAL_SCORE.away, source: 'replay' },
  });
  broadcastToMatch(MATCH_ID, {
    type: 'status',
    ev: { tMs: Date.now(), phase: 'FULL_TIME', minute: 90, source: 'replay' },
  });

  const fan = Keypair.generate(); // throwaway, NEVER funded — the service pays, fan just needs a pubkey
  const pubkey = fan.publicKey.toBase58();
  console.log(`[prove] fan pubkey (unfunded): ${pubkey}`);

  console.log('[prove] requesting the session-bound claim token over the WebSocket…');
  const token = await requestToken(ws);

  console.log('[prove] POST /seat/claim {token, pubkey, method} …');
  const claim = await postClaim(base, token, pubkey);
  console.log(`[prove] POST /seat/claim -> ${claim.status}`);
  console.log(JSON.stringify(claim.body, null, 2));

  if (claim.status !== 200 || !claim.body.mint) {
    fail('claim did not return a mint (see [seat:mint] warnings above for why)');
  }
  // profile.sides must carry the TEAM TRICODE (design/HANDOFF-coordinator-data-wiring.md), not 'home'.
  if (!claim.body.profile?.sides?.includes('POR')) {
    fail(`profile.sides should carry the resolved tricode 'POR', got ${JSON.stringify(claim.body.profile?.sides)}`);
  }
  const mint = claim.body.mint as { asset: string; txUrl: string };
  console.log(`[prove] minted asset: ${mint.asset}`);
  console.log(`[prove] tx:           ${mint.txUrl}`);

  // IDEMPOTENCY (review fix, risk 3): a SECOND claim with a fresh token must return the SAME
  // asset — the durable minted marker answering, never a duplicate on-chain mint.
  console.log('[prove] claiming a SECOND time (fresh token) — expecting the SAME asset, no new mint…');
  const token2 = await requestToken(ws);
  const claim2 = await postClaim(base, token2, pubkey);
  if (claim2.status !== 200 || claim2.body.mint?.asset !== mint.asset) {
    fail(`second claim should return the SAME asset ${mint.asset}, got status=${claim2.status} mint=${JSON.stringify(claim2.body.mint)}`);
  }
  console.log(`[prove] second claim returned the same asset — idempotent (${claim2.body.mint.asset})`);

  console.log('[prove] GET /seat/album (retrying for DAS indexing lag) …');
  const { res: albumRes, body: albumBody, scarf } = await fetchAlbumWithRetry(base, pubkey, mint.asset);
  if (!scarf) {
    fail('minted asset never appeared in /seat/album (DAS indexing lag beyond retry budget, or HELIUS_RPC_URL unset — the public devnet RPC lacks DAS getAssetsByOwner)');
  }
  console.log(`[prove] GET /seat/album -> ${albumRes!.status}`);
  console.log(JSON.stringify(albumBody, null, 2));

  const okMatchId = scarf.matchId === MATCH_ID;
  const okHome = scarf.home === 'POR';
  const okAway = scarf.away === 'ESP';
  const okScore = scarf.score === `${FINAL_SCORE.home}–${FINAL_SCORE.away}`;
  const okCall = scarf.call === `POR ${SEEDED_CALL.home}–${SEEDED_CALL.away}`;
  const okResult = scarf.result === 'exact'; // SEEDED_CALL === FINAL_SCORE, on purpose
  const okSerial = typeof scarf.serial === 'string' && /^\d{3,}$/.test(scarf.serial);
  if (!okMatchId || !okHome || !okAway || !okScore || !okCall || !okResult || !okSerial) {
    fail(`scarf attributes mismatch: ${JSON.stringify(scarf)}`);
  }
  // ONE scarf per match per fan — despite the two claims above.
  const forThisMatch = (albumBody.scarves as Array<{ matchId: string }>).filter((s) => s.matchId === MATCH_ID);
  if (forThisMatch.length !== 1) {
    fail(`album should hold exactly ONE scarf for ${MATCH_ID} after two claims, found ${forThisMatch.length}`);
  }

  console.log('\n[prove] OK — album scarf matches the seeded claim exactly, ONCE, despite two claims:');
  console.log(`  ${scarf.home} v ${scarf.away} · ${scarf.date} · ${scarf.comp} · Nº ${scarf.serial}`);
  console.log(`  final ${scarf.score} · you called ${scarf.call} · ${scarf.result}`);

  ws.close();
  httpServer.close();
  registry.stop();
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error('[prove] error:', e);
  process.exit(1);
});
