import assert from 'node:assert';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.resolve(__dirname, '../apps/web/public/seat-adapter.js');
const m = new Module(p); m.filename = p; m.paths = Module._nodeModulePaths(path.dirname(p));
m._compile(fs.readFileSync(p, 'utf8'), p);
const { nextSeat, resolveMechanism } = m.exports;

// fresh state is anonymous
let s = nextSeat(undefined, { type: 'reset' });
assert.equal(s.status, 'anon'); assert.equal(s.pubkey, null);
console.log('OK fresh state anon');

// claiming sets pubkey + method
s = nextSeat(s, { type: 'claimed', pubkey: 'FanPubKey111', method: 'passkey' });
assert.equal(s.status, 'claimed'); assert.equal(s.pubkey, 'FanPubKey111'); assert.equal(s.method, 'passkey');
console.log('OK claimed');

// resolveMechanism(passkey, privyClaim, id): passkey hero, Privy fallback seam.
// Fakes stand in for window.seatPasskey/window.__seatPrivyClaim -- no real WebAuthn
// or fetch involved, just the documented {supportsPrf, passkeyClaim} / (id)=>promise
// shapes Task 10/Task 7 produce. This is what exercises the error-handling nuance
// (prf-unsupported falls through; a genuine rejection does not) without a mock of
// WebAuthn or fetch itself.

// passkey supported + resolves -> used directly, Privy never even touched
{
  let privyCalled = false;
  const passkey = {
    supportsPrf: () => Promise.resolve(true),
    passkeyClaim: (id) => Promise.resolve({ pubkey: 'PK-' + id, method: 'passkey' }),
  };
  const privy = () => { privyCalled = true; return Promise.reject(new Error('should not be called')); };
  const res = await resolveMechanism(passkey, privy, 'anon-1');
  assert.deepEqual(res, { pubkey: 'PK-anon-1', method: 'passkey' });
  assert.equal(privyCalled, false);
  console.log('OK resolveMechanism: passkey resolves, Privy untouched');
}

// passkey rejects 'prf-unsupported' -> falls through to Privy
{
  const passkey = {
    supportsPrf: () => Promise.resolve(true),
    passkeyClaim: () => Promise.reject(new Error('prf-unsupported')),
  };
  const privy = (id) => Promise.resolve({ pubkey: 'PR-' + id, method: 'privy' });
  const res = await resolveMechanism(passkey, privy, 'anon-2');
  assert.deepEqual(res, { pubkey: 'PR-anon-2', method: 'privy' });
  console.log('OK resolveMechanism: prf-unsupported falls through to Privy');
}

// passkey rejects with a genuine WebAuthn rejection (e.g. the fan cancelled) -> the
// whole thing REJECTS -- it must NOT silently fall back to Privy on a cancel.
{
  let privyCalled = false;
  const passkey = {
    supportsPrf: () => Promise.resolve(true),
    passkeyClaim: () => Promise.reject(new Error('NotAllowedError')),
  };
  const privy = () => { privyCalled = true; return Promise.resolve({ pubkey: 'SHOULD-NOT-HAPPEN', method: 'privy' }); };
  await assert.rejects(() => resolveMechanism(passkey, privy, 'anon-3'), (err) => err.message === 'NotAllowedError');
  assert.equal(privyCalled, false);
  console.log('OK resolveMechanism: a genuine WebAuthn rejection surfaces, no silent fallback');
}

// no passkey support (coarse supportsPrf() false) -> straight to Privy
{
  const passkey = { supportsPrf: () => Promise.resolve(false), passkeyClaim: () => Promise.reject(new Error('should not be called')) };
  const privy = (id) => Promise.resolve({ pubkey: 'PR2-' + id, method: 'privy' });
  const res = await resolveMechanism(passkey, privy, 'anon-4');
  assert.deepEqual(res, { pubkey: 'PR2-anon-4', method: 'privy' });
  console.log('OK resolveMechanism: unsupported device skips straight to Privy');
}

// neither passkey nor Privy present -> rejects claim-unavailable (the honest
// "can't claim on this device yet, stay anonymous" path -- mirrors what
// window.__seat.claim() does today on the preview, since Task 7 is deferred).
{
  await assert.rejects(() => resolveMechanism(undefined, undefined, 'anon-5'), (err) => err.message === 'claim-unavailable');
  console.log('OK resolveMechanism: no mechanism available -> claim-unavailable');
}
