import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// isolate BEFORE import — the store resolves its dir from env at module load
// (same discipline as profile-store).
const dir = mkdtempSync(path.join(tmpdir(), 'rooot-minted-store-test-'));
process.env.ROOOT_SEAT_DIR = dir;
const { loadMintMarker, saveMintMarker } = await import('./minted-store');

const PK = 'FanKey111111111111111111111111111111111111';

assert.strictEqual(loadMintMarker(PK, '18202783'), null, 'absent marker reads null, never fabricated');
console.log('OK absent marker is null');

const marker = { asset: 'Asset111', txUrl: 'https://explorer.solana.com/tx/x?cluster=devnet', mintedAtMs: 123 };
saveMintMarker(PK, '18202783', marker);
assert.deepEqual(loadMintMarker(PK, '18202783'), marker, 'marker round-trips exactly');
console.log('OK marker round-trips');

assert.strictEqual(loadMintMarker(PK, '18209181'), null, 'a different match has no marker — per (pubkey, matchId), not per pubkey');
console.log('OK marker is per (pubkey, matchId)');

assert.throws(() => saveMintMarker('../evil', 'x', marker), /invalid marker key/, 'rejects path-traversal pubkey');
assert.throws(() => saveMintMarker(PK, '../evil', marker), /invalid marker key/, 'rejects path-traversal matchId');
console.log('OK rejects traversal keys');

rmSync(dir, { recursive: true, force: true });
