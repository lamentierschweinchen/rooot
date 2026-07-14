/**
 * Call relayer — the receipt's anchor. A fan's CALL becomes a REAL devnet
 * memo transaction, fee-paid by the service (walletless fans), carrying the
 * claim + minute + THE MARKET'S TRIPLE AT THAT SECOND. Vindication is
 * notarized, never manufactured (docs/PRODUCT.md).
 *
 * Wallet: RELAYER_KEYPAIR env (JSON number-array, e.g. via
 *   `fly secrets set RELAYER_KEYPAIR="$(cat .secrets/rooot-devnet.json)"`)
 * falls back to RELAYER_KEYPAIR_FILE (default ../../.secrets/rooot-devnet.json)
 * for local runs. Key material is read in-process and NEVER logged.
 *
 * Memo payload (JSON, ≤~200 bytes, privacy-sane): the fan appears only as a
 * sha256(anonId) prefix — pseudonymous on-chain, provable by the fan who
 * holds the anonId. Probabilities are ‰ integers (the receipt's law: the
 * market as it stood, compact and exact enough to verify against the tape).
 *
 * Failure semantics: one attempt, bounded; on any failure return the
 * existing 'PENDING-RELAYER' sentinel — the fan's receipt shows pending
 * rather than blocking the room loop. (Retry queue: TODO, post-hackathon.)
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import type { CallMsg } from '@contracts/crowd';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const RPC_URL = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';
const KEYPAIR_FILE = process.env.RELAYER_KEYPAIR_FILE ?? '../../.secrets/rooot-devnet.json';
const SEND_TIMEOUT_MS = 20_000;

let cached: { conn: Connection; payer: Keypair } | null = null;
let keyLoadFailed = false;

function relayer(): { conn: Connection; payer: Keypair } | null {
  if (cached) return cached;
  if (keyLoadFailed) return null; // don't re-stat the filesystem per call
  try {
    const rawKey = process.env.RELAYER_KEYPAIR ?? readFileSync(KEYPAIR_FILE, 'utf8');
    const secret = Uint8Array.from(JSON.parse(rawKey) as number[]);
    const payer = Keypair.fromSecretKey(secret);
    const conn = new Connection(RPC_URL, 'confirmed');
    cached = { conn, payer };
    console.log(`[relay] armed — payer ${payer.publicKey.toBase58().slice(0, 8)}… on ${RPC_URL}`);
    return cached;
  } catch (err) {
    keyLoadFailed = true;
    console.warn(`[relay] no keypair available (${(err as Error).message.split(':')[0]}) — calls will return PENDING-RELAYER`);
    return null;
  }
}

/** ‰ integer — compact, exact enough to verify against the captured tape. */
function permille(v: number): number {
  return Math.round(v * 1000);
}

/**
 * Dev/test seam — NEVER used in prod (STANDS_ANCHOR_STUB is unset there). When
 * set, `anchorRecordHash` returns a deterministic fake signature WITHOUT
 * touching devnet, so the anchor-durability check (src/dev/anchor-durability-
 * check.ts) can drive the REAL crystallize + backfill paths with a relayer that
 * "lands" a sig, on a machine with no keypair and no network. The sig is derived
 * from `${kind}:${recordHash}` so it is stable AND verifiably tied to both the
 * record it anchors and which kind anchored it (a check can recompute the exact
 * expected value and assert on it — no log-scraping needed to prove which kind
 * was used). Honest: it is visibly a `STUB…` value and logged as such — never
 * presented as a real on-chain tx. Checked BEFORE relayer() so it works with no
 * keypair loaded and can be toggled per-call (env read fresh each time). */
function stubAnchorSig(recordHash: string, kind: string): string | null {
  if (!process.env.STANDS_ANCHOR_STUB) return null;
  return `STUB${createHash('sha256').update(`${kind}:${recordHash}`).digest('hex').slice(0, 40)}`;
}

/**
 * Anchor a hash on devnet — the collectible's provenance (docs/SENTIMENT.md).
 * A tiny memo tx binding the hash to the chain, so the dataset is provable, not
 * just persisted. Best-effort; returns null on failure.
 *
 * `kind` distinguishes what's being anchored — `'sentiment'` (default, the
 * existing per-match SentimentRecord callers already use) or `'fingerprints'`
 * (the tournament-long fold, docs/DATA-ARCHITECTURE.md §4 adopt #5: "Anchor
 * fingerprints.json — same helper, new kind"). `id` is a matchId for
 * `'sentiment'`; for `'fingerprints'` there's no single match, so callers pass
 * a descriptive sentinel (server.ts passes the literal `'fingerprints'`)
 * instead — kept as a plain string rather than forcing a matchId-shaped value
 * onto an artifact that isn't per-match.
 */
export async function anchorRecordHash(id: string, recordHash: string, kind: 'sentiment' | 'fingerprints' = 'sentiment'): Promise<string | null> {
  const stub = stubAnchorSig(recordHash, kind);
  if (stub) {
    console.log(`[relay] STUB anchor for ${kind}:${id} -> ${stub.slice(0, 12)}… (STANDS_ANCHOR_STUB set; NO devnet tx)`);
    return stub;
  }
  const r = relayer();
  if (!r) return null;
  const memo = JSON.stringify({ v: 1, app: 'rooot', kind, m: id, h: recordHash });
  try {
    const ix = new TransactionInstruction({ keys: [], programId: MEMO_PROGRAM_ID, data: Buffer.from(memo, 'utf8') });
    const sig = await Promise.race([
      sendAndConfirmTransaction(r.conn, new Transaction().add(ix), [r.payer], { commitment: 'confirmed' }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('anchor timeout')), SEND_TIMEOUT_MS)),
    ]);
    console.log(`[relay] ${kind} ${id} anchored ${sig.slice(0, 12)}…`);
    return sig;
  } catch (err) {
    console.warn(`[relay] anchor failed (${(err as Error).message.slice(0, 50)})`);
    return null;
  }
}

export async function relayCall(call: CallMsg): Promise<string> {
  const r = relayer();
  if (!r) return 'PENDING-RELAYER';

  const fan = createHash('sha256').update(call.anonId).digest('hex').slice(0, 16);
  const memo = JSON.stringify({
    v: 1,
    app: 'rooot',
    m: call.matchId,
    s: call.side,
    c: call.claim,
    min: call.minute,
    p: [permille(call.marketP.home), permille(call.marketP.draw), permille(call.marketP.away)],
    fan,
    t: call.atMs,
  });

  try {
    const ix = new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo, 'utf8'),
    });
    const tx = new Transaction().add(ix);
    const sig = await Promise.race([
      sendAndConfirmTransaction(r.conn, tx, [r.payer], { commitment: 'confirmed' }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('relay timeout')), SEND_TIMEOUT_MS)),
    ]);
    console.log(`[relay] receipt landed ${sig.slice(0, 12)}… (${call.claim} @ ${call.minute ?? '?'}')`);
    return sig;
  } catch (err) {
    console.warn(`[relay] send failed (${(err as Error).message.slice(0, 60)}) — receipt pending`);
    return 'PENDING-RELAYER';
  }
}
