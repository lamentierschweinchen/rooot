import assert from 'node:assert';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.resolve(__dirname, '../apps/web/public/seat-passkey.js');
const m = new Module(p); m.filename = p; m.paths = Module._nodeModulePaths(path.dirname(p));
m._compile(fs.readFileSync(p, 'utf8'), p);
const { keyFromPrf } = m.exports;

const seed = new Uint8Array(32).fill(7);
const a = keyFromPrf(seed), b = keyFromPrf(seed);
assert.equal(a.pubkey, b.pubkey, 'deterministic: same PRF bytes → same pubkey');
assert.equal(typeof a.pubkey, 'string'); assert.ok(a.pubkey.length >= 32 && a.pubkey.length <= 44, 'base58 pubkey length');
const c = keyFromPrf(new Uint8Array(32).fill(9));
assert.notEqual(a.pubkey, c.pubkey, 'different bytes → different pubkey');
console.log('OK keyFromPrf deterministic + distinct');
