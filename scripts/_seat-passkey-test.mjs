import assert from 'node:assert';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bs58 from 'bs58'; // Node dev-only reference implementation, for the cross-check below
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.resolve(__dirname, '../apps/web/public/seat-passkey.js');
const m = new Module(p); m.filename = p; m.paths = Module._nodeModulePaths(path.dirname(p));
m._compile(fs.readFileSync(p, 'utf8'), p);
const { keyFromPrf, b58encode } = m.exports;

const seed = new Uint8Array(32).fill(7);
const a = keyFromPrf(seed), b = keyFromPrf(seed);
assert.equal(a.pubkey, b.pubkey, 'deterministic: same PRF bytes → same pubkey');
assert.equal(typeof a.pubkey, 'string'); assert.ok(a.pubkey.length >= 32 && a.pubkey.length <= 44, 'base58 pubkey length');
const c = keyFromPrf(new Uint8Array(32).fill(9));
assert.notEqual(a.pubkey, c.pubkey, 'different bytes → different pubkey');
console.log('OK keyFromPrf deterministic + distinct');

// base58 correctness cross-check: the inline b58encode (no browser build of bs58 exists, so
// seat-passkey.js can't depend on it) must match bs58.encode exactly, including the
// leading-zero-byte -> leading-'1' edge case a naive from-scratch port tends to get wrong.
const b58Cases = [
  new Uint8Array(32).fill(7),
  new Uint8Array(32).fill(9),
  new Uint8Array(32).fill(0),                                          // all leading zeros (classic off-by-one trap)
  new Uint8Array([0, 0, 0, 1, 2, 3, 250, 251, 252, 253, 254, 255]),     // leading zeros + a real suffix
  new Uint8Array([0]),                                                  // single zero byte
  new Uint8Array([1, 0, 0]),                                            // zero bytes NOT at the front -> no leading '1's
  new Uint8Array([255, 255, 255, 255]),
  new Uint8Array(0),                                                    // empty
  (function () { var r = new Uint8Array(32); for (let i = 0; i < 32; i++) r[i] = (i * 37 + 11) % 256; return r; })(),
];
for (const bytes of b58Cases) {
  const got = b58encode(bytes);
  const want = bs58.encode(bytes);
  assert.equal(got, want, 'b58encode must match bs58.encode for [' + Array.from(bytes).join(',') + ']');
}
console.log('OK b58encode matches bs58.encode, incl. leading-zero cases (' + b58Cases.length + ' vectors)');
