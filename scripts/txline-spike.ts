/**
 * TxLINE auth spike — devnet.
 *
 * Documented flow (docs/txline/, verify against the fetched OpenAPI before trusting):
 *   1. POST {API}/auth/guest/start                    → guest JWT
 *   2. on-chain subscribe(serviceLevelId, weeks)      → txoracle program (devnet)
 *   3. sign `${txSig}::${jwt}` with the same keypair  → POST {API}/api/token/activate
 *   4. call data endpoints with Bearer jwt + X-Api-Token
 *
 * This spike walks the steps, logs every response verbatim to docs/txline/probe/,
 * and stops loudly at the first shape it doesn't recognize — no guessing.
 * Keypair + tokens land in .secrets/ (gitignored). Devnet only.
 */
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const API = process.env.TXLINE_API ?? 'https://txline-dev.txodds.com';
const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';
const SERVICE_LEVEL = Number(process.env.TXLINE_LEVEL ?? 12); // World Cup real-time, free
const PROBE_DIR = 'docs/txline/probe';
const KEY_PATH = '.secrets/rooot-devnet.json';

function log(step: string, msg: string) {
  console.log(`[spike:${step}] ${msg}`);
}

function saveProbe(name: string, body: string) {
  mkdirSync(PROBE_DIR, { recursive: true });
  writeFileSync(`${PROBE_DIR}/${name}`, body);
  log('probe', `saved ${PROBE_DIR}/${name} (${body.length}b)`);
}

function loadOrCreateKeypair(): Keypair {
  mkdirSync('.secrets', { recursive: true });
  if (existsSync(KEY_PATH)) {
    const raw = JSON.parse(readFileSync(KEY_PATH, 'utf8')) as number[];
    log('key', `loaded ${KEY_PATH}`);
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const kp = Keypair.generate();
  writeFileSync(KEY_PATH, JSON.stringify(Array.from(kp.secretKey)));
  log('key', `generated ${KEY_PATH}`);
  return kp;
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const url = `${API}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, url };
}

async function main() {
  log('start', `API=${API} RPC=${RPC} level=${SERVICE_LEVEL}`);
  const kp = loadOrCreateKeypair();
  log('key', `pubkey ${kp.publicKey.toBase58()}`);

  // Step 0 — devnet balance / airdrop
  const conn = new Connection(RPC, 'confirmed');
  const bal = await conn.getBalance(kp.publicKey);
  log('sol', `balance ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (bal < 0.05 * LAMPORTS_PER_SOL) {
    log('sol', 'requesting devnet airdrop (1 SOL)…');
    try {
      const sig = await conn.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, 'confirmed');
      log('sol', `airdrop confirmed ${sig.slice(0, 16)}…`);
    } catch (e) {
      log('sol', `airdrop failed (${String(e).slice(0, 120)}) — faucet may be dry; continue, subscribe will tell us`);
    }
  }

  // Step 1 — guest JWT (try documented paths; record everything)
  const guestPaths = ['/auth/guest/start', '/api/auth/guest/start'];
  let jwt: string | null = null;
  for (const p of guestPaths) {
    const bodies: unknown[] = [{ wallet: kp.publicKey.toBase58() }, {}, undefined];
    for (const b of bodies) {
      try {
        const r = await post(p, b);
        saveProbe(`guest-start${p.replace(/\//g, '_')}-${b === undefined ? 'nobody' : 'body' + JSON.stringify(b).length}.txt`, `POST ${r.url}\nstatus ${r.status}\n\n${r.text}`);
        log('guest', `POST ${p} (${b === undefined ? 'no body' : JSON.stringify(b)}) → ${r.status}`);
        if (r.status >= 200 && r.status < 300) {
          try {
            const j = JSON.parse(r.text) as Record<string, unknown>;
            const cand = j['jwt'] ?? j['token'] ?? j['accessToken'] ?? (j['data'] as Record<string, unknown> | undefined)?.['jwt'];
            if (typeof cand === 'string') {
              jwt = cand;
              log('guest', `JWT acquired (${jwt.length} chars) via ${p}`);
            } else {
              log('guest', `2xx but no jwt-shaped field — inspect probe file. keys: ${Object.keys(j).join(', ')}`);
            }
          } catch {
            log('guest', '2xx but non-JSON body — inspect probe file');
          }
        }
        if (jwt) break;
      } catch (e) {
        log('guest', `POST ${p} failed: ${String(e).slice(0, 120)}`);
      }
    }
    if (jwt) break;
  }

  if (!jwt) {
    log('halt', 'no guest JWT — read docs/txline/probe/* and the fetched OpenAPI, then adjust. NOT guessing further.');
    process.exit(2);
  }
  writeFileSync('.secrets/txline-guest.json', JSON.stringify({ jwt, at: new Date().toISOString() }));

  // Step 2/3 — on-chain subscribe + activate: requires the txoracle IDL (docs/txline/).
  log('next', 'JWT saved to .secrets/txline-guest.json.');
  log('next', 'Step 2 (subscribe tx) needs the IDL from docs/txline/ or github.com/txodds/tx-on-chain — implement against the real IDL, then sign `${txSig}::${jwt}` → POST /api/token/activate.');
}

main().catch((e) => {
  console.error('[spike] fatal', e);
  process.exit(1);
});
