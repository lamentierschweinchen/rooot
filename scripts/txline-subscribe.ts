/**
 * TxLINE devnet subscribe + activate + verify — the real flow, not a spike.
 *
 * Mirrors docs/txline/example/users.ts (setupUser) and
 * docs/txline/example/subscription_free_tier.ts EXACTLY: same instruction name,
 * same accounts/PDA seeds, same activation message format. Do not improvise
 * shapes here — if the API disagrees with docs/txline/*, this script should
 * fail loudly rather than guess.
 *
 * Flow:
 *   1. Load keypair + guest JWT (re-fetch via POST /auth/guest/start if stale).
 *   2. Ensure SOL (airdrop retries; stop cleanly if the faucet is dry).
 *   3. On-chain `subscribe(serviceLevelId, weeks)` against the txoracle program.
 *   4. Sign `${txSig}:${leagues.join(",")}:${jwt}`, POST /api/token/activate.
 *   5. Save .secrets/txline-token.json (never print the full token).
 *   6. Verify GET /api/fixtures/snapshot — find the named World Cup fixtures.
 *   7. Stream test: /api/odds/stream + /api/scores/stream for ~60s, sample to
 *      fixtures/stream-sample.jsonl.
 *
 * Usage: npm run subscribe
 */
import * as anchor from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import nacl from 'tweetnacl';
import txoracleIdl from '../docs/txline/txoracle.idl.json' with { type: 'json' };

// ---- parameters (verified against docs/txline/example/config.ts, the IDL, and
// docs/txline/quickstart.html devnet block — not guessed) --------------------
const API = process.env.TXLINE_API ?? 'https://txline-dev.txodds.com';
const API_BASE = `${API}/api`; // matches example/config.ts API_BASE_URL exactly
const JWT_URL = `${API}/auth/guest/start`;
const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';

// devnet program id — verified against docs/txline/quickstart.html's `devnet:` config
// block, which pairs 6pW64g... with apiOrigin txline-dev.txodds.com. The vendored
// IDL's embedded `address` field (9ExbZjA...) is the MAINNET id — same program logic,
// different deployment, so we override programAddress at Program construction time.
const PROGRAM_ID = new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J');
const TOKEN_MINT = new PublicKey('4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG');

const SERVICE_LEVEL = Number(process.env.TXLINE_LEVEL ?? 12); // World Cup real-time, FREE
const WEEKS = Number(process.env.TXLINE_WEEKS ?? 4); // must be multiple of 4; covers Jul 19
const SELECTED_LEAGUES: number[] = []; // empty = standard/legacy matrix subscription (per openapi ActivationPayload docs)

const KEY_PATH = '.secrets/rooot-devnet.json';
const GUEST_JWT_PATH = '.secrets/txline-guest.json';
const TOKEN_PATH = '.secrets/txline-token.json';
const STREAM_SAMPLE_PATH = 'fixtures/stream-sample.jsonl';
const STREAM_DURATION_MS = 60_000;

// Fixtures we're hunting for (per task): tonight + Jul 4/5/6 World Cup matches.
const WANTED_FIXTURES = [
  'Argentina', 'Cape Verde', 'Colombia', 'Ghana', // tonight
  'Canada', 'Morocco', 'France', 'Paraguay', // Jul 4
  'Brazil', 'Norway', 'Mexico', 'England', // Jul 5
  'Spain', 'Portugal', 'USA', 'Belgium', // Jul 6
];

function log(step: string, msg: string) {
  console.log(`[subscribe:${step}] ${msg}`);
}

function loadKeypair(): Keypair {
  if (!existsSync(KEY_PATH)) {
    throw new Error(`${KEY_PATH} not found — this script expects an existing devnet keypair, not a fresh one.`);
  }
  const raw = JSON.parse(readFileSync(KEY_PATH, 'utf8')) as number[];
  const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
  log('key', `loaded ${KEY_PATH} — pubkey ${kp.publicKey.toBase58()}`);
  return kp;
}

