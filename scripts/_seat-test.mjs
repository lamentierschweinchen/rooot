import assert from 'node:assert';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.resolve(__dirname, '../apps/web/public/seat-adapter.js');
const m = new Module(p); m.filename = p; m.paths = Module._nodeModulePaths(path.dirname(p));
m._compile(fs.readFileSync(p, 'utf8'), p);
const { nextSeat, bindPayload } = m.exports;

// fresh state is anonymous
let s = nextSeat(undefined, { type: 'reset' });
assert.equal(s.status, 'anon'); assert.equal(s.pubkey, null);
console.log('OK fresh state anon');

// claiming sets pubkey + method
s = nextSeat(s, { type: 'claimed', pubkey: 'FanPubKey111', method: 'passkey' });
assert.equal(s.status, 'claimed'); assert.equal(s.pubkey, 'FanPubKey111'); assert.equal(s.method, 'passkey');
console.log('OK claimed');

// bindPayload parses a real gate pass
const pass = JSON.stringify({ side: 'h', call: { h: 2, a: 1 }, conv: 3, ts: 1 });
assert.deepEqual(bindPayload('anon-x', pass), { anonId: 'anon-x', side: 'h', call: { h: 2, a: 1 } });
console.log('OK bindPayload with pass');

// bindPayload tolerates a missing / malformed pass (anonymous fan who never called)
assert.deepEqual(bindPayload('anon-y', null), { anonId: 'anon-y', side: null, call: null });
assert.deepEqual(bindPayload('anon-z', '{bad'), { anonId: 'anon-z', side: null, call: null });
console.log('OK bindPayload tolerant');
