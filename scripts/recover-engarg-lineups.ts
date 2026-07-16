/**
 * ROOOT recover-engarg-lineups — recovers the ONE-SHOT `Action:"lineups"`
 * envelope for fixture 18241006 (ENG-ARG) from the TxLINE scores snapshot
 * endpoint, and saves it into fixtures/live-eng-arg/ where scripts/bake-engarg.ts
 * reads it to fill the stadium TEAM SHEET + name the whistle/bench events.
 *
 * WHY this exists: the ENG-ARG recording in fixtures/live-eng-arg/*.jsonl started
 * ~18:54Z — AFTER the one-shot lineups envelope broadcast ~45min pre-kickoff. SSE
 * never replays past events, so the recording carries zero lineups. The live
 * server recovers lineups the exact same way this script does: it fetches
 * /api/scores/snapshot/{fid}, which (for finished fixtures) still carries the
 * single `Action:"lineups"` envelope. This mirrors services/stands/src/ingest/
 * txline.ts `seedSnapshot` (lines ~600-717), proven for finished fixtures
 * 18222446 + 18213979 in services/stands/src/dev/xi-seed-recovery-check.ts.
 *
 * SECRETS (AGENTS.md law 5): the token-load + header-build below are copied
 * verbatim from txline.ts (loadToken + the headers object). The token is read
 * from .secrets/txline-token.json via fs IN PROCESS and only ever appears inside
 * the fetch() headers — never in argv, never logged, never written to disk.
 *
 * AGED-OUT: the match finished Jul 15. If the snapshot no longer carries a
 * parseable lineups envelope, this script does NOT fabricate one — it exits
 * non-zero with diagnostics (law 1: never invent roster data).
 *
 * Run: npx tsx scripts/recover-engarg-lineups.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLineups } from '../contracts/normalize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** ENG-ARG — fixture 18241006 (see docs/DATA.md / apps/web/public/fixture.json). */
const FIXTURE_ID = 18241006;
const TXLINE_API = process.env.TXLINE_API ?? 'https://txline-dev.txodds.com';
const TOKEN_FILE = process.env.TXLINE_TOKEN_FILE ?? path.join(ROOT, '.secrets/txline-token.json');
const OUT_FILE = path.join(ROOT, 'fixtures/live-eng-arg/lineups-engarg.jsonl');

/* ── token + headers: copied verbatim from services/stands/src/ingest/txline.ts
 * so the token stays in-process. loadToken lets readFileSync throw with the PATH
 * only, never the contents; the values live solely inside the headers object. ── */
interface TxLineToken {
  jwt: string;
  apiToken: string;
}
function loadToken(): TxLineToken {
  const raw = fs.readFileSync(TOKEN_FILE, 'utf8'); // path only in errors, never contents
  const parsed = JSON.parse(raw) as Partial<TxLineToken>;
  if (typeof parsed.jwt !== 'string' || typeof parsed.apiToken !== 'string') {
    throw new Error(`TXLINE_TOKEN_FILE (${TOKEN_FILE}) missing jwt/apiToken fields`);
  }
  return { jwt: parsed.jwt, apiToken: parsed.apiToken };
}

async function main(): Promise<void> {
  const token = loadToken();
  const headers = {
    Authorization: `Bearer ${token.jwt}`,
    'X-Api-Token': token.apiToken,
    Accept: 'application/json',
  };

  const url = `${TXLINE_API}/api/scores/snapshot/${FIXTURE_ID}`;
  console.log(`[recover-engarg-lineups] GET ${TXLINE_API}/api/scores/snapshot/${FIXTURE_ID} …`);

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    console.error(`[recover-engarg-lineups] FETCH FAILED (network/DNS/timeout, not aged-out): ${(e as Error).message}`);
    process.exit(2);
  }
  if (!res.ok) {
    console.error(`[recover-engarg-lineups] snapshot HTTP ${res.status} ${res.statusText} — cannot recover. (Auth/endpoint issue, not aged-out.)`);
    process.exit(2);
  }

  let arr: unknown;
  try {
    arr = await res.json();
  } catch (e) {
    console.error(`[recover-engarg-lineups] snapshot body was not JSON: ${(e as Error).message}`);
    process.exit(2);
  }
  if (!Array.isArray(arr)) {
    console.error('[recover-engarg-lineups] snapshot was not a JSON array — unexpected shape.');
    process.exit(2);
  }
  console.log(`[recover-engarg-lineups] snapshot returned ${arr.length} envelopes.`);

  // The honest test: run the REAL parseLineups on every envelope. Keep only those
  // that yield a genuine roster (byPlayerId non-empty). No Action==='lineups' guess
  // — parseLineups itself requires it, and this is exactly what the bake will run.
  const recovered: { env: unknown; roster: ReturnType<typeof parseLineups> }[] = [];
  for (const env of arr) {
    const roster = parseLineups(JSON.stringify(env));
    if (roster && roster.fixtureId === FIXTURE_ID) recovered.push({ env, roster });
  }

  if (recovered.length === 0) {
    const actions = [...new Set((arr as Array<{ Action?: unknown }>).map((e) => (e && typeof e === 'object' ? e.Action : undefined)))];
    console.error(
      `[recover-engarg-lineups] AGED OUT / UNRECOVERABLE: snapshot for ${FIXTURE_ID} carries NO ` +
        `parseable lineups envelope (${arr.length} envelopes; distinct Action values: ${JSON.stringify(actions)}). ` +
        `Match finished Jul 15 — the one-shot lineups appears to have dropped from the snapshot. ` +
        `NOT fabricating roster data (AGENTS.md law 1). Stopping — coordinator decides the fallback.`,
    );
    process.exit(3);
  }

  // Write each recovered lineups envelope in the SAME RawLine shape the recorder
  // uses ({receivedAtMs, event, data:<stringified envelope>}), so bake-engarg's
  // bakeFile() consumes it byte-for-byte like the scores/odds files.
  const lines: string[] = [];
  for (const { env, roster } of recovered) {
    const ts = typeof (env as { Ts?: unknown }).Ts === 'number' ? (env as { Ts: number }).Ts : Date.now();
    lines.push(JSON.stringify({ receivedAtMs: ts, event: 'message', data: JSON.stringify(env) }));
    const home = roster!.lineup?.home.length ?? 0;
    const away = roster!.lineup?.away.length ?? 0;
    console.log(`[recover-engarg-lineups] recovered lineups envelope: ${roster!.byPlayerId.size} players, starting XI ${home}v${away}.`);
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, lines.join('\n') + '\n', 'utf8');
  console.log(`[recover-engarg-lineups] wrote ${OUT_FILE} (${lines.length} line(s), ${fs.statSync(OUT_FILE).size} bytes).`);
}

main().catch((err) => {
  console.error('[recover-engarg-lineups] fatal:', (err as Error).message);
  process.exit(1);
});