async function fetchGuestJwt(): Promise<string> {
  log('jwt', `POST ${JWT_URL}`);
  const res = await fetch(JWT_URL, { method: 'POST' });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`guest JWT fetch failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const body = JSON.parse(text) as Record<string, unknown>;
  const jwt = (body['token'] ?? body['jwt'] ?? body['accessToken']) as string | undefined;
  if (typeof jwt !== 'string') {
    throw new Error(`guest JWT response missing token field. keys: ${Object.keys(body).join(', ')}`);
  }
  mkdirSync('.secrets', { recursive: true });
  writeFileSync(GUEST_JWT_PATH, JSON.stringify({ jwt, at: new Date().toISOString() }));
  log('jwt', `acquired (${jwt.length} chars), saved ${GUEST_JWT_PATH}`);
  return jwt;
}

function decodeJwtExpiryMs(jwt: string): number | null {
  try {
    const payloadB64 = jwt.split('.')[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8')) as Record<string, unknown>;
    const exp = payload['exp'];
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

async function loadOrRefreshJwt(): Promise<string> {
  if (existsSync(GUEST_JWT_PATH)) {
    try {
      const saved = JSON.parse(readFileSync(GUEST_JWT_PATH, 'utf8')) as { jwt: string };
      const expMs = decodeJwtExpiryMs(saved.jwt);
      const stillValid = expMs !== null && expMs > Date.now() + 60_000; // 1 min slack
      if (stillValid) {
        log('jwt', `reusing ${GUEST_JWT_PATH} (valid until ${new Date(expMs!).toISOString()})`);
        return saved.jwt;
      }
      log('jwt', 'saved JWT missing/expired — refreshing');
    } catch {
      log('jwt', 'saved JWT unreadable — refreshing');
    }
  } else {
    log('jwt', `${GUEST_JWT_PATH} not found — fetching new guest session`);
  }
  return fetchGuestJwt();
}

async function ensureSol(conn: Connection, pubkey: PublicKey): Promise<boolean> {
  const bal = await conn.getBalance(pubkey);
  log('sol', `balance ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (bal >= 0.05 * LAMPORTS_PER_SOL) return true;

  const amounts = [LAMPORTS_PER_SOL, 0.5 * LAMPORTS_PER_SOL, 0.2 * LAMPORTS_PER_SOL];
  const backoffsMs = [5_000, 8_000, 10_000];

  for (const amountLamports of amounts) {
    const amountSol = amountLamports / LAMPORTS_PER_SOL;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        log('sol', `requesting airdrop of ${amountSol} SOL (attempt ${attempt}/3)…`);
        const sig = await conn.requestAirdrop(pubkey, amountLamports);
        await conn.confirmTransaction(sig, 'confirmed');
        const newBal = await conn.getBalance(pubkey);
        log('sol', `airdrop confirmed ${sig.slice(0, 16)}… — balance now ${(newBal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
        if (newBal >= 0.05 * LAMPORTS_PER_SOL) return true;
      } catch (e) {
        log('sol', `airdrop of ${amountSol} SOL failed (${String(e).slice(0, 150)})`);
      }
      const backoff = backoffsMs[attempt - 1] ?? 10_000;
      log('sol', `backing off ${backoff / 1000}s before retry…`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  return false;
}

interface SubscribeResult {
  txSig: string;
  userTokenAccountAddress: PublicKey;
}

/**
 * Executes the on-chain `subscribe` instruction exactly as
 * docs/txline/example/users.ts does: same PDA seeds ("pricing_matrix",
 * "token_treasury_v2"), same account list, same TOKEN_2022 program for the
 * user's ATA, same manual sign+send+confirm sequence (not .rpc()).
 */
async function subscribeOnChain(
  connection: Connection,
  program: anchor.Program,
  user: Keypair,
): Promise<SubscribeResult> {
  const userTokenAccountAddress = getAssociatedTokenAddressSync(
    TOKEN_MINT,
    user.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pricing_matrix')],
    program.programId,
  );

  // Discover pricing matrix — informational, matches users.ts's discoverPricingMatrix()
  try {
    const matrix = await (program.account as any).pricingMatrix.fetch(pricingMatrixPda);
    log('pricing', `matrix admin: ${(matrix.admin as PublicKey).toBase58()}`);
    log('pricing', 'level  tokens/wk  sampling(s)  leagueBundle  marketBundle');
    for (const row of matrix.rows as any[]) {
      log(
        'pricing',
        `${String(row.rowId).padStart(5)}  ${String(row.pricePerWeekToken).padStart(9)}  ${String(row.samplingIntervalSec).padStart(11)}  ${String(row.leagueBundleId).padStart(12)}  ${String(row.marketBundleId).padStart(12)}`,
      );
    }
  } catch (e) {
    log('pricing', `could not fetch pricing matrix (non-fatal, continuing): ${String(e).slice(0, 150)}`);
  }

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const accountInfo = await connection.getAccountInfo(userTokenAccountAddress);

  if (!accountInfo) {
    log('ata', 'creating user Token-2022 account…');
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        user.publicKey,
        userTokenAccountAddress,
        user.publicKey,
        TOKEN_MINT,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    const sig = await anchor.web3.sendAndConfirmTransaction(connection, tx, [user], { commitment: 'confirmed' });
    log('ata', `account created (${sig.slice(0, 16)}…)`);
    await delay(3000);
  } else {
    log('ata', 'user Token-2022 account already exists');
  }

  let userTokenAccount;
  let attempts = 0;
  while (attempts < 5) {
    try {
      userTokenAccount = await getAccount(connection, userTokenAccountAddress, 'confirmed', TOKEN_2022_PROGRAM_ID);
      break;
    } catch (err: any) {
      if (err.name === 'TokenAccountNotFoundError') {
        attempts++;
        log('ata', `RPC not synced yet, retrying (${attempts}/5)…`);
        await delay(2000);
      } else {
        throw err;
      }
    }
  }
  if (!userTokenAccount) {
    throw new Error('RPC failed to sync the new token account after 5 attempts.');
  }

  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('token_treasury_v2')],
    program.programId,
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(TOKEN_MINT, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID);

  if (WEEKS < 4 || WEEKS % 4 !== 0) {
    throw new Error(`Invalid subscription duration: ${WEEKS} weeks. Must be a multiple of 4.`);
  }

  log('subscribe', `on-chain subscribe: level ${SERVICE_LEVEL}, duration ${WEEKS} weeks`);

  // program.methods is index-signature typed here because we load the IDL as a
  // generic anchor.Idl (no generated Txoracle TS type ships in docs/txline/).
  // The non-null assertion is safe: `subscribe` is a fixed instruction name
  // verified directly against the IDL's instructions array above.
  const tx = await program.methods
    .subscribe!(SERVICE_LEVEL, WEEKS)
    .accounts({
      user: user.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: TOKEN_MINT,
      userTokenAccount: userTokenAccount.address,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const latestBlockhash = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = user.publicKey;
  tx.sign(user);

  const txSig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(
    { signature: txSig, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
    'confirmed',
  );
  log('subscribe', `transaction confirmed: ${txSig}`);

  return { txSig, userTokenAccountAddress: userTokenAccount.address };
}

/**
 * Builds the activation binding EXACTLY as users.ts does:
 *   messageString = `${txSig}:${selectedLeagues.join(",")}:${jwt}`
 * signed detached with the wallet's secret key, base64-encoded, POSTed to
 * /api/token/activate with the JWT as Bearer auth.
 */
async function activate(txSig: string, jwt: string, user: Keypair): Promise<string> {
  const messageString = `${txSig}:${SELECTED_LEAGUES.join(',')}:${jwt}`;
  const message = new TextEncoder().encode(messageString);
  const signatureBytes = nacl.sign.detached(message, user.secretKey);
  const signatureBase64 = Buffer.from(signatureBytes).toString('base64');

  const activationUrl = `${API_BASE}/token/activate`;
  log('activate', `POST ${activationUrl}`);
  const res = await fetch(activationUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ txSig, walletSignature: signatureBase64, leagues: SELECTED_LEAGUES }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`activation failed: ${res.status} ${text.slice(0, 300)}`);
  }
  // openapi.yaml documents a text/plain token response; users.ts also tolerates a JSON { token }.
  let apiToken: string;
  try {
    const parsed = JSON.parse(text);
    apiToken = typeof parsed === 'string' ? parsed : (parsed.token ?? parsed);
  } catch {
    apiToken = text.trim();
  }
  log('activate', `status ${res.status} — token acquired (prefix ${apiToken.slice(0, 8)}…, ${apiToken.length} chars)`);
  return apiToken;
}

interface FixtureRecord {
  Ts: number;
  StartTime: number;
  Competition: string;
  CompetitionId: number;
  FixtureGroupId: number;
  Participant1Id: number;
  Participant1: string;
  Participant2Id: number;
  Participant2: string;
  FixtureId: number;
  Participant1IsHome: boolean;
}

async function verifyFixtures(jwt: string, apiToken: string): Promise<FixtureRecord[]> {
  const epochDay = Math.floor(Date.now() / 86_400_000);
  // World Cup 2026 competitionId per docs/txline example (72). Query a small window
  // starting a day back to be safe against timezone edges, covering through Jul 6.
  const startEpochDay = epochDay - 1;
  const url = `${API_BASE}/fixtures/snapshot?competitionId=72&startEpochDay=${startEpochDay}`;
  log('fixtures', `GET ${url}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}`, 'X-Api-Token': apiToken },
  });
  const text = await res.text();
  log('fixtures', `status ${res.status}`);
  if (!res.ok) {
    log('fixtures', `body: ${text.slice(0, 500)}`);
    return [];
  }
  const fixtures = JSON.parse(text) as FixtureRecord[];
  log('fixtures', `received ${fixtures.length} fixtures`);

  const wanted = fixtures.filter((f) =>
    WANTED_FIXTURES.some((name) => f.Participant1.includes(name) || f.Participant2.includes(name)),
  );

  console.log('\n=== World Cup fixtures found (filtered to requested teams) ===');
  for (const f of wanted) {
    const kickoff = new Date(f.StartTime).toISOString();
    console.log(`  ${f.FixtureId}  ${f.Participant1} vs ${f.Participant2}  kickoff ${kickoff}`);
  }
  if (wanted.length === 0 && fixtures.length > 0) {
    console.log('  (none of the named teams matched — printing all received fixtures instead)');
    for (const f of fixtures) {
      const kickoff = new Date(f.StartTime).toISOString();
      console.log(`  ${f.FixtureId}  ${f.Participant1} vs ${f.Participant2}  kickoff ${kickoff}`);
    }
  }
  console.log('');

  return fixtures;
}

interface StreamStats {
  url: string;
  events: number;
  heartbeats: number;
  firstSampleFields: string[] | null;
}

/**
 * Connects to an SSE endpoint with both auth headers for durationMs, counting
 * events and writing raw samples to STREAM_SAMPLE_PATH. Reuses the same
 * line-based SSE parsing approach as scripts/record.ts.
 */
async function streamTest(url: string, jwt: string, apiToken: string, durationMs: number): Promise<StreamStats> {
  log('stream', `connecting ${url} for ${durationMs / 1000}s…`);
  mkdirSync('fixtures', { recursive: true });
  const sink = createWriteStream(STREAM_SAMPLE_PATH, { flags: 'a' });

  const stats: StreamStats = { url, events: 0, heartbeats: 0, firstSampleFields: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), durationMs);

  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/event-stream', Authorization: `Bearer ${jwt}`, 'X-Api-Token': apiToken },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '');
      log('stream', `HTTP ${res.status} ${res.statusText}; body: ${body.slice(0, 300)}`);
      clearTimeout(timer);
      return stats;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let event = 'message';
    let dataLines: string[] = [];

    const write = (ev: string, data: string) => {
      sink.write(JSON.stringify({ receivedAtMs: Date.now(), event: ev, data }) + '\n');
      if (ev === 'heartbeat') {
        stats.heartbeats++;
      } else {
        stats.events++;
        if (!stats.firstSampleFields) {
          try {
            const parsed = JSON.parse(data);
            stats.firstSampleFields = Object.keys(parsed);
          } catch {
            // non-JSON payload; leave firstSampleFields null
          }
        }
      }
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).replace(/\r$/, '');
          buf = buf.slice(nl + 1);
          if (line === '') {
            if (dataLines.length) write(event, dataLines.join('\n'));
            event = 'message';
            dataLines = [];
          } else if (line.startsWith('event:')) {
            event = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        log('stream', `read error: ${String(err).slice(0, 150)}`);
      }
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      log('stream', `connection error: ${String(err).slice(0, 150)}`);
    }
  } finally {
    clearTimeout(timer);
  }

  log('stream', `${url} — ${stats.events} data events, ${stats.heartbeats} heartbeats in ${durationMs / 1000}s`);
  return stats;
}

async function main() {
  log('start', `API=${API} RPC=${RPC} level=${SERVICE_LEVEL} weeks=${WEEKS}`);
  const user = loadKeypair();
  const connection = new Connection(RPC, 'confirmed');

  // Fast path: an activated token already exists — skip straight to verify + stream.
  if (existsSync(TOKEN_PATH)) {
    const saved = JSON.parse(readFileSync(TOKEN_PATH, 'utf8')) as { apiToken: string; jwt: string };
    log('token', `reusing ${TOKEN_PATH} (prefix ${saved.apiToken.slice(0, 8)}…) — skipping on-chain subscribe`);
    await verifyFixtures(saved.jwt, saved.apiToken);
    const [oddsStats, scoresStats] = await Promise.all([
      streamTest(`${API_BASE}/odds/stream`, saved.jwt, saved.apiToken, STREAM_DURATION_MS),
      streamTest(`${API_BASE}/scores/stream`, saved.jwt, saved.apiToken, STREAM_DURATION_MS),
    ]);
    console.log('\n=== Stream test summary ===');
    console.log(`  odds:   ${oddsStats.events} events, ${oddsStats.heartbeats} heartbeats — sample fields: ${oddsStats.firstSampleFields?.join(', ') ?? '(none received)'}`);
    console.log(`  scores: ${scoresStats.events} events, ${scoresStats.heartbeats} heartbeats — sample fields: ${scoresStats.firstSampleFields?.join(', ') ?? '(none received)'}`);
    console.log(`  raw samples written to ${STREAM_SAMPLE_PATH}\n`);
    return;
  }

  // Step 1/2: JWT + SOL
  const jwt = await loadOrRefreshJwt();
  const funded = await ensureSol(connection, user.publicKey);
  if (!funded) {
    console.error('');
    console.error(`faucet dry — manual top-up needed at https://faucet.solana.com for ${user.publicKey.toBase58()}`);
    console.error('');
    log('halt', 'stopping after steps 1 (JWT) — SOL required for on-chain subscribe. Testing which read endpoints work with guest JWT alone before exiting…');
    await guestOnlyProbe(jwt);
    process.exitCode = 2;
    return;
  }

  // Step 3: on-chain subscribe
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(user), { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const idlWithDevnetAddress = { ...(txoracleIdl as anchor.Idl), address: PROGRAM_ID.toBase58() };
  const program = new anchor.Program(idlWithDevnetAddress, provider);

  const { txSig } = await subscribeOnChain(connection, program, user);

  // Step 4: activation
  const apiToken = await activate(txSig, jwt, user);

  // Step 5: save token
  mkdirSync('.secrets', { recursive: true });
  writeFileSync(
    TOKEN_PATH,
    JSON.stringify({ apiToken, jwt, obtainedAt: new Date().toISOString(), serviceLevel: SERVICE_LEVEL }, null, 2),
  );
  log('save', `saved ${TOKEN_PATH} (token prefix ${apiToken.slice(0, 8)}…)`);

  // Step 6: verify fixtures
  await verifyFixtures(jwt, apiToken);

  // Step 7: stream test (odds + scores in parallel, ~60s)
  const [oddsStats, scoresStats] = await Promise.all([
    streamTest(`${API_BASE}/odds/stream`, jwt, apiToken, STREAM_DURATION_MS),
    streamTest(`${API_BASE}/scores/stream`, jwt, apiToken, STREAM_DURATION_MS),
  ]);

  console.log('\n=== Stream test summary ===');
  console.log(`  odds:   ${oddsStats.events} events, ${oddsStats.heartbeats} heartbeats — sample fields: ${oddsStats.firstSampleFields?.join(', ') ?? '(none received)'}`);
  console.log(`  scores: ${scoresStats.events} events, ${scoresStats.heartbeats} heartbeats — sample fields: ${scoresStats.firstSampleFields?.join(', ') ?? '(none received)'}`);
  console.log(`  raw samples written to ${STREAM_SAMPLE_PATH}\n`);

  log('done', 'subscribe → activate → verify → stream test complete.');
}

/**
 * Runs when the faucet is dry and we have no SOL for on-chain subscribe.
 * Per task instructions: test which read endpoints work with guest JWT alone
 * (no X-Api-Token) and report which ones do.
 */
async function guestOnlyProbe(jwt: string): Promise<void> {
  const url = `${API_BASE}/fixtures/snapshot?competitionId=72`;
  log('probe', `GET ${url} (JWT only, no X-Api-Token)`);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
    const text = await res.text();
    log('probe', `status ${res.status} — ${res.ok ? 'guest JWT alone WORKS for this endpoint' : 'requires X-Api-Token as documented'}`);
    log('probe', `body (first 300 chars): ${text.slice(0, 300)}`);
  } catch (e) {
    log('probe', `request failed: ${String(e).slice(0, 150)}`);
  }
}

main().catch((e) => {
  console.error('[subscribe] fatal', e);
  process.exit(1);
});
