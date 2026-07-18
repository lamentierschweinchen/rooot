#!/usr/bin/env node
/**
 * ROOOT — anchor capture (the pruning race, 18 Jul).
 *
 * Devnet prunes fast: the ENG–ARG anchor verified alive on Jul 17 returned
 * null on public RPC by early Jul 18. So at each whistle, capture the fresh
 * anchor's full getTransaction JSON within the hour — the saved JSON (memo
 * intact) + an explorer screenshot are the durable proof the tech doc cites.
 *
 *   node scripts/capture-anchor.mjs <txSig> <matchId>
 *
 * Writes docs/pitch/evidence/anchor-<matchId>-<utcstamp>.json and prints the
 * explorer URL to screenshot. Sig source: `flyctl logs … | grep anchored`
 * right after full time (or the record file on the volume).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [sig, matchId] = process.argv.slice(2);
if (!sig || !matchId) { console.error('usage: node scripts/capture-anchor.mjs <txSig> <matchId>'); process.exit(1); }

const res = await fetch('https://api.devnet.solana.com', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }] }),
});
const body = await res.json();
if (!body.result) {
  console.error(`getTransaction returned null — the tx is not (or no longer) visible on public devnet RPC. If the whistle was recent, retry in ~30s; if hours old, the pruning window may already have closed.`);
  process.exit(2);
}
const memo = JSON.stringify(body.result.meta?.logMessages ?? []).match(/Memo[^"]*"([^"]{8,})/)?.[1] ?? null;
const dir = path.join(ROOT, 'docs/pitch/evidence');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(dir, `anchor-${matchId}-${stamp}.json`);
writeFileSync(out, JSON.stringify({ capturedAtISO: new Date().toISOString(), sig, matchId, memoExcerpt: memo, transaction: body.result }, null, 1) + '\n');
console.log(`saved ${out}`);
console.log(`slot ${body.result.slot} · memo ${memo ? 'present' : 'NOT FOUND in logs'}`);
console.log(`screenshot this within the hour: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
